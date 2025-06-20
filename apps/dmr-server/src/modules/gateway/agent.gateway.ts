import { AgentEventNames, AgentMessageDto, CentOpsEvent, ValidationErrorDto } from '@dmr/shared';
import { BadRequestException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import { Server, Socket } from 'socket.io';
import { Metrics } from '../../common/metrics';
import { RabbitMQService } from '../../libs/rabbitmq';
import { RabbitMQMessageService } from '../../libs/rabbitmq/rabbitmq-message.service';
import { AuthService } from '../auth/auth.service';
import { CentOpsService } from '../centops/centops.service';
import { CentOpsConfigurationDifference } from '../centops/interfaces/cent-ops-configuration-difference.interface';
import { MessageValidatorService } from './message-validator.service';

@WebSocketGateway({
  connectionStateRecovery: {
    maxDisconnectionDuration: Number(process.env.WEB_SOCKET_MAX_DISCONNECTION_DURATION || '120000'),
    skipMiddlewares: true,
  },
})
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private handleError: (socket: Socket) => void = () => null;

  constructor(
    @InjectMetric(Metrics.dmrSocketErrorsTotal)
    private readonly errorsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionsActive)
    private readonly activeConnectionGauge: Gauge<string>,
    @InjectMetric(Metrics.dmrSocketConnectionsTotal)
    private readonly connectionsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketDisconnectionsTotal)
    private readonly disconnectionsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionDurationSeconds)
    private readonly dmrSocketConnectionDurationSecondsHistogram: Histogram<string>,
    private readonly authService: AuthService,
    private readonly rabbitService: RabbitMQService,
    private readonly messageValidator: MessageValidatorService,
    private readonly rabbitMQMessageService: RabbitMQMessageService,
    private readonly centOpsService: CentOpsService,
  ) {}

  onModuleInit() {
    this.handleError = (socket: Socket) => {
      socket.on('error', () => {
        this.errorsTotalCounter.inc(1);
      });
    };

    this.server.on('connection', this.handleError);
  }

  onModuleDestroy() {
    this.server.off('connection', this.handleError);
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token: string = (client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace('Bearer ', '')) as string;

      const jwtPayload = await this.authService.verifyToken(token);

      const consume = await this.rabbitService.subscribe(jwtPayload.sub);

      if (!consume) {
        client.disconnect();
      }

      const centOpsConfigurations = await this.centOpsService.getCentOpsConfigurations();
      this.server.emit(AgentEventNames.FULL_AGENT_LIST, centOpsConfigurations);

      this.activeConnectionGauge.inc(1);
      this.connectionsTotalCounter.inc(1);

      Object.assign(client, { agent: Object.assign(jwtPayload, { connectedAt: Date.now() }) });
    } catch {
      this.logger.error(`Error during agent socket connection: ${client.id}`, 'AgentGateway');
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    this.activeConnectionGauge.dec(1);
    this.disconnectionsTotalCounter.inc(1);

    const agentId = client?.agent?.sub;
    const connectedAt = client?.agent?.cat;

    if (agentId) {
      await this.rabbitService.unsubscribe(agentId);
    }

    if (connectedAt) {
      const durationSeconds = (Date.now() - connectedAt) / 1000;

      this.dmrSocketConnectionDurationSecondsHistogram.observe(durationSeconds);
    }

    this.logger.log(`Agent disconnected: ${agentId} (Socket ID: ${client.id})`);
  }

  @OnEvent(CentOpsEvent.UPDATED)
  onAgentConfigUpdate(data: CentOpsConfigurationDifference): void {
    this.server.emit(AgentEventNames.PARTIAL_AGENT_LIST, [...data.added, ...data.deleted]);

    this.logger.log('Agent configurations updated and emitted to all connected clients');
  }

  @SubscribeMessage(AgentEventNames.MESSAGE_TO_DMR_SERVER)
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<void> {
    const receivedAt = new Date().toISOString();
    try {
      const result = await this.messageValidator.validateMessage(data, receivedAt);
      await this.handleValidMessage(result, receivedAt);
    } catch (error: unknown) {
      await this.handleMessageError(error);
    }
  }

  private async handleValidMessage(
    result:
      | { message: AgentMessageDto; validationErrors?: ValidationErrorDto[] }
      | null
      | undefined,
    receivedAt: string,
  ): Promise<void> {
    if (!result || !result.message) {
      throw new Error('Validation succeeded but no message was returned');
    }

    const validatedMessage: AgentMessageDto = result.message;
    await this.rabbitMQMessageService.sendValidMessage(validatedMessage, receivedAt);
    this.logger.log(
      `Received valid message from agent ${validatedMessage.senderId} to ${validatedMessage.recipientId} (ID: ${validatedMessage.id})`,
    );
  }

  private async handleMessageError(error: unknown): Promise<void> {
    if (error instanceof BadRequestException) {
      const errorData = error.getResponse() as {
        message: string;
        validationErrors: ValidationErrorDto[];
        originalMessage: unknown;
        receivedAt: string;
      };

      await this.rabbitMQMessageService.sendValidationFailure(
        errorData.originalMessage,
        errorData.validationErrors,
        errorData.receivedAt,
      );

      this.logger.warn(`Invalid message received: ${errorData.message}`);
    } else {
      this.logger.error(
        `Unexpected error processing message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
