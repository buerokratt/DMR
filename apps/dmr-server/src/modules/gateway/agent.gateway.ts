import {
  AgentEncryptedMessageDto,
  AgentEventNames,
  AgentMessageDto,
  DmrServerEvent,
  ValidationErrorDto,
} from '@dmr/shared';
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
import { Server, Socket } from 'socket.io';
import { MetricService } from '../../libs/metrics';
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
    private readonly authService: AuthService,
    private readonly rabbitService: RabbitMQService,
    private readonly messageValidator: MessageValidatorService,
    private readonly rabbitMQMessageService: RabbitMQMessageService,
    private readonly centOpsService: CentOpsService,
    private readonly metricService: MetricService,
  ) {}

  onModuleInit() {
    this.handleError = (socket: Socket) => {
      const namespace = socket.nsp.name;

      socket.onAny((event: string) => {
        if (event === 'error') {
          this.metricService.errorsTotalCounter.inc(1);
        }

        const ignored = ['ping', 'disconnect', 'connect', 'error'];
        if (!ignored.includes(event)) {
          this.metricService.eventsReceivedTotalCounter.inc({ event, namespace });
        }
      });

      socket.onAnyOutgoing((event: string) => {
        this.metricService.eventsSentTotalCounter.inc({ event, namespace: '/' });
      });
    };

    this.server.on('connection', this.handleError);

    const emit = (event: string, ...arguments_: unknown[]) => {
      this.metricService.eventsSentTotalCounter.inc({ event, namespace: '/' });

      return this.server.emit(event, ...arguments_);
    };

    this.server.emit = emit;
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

      this.metricService.activeConnectionGauge.inc(1);
      this.metricService.connectionsTotalCounter.inc(1);

      Object.assign(client, { agent: Object.assign(jwtPayload, { connectedAt: Date.now() }) });
    } catch {
      this.logger.error(`Error during agent socket connection: ${client.id}`, 'AgentGateway');
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    this.metricService.activeConnectionGauge.dec(1);
    this.metricService.disconnectionsTotalCounter.inc(1);

    const agentId = client?.agent?.sub;
    const connectedAt = client?.agent?.cat;

    if (agentId) {
      await this.rabbitService.unsubscribe(agentId);
    }

    if (connectedAt) {
      const durationSeconds = (Date.now() - connectedAt) / 1000;

      this.metricService.socketConnectionDurationSecondsHistogram.observe(durationSeconds);
    }

    this.logger.log(`Agent disconnected: ${agentId} (Socket ID: ${client.id})`);
  }

  @OnEvent(DmrServerEvent.UPDATED)
  onAgentConfigUpdate(data: CentOpsConfigurationDifference): void {
    this.server.emit(AgentEventNames.PARTIAL_AGENT_LIST, [...data.added, ...data.deleted]);

    this.logger.log('Agent configurations updated and emitted to all connected clients');
  }

  @OnEvent(DmrServerEvent.FORWARD_MESSAGE_TO_AGENT)
  onRabbitMQMessage(payload: { agentId: string; message: AgentEncryptedMessageDto }): void {
    try {
      const { agentId, message } = payload;
      const socket = this.findSocketByAgentId(agentId);
      if (!socket) {
        this.logger.warn(`No connected socket found for agent ${agentId}`);
        return;
      }
      socket.emit(AgentEventNames.MESSAGE_FROM_DMR_SERVER, message);
      this.logger.log(`Message forwarded to agent ${agentId} (Socket ID: ${socket.id})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error forwarding RabbitMQ message to agent: ${errorMessage}`);
    }
  }

  private findSocketByAgentId(agentId: string): Socket | null {
    const connectedSockets = this.server.sockets.sockets;
    for (const [, socket] of connectedSockets.entries()) {
      if (socket.agent?.sub === agentId) {
        return socket;
      }
    }
    return null;
  }

  @SubscribeMessage(AgentEventNames.MESSAGE_TO_DMR_SERVER)
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<void> {
    const receivedAt = new Date().toISOString();
    const end = this.metricService.messageProcessingDurationSecondsHistogram.startTimer({
      event: AgentEventNames.MESSAGE_TO_DMR_SERVER,
    });

    try {
      const result = await this.messageValidator.validateMessage(data, receivedAt);
      await this.handleValidMessage(result, receivedAt);
    } catch (error: unknown) {
      await this.handleMessageError(error);
    }

    end();
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
