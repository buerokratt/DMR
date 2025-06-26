import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RabbitMQService } from '../../libs/rabbitmq';
import { CentOpsService } from '../centops/centops.service';
import {
  AgentEncryptedMessageDto,
  AgentEventNames,
  AgentMessageDto,
  DmrServerEvent,
  SimpleValidationFailureMessage,
  SocketAckResponse,
  SocketActEnum,
  ValidationErrorDto,
} from '@dmr/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { CentOpsConfigurationDifference } from '../centops/interfaces/cent-ops-configuration-difference.interface';
import { MessageValidatorService } from './message-validator.service';
import { RabbitMQMessageService } from '../../libs/rabbitmq/rabbitmq-message.service';
import { MetricService } from '../../libs/metrics';

@WebSocketGateway({
  namespace: '/v1/dmr-agent-events',
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
  private handleConnectionEvent: (socket: Socket) => void = () => null;

  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => RabbitMQService))
    private readonly rabbitService: RabbitMQService,
    private readonly messageValidator: MessageValidatorService,
    @Inject(forwardRef(() => RabbitMQMessageService))
    private readonly rabbitMQMessageService: RabbitMQMessageService,
    private readonly centOpsService: CentOpsService,
    private readonly metricService: MetricService,
  ) {}

  onModuleInit() {
    this.handleConnectionEvent = (socket: Socket) => {
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

    this.server.on('connection', this.handleConnectionEvent);

    const emit = (event: string, ...arguments_: unknown[]) => {
      this.metricService.eventsSentTotalCounter.inc({ event, namespace: '/' });

      return this.server.emit(event, ...arguments_);
    };

    this.server.emit = emit;
  }

  onModuleDestroy() {
    this.server.off('connection', this.handleConnectionEvent);
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token: string = (client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace('Bearer ', '')) as string;

      const jwtPayload = await this.authService.verifyToken(token);

      Object.assign(client, { agent: jwtPayload });

      const existingSocket = this.findSocketByAgentId(jwtPayload.sub);
      if (existingSocket && existingSocket.id !== client.id) {
        this.logger.log(
          `Dropping existing connection for agent ${jwtPayload.sub} (Socket ID: ${existingSocket.id}) in favor of new connection (Socket ID: ${client.id})`,
        );
        existingSocket.disconnect();

        await this.rabbitService.unsubscribe(jwtPayload.sub);
      }

      const consume = await this.rabbitService.subscribe(jwtPayload.sub);

      if (!consume) {
        client.disconnect();
        return;
      }

      const centOpsConfigurations = await this.centOpsService.getCentOpsConfigurations();
      this.server.emit(AgentEventNames.FULL_AGENT_LIST, centOpsConfigurations);

      this.metricService.activeConnectionGauge.inc(1);
      this.metricService.connectionsTotalCounter.inc(1);
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

  public forwardMessageToAgent(agentId: string, message: AgentMessageDto): void {
    try {
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
  handleMessageFromDMRAgent(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: AgentEncryptedMessageDto,
  ): SocketAckResponse {
    const agentId = client?.agent?.sub;

    try {
      if (!agentId) {
        this.logger.error(`Client not authenticated: ${client.id}`);
        return { status: SocketActEnum.ERROR, error: 'Unauthorized client' };
      }

      const queueName = agentId;

      this.rabbitService.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
        persistent: true,
      });

      this.logger.log(`Message from agent ${agentId} forwarded to queue: ${queueName}`);
      return { status: SocketActEnum.OK };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error processing message from ${agentId}: ${message}`);
      return { status: SocketActEnum.ERROR, error: message };
    }
  }

  @SubscribeMessage(AgentEventNames.MESSAGE_PROCESSING_FAILED)
  async handleError(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SimpleValidationFailureMessage,
  ) {
    await this.rabbitMQMessageService.sendValidationFailure(
      data.message,
      data.errors,
      data.receivedAt,
    );
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

  @SubscribeMessage('messageToDMR')
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: string): void {
    this.logger.log(`${client.id} sent message to DMR: ${data}`);
  }
}
