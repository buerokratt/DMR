import {
  AgentEventNames,
  AgentMessageDto,
  ClientConfigDto,
  DmrServerEvent,
  ISocketAckPayload,
  SocketAckResponse,
  SocketAckStatus,
  ValidationErrorDto,
  ValidationErrorType,
} from '@dmr/shared';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
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
  namespace: String(process.env.WEB_SOCKET_NAMESPACE ?? '/v1/dmr-agent-events'),
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
    @Inject(forwardRef(() => RabbitMQService))
    private readonly rabbitService: RabbitMQService,
    @Inject(forwardRef(() => RabbitMQMessageService))
    private readonly rabbitMQMessageService: RabbitMQMessageService,
    private readonly messageValidator: MessageValidatorService,
    private readonly centOpsService: CentOpsService,
    private readonly metricService: MetricService,
    private readonly authService: AuthService,
  ) {}

  onModuleInit() {
    this.handleConnectionEvent = (socket: Socket) => {
      socket.onAny((event: string) => {
        if (event === 'error') {
          this.metricService.errorsTotalCounter.inc(1);
        }

        const ignored = ['ping', 'disconnect', 'connect', 'error'];
        if (!ignored.includes(event)) {
          this.metricService.eventsReceivedTotalCounter.inc({
            event,
            namespace: socket.nsp.name,
          });
        }
      });

      socket.onAnyOutgoing((event: string) => {
        this.metricService.eventsSentTotalCounter.inc({ event, namespace: socket.nsp.name });
      });
    };

    this.server.on('connection', this.handleConnectionEvent);

    const originalServerEmit = this.server.emit.bind(this.server);

    const serverEmit: Server['emit'] = (event: string, ...arguments_: unknown[]) => {
      const sockets = this.server.sockets?.sockets;

      if (sockets) {
        for (const socket of [...sockets.values()]) {
          this.metricService.eventsSentTotalCounter.inc({ event, namespace: socket.nsp.name });
        }
      }

      return originalServerEmit(event, arguments_);
    };

    this.server.emit = serverEmit;
  }

  onModuleDestroy() {
    this.server.off('connection', this.handleConnectionEvent);
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token: string = (client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace('Bearer ', '')) as string;

      const connectionData = await this.authService.verifyToken(token);

      Object.assign(client, {
        jwtPayload: connectionData.jwtPayload,
        authenticationCertificate: connectionData.authenticationCertificate,
      });

      const existingSocket = this.findSocketByAgentId(connectionData.jwtPayload.sub);
      if (existingSocket && existingSocket.id !== client.id) {
        this.logger.log(
          `Dropping existing connection for agent ${connectionData.jwtPayload.sub} (Socket ID: ${existingSocket.id}) in favor of new connection (Socket ID: ${client.id})`,
        );
        existingSocket.disconnect();

        await this.rabbitService.unsubscribe(connectionData.jwtPayload.sub);
      }

      const queueSetup = await this.rabbitService.setupQueue(connectionData.jwtPayload.sub);
      if (!queueSetup) {
        this.logger.error(
          `Failed to set up queue for agent ${connectionData.jwtPayload.sub}`,
          'AgentGateway',
        );
        client.disconnect();
        return;
      }

      const consume = await this.rabbitService.subscribe(connectionData.jwtPayload.sub);

      if (!consume) {
        this.logger.error(
          `Failed to subscribe to queue for agent ${connectionData.jwtPayload.sub}`,
          'AgentGateway',
        );
        client.disconnect();
        return;
      }

      const centOpsConfigurations = await this.centOpsService.getCentOpsConfigurations();
      this.server.emit(AgentEventNames.FULL_AGENT_LIST, centOpsConfigurations);

      this.metricService.activeConnectionGauge.inc(1);
      this.metricService.connectionsTotalCounter.inc(1);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error during agent socket connection: ${client.id} - ${errorMessage}`,
        'AgentGateway',
      );
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    this.metricService.activeConnectionGauge.dec(1);
    this.metricService.disconnectionsTotalCounter.inc(1);

    const agentId = client?.jwtPayload?.sub;
    const connectedAt = client?.jwtPayload?.cat;

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
  async onAgentConfigUpdate(data: CentOpsConfigurationDifference): Promise<void> {
    const payload = [...data.added, ...data.deleted];

    if (payload.length !== 0) {
      this.server.emit(AgentEventNames.PARTIAL_AGENT_LIST, payload);

      this.logger.log('Agent configurations updated and emitted to all connected clients');

      await this.validateActiveConnections(data);
    }
  }

  private async validateActiveConnections(data: CentOpsConfigurationDifference): Promise<void> {
    const connectedSockets = this.server?.sockets?.sockets;

    if (!connectedSockets || connectedSockets.size === 0) {
      return;
    }

    const currentAgentConfigs = await this.centOpsService.getCentOpsConfigurations();
    const currentAgentMap = new Map(currentAgentConfigs.map((agent) => [agent.id, agent]));

    const deletedAgentIds = new Set(data.deleted.map((agent) => agent.id));
    const certificateChangedAgentIds = new Set(data.certificateChanged.map((agent) => agent.id));

    for (const [, socket] of connectedSockets.entries()) {
      await this.validateAndDisconnectSocket(
        socket,
        deletedAgentIds,
        certificateChangedAgentIds,
        currentAgentMap,
      );
    }
  }

  private async validateAndDisconnectSocket(
    socket: Socket,
    deletedAgentIds: Set<string>,
    certificateChangedAgentIds: Set<string>,
    currentAgentMap: Map<string, ClientConfigDto>,
  ): Promise<void> {
    const agentId = socket.jwtPayload?.sub;
    const connectionCertificate = socket.authenticationCertificate;

    if (!agentId || !connectionCertificate) {
      return;
    }

    let shouldDisconnect = false;
    let reason = '';

    if (deletedAgentIds.has(agentId)) {
      shouldDisconnect = true;
      reason = 'Agent no longer in authorized list';
    } else if (certificateChangedAgentIds.has(agentId)) {
      shouldDisconnect = true;
      reason = 'Agent certificate has been rotated/revoked';
    } else {
      // Defensive safety check: Verify agent exists in the fresh configuration from CentOps.
      // This catches edge cases where an agent might not be in the deleted/certificateChanged arrays
      // but is also not present in the current authorized configuration (due to data processing bugs
      // or inconsistencies in the configuration update event).
      const currentAgentConfig = currentAgentMap.get(agentId);
      if (!currentAgentConfig) {
        shouldDisconnect = true;
        reason = 'Agent not found in current authorized list';
      }
    }

    if (shouldDisconnect) {
      this.logger.warn(
        `Dropping connection for agent ${agentId} (Socket ID: ${socket.id}): ${reason}`,
      );

      try {
        await this.rabbitService.unsubscribe(agentId);
      } catch (error) {
        this.logger.error(
          `Error unsubscribing agent ${agentId} during security disconnect: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      socket.disconnect(true);
    }
  }

  public async forwardMessageToAgent(
    agentId: string,
    message: AgentMessageDto,
  ): Promise<ISocketAckPayload | null> {
    try {
      const socket = this.findSocketByAgentId(agentId);

      if (!socket) {
        this.logger.warn(`No connected socket found for agent ${agentId}`);
        return null;
      }

      const response = (await socket.emitWithAck(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        message,
      )) as ISocketAckPayload;

      if (response.status === SocketAckStatus.ERROR) {
        const errorTypes = response.errors?.map((error) => error.type) ?? [];

        if (errorTypes.includes(ValidationErrorType.DELIVERY_FAILED)) {
          await this.rabbitMQMessageService.sendValidationFailure(
            message,
            response.errors ?? [],
            message.receivedAt ?? new Date().toISOString(),
          );
        }
      }

      this.logger.log(`Message forwarded to agent ${agentId} (Socket ID: ${socket.id})`);
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error forwarding RabbitMQ message to agent: ${errorMessage}`);

      return null;
    }
  }

  private findSocketByAgentId(agentId: string): Socket | null {
    const connectedSockets = this.server?.sockets?.sockets;
    if (!connectedSockets) {
      return null;
    }
    for (const [, socket] of connectedSockets.entries()) {
      if (socket.jwtPayload?.sub === agentId) {
        return socket;
      }
    }
    return null;
  }

  @SubscribeMessage(AgentEventNames.MESSAGE_TO_DMR_SERVER)
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: unknown,
  ): Promise<SocketAckResponse> {
    let socketAckResponse: SocketAckResponse;
    const receivedAt = new Date().toISOString();
    const end = this.metricService.messageProcessingDurationSecondsHistogram.startTimer({
      event: AgentEventNames.MESSAGE_TO_DMR_SERVER,
    });

    try {
      const result = await this.messageValidator.validateMessage(data, receivedAt);
      await this.handleValidMessage(result, receivedAt);
      socketAckResponse = { status: SocketAckStatus.OK };
    } catch (error: unknown) {
      await this.handleMessageError(error);

      socketAckResponse = {
        status: SocketAckStatus.ERROR,
        error: error instanceof Error ? error.message : JSON.stringify(error),
      };
    }

    end();
    return socketAckResponse;
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
