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
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
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
import { appConfig, AppConfig } from '../../common/config/app.config';
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
  private readonly CONNECTED_AGENTS_CACHE_KEY = 'DMR_CONNECTED_AGENTS';
  private readonly ACK_TIMEOUT: number;

  constructor(
    @Inject(appConfig.KEY)
    private readonly appConfig: AppConfig,
    @Inject(forwardRef(() => RabbitMQService))
    private readonly rabbitService: RabbitMQService,
    @Inject(forwardRef(() => RabbitMQMessageService))
    private readonly rabbitMQMessageService: RabbitMQMessageService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly messageValidator: MessageValidatorService,
    private readonly centOpsService: CentOpsService,
    private readonly metricService: MetricService,
    private readonly authService: AuthService,
  ) {
    this.ACK_TIMEOUT = this.appConfig.messageDeliveryTimeoutMs;
  }

  private async getConnectedAgentsMap(): Promise<Map<string, string>> {
    const agentsMap = await this.cacheManager.get<Map<string, string> | Record<string, string>>(
      this.CONNECTED_AGENTS_CACHE_KEY,
    );

    if (!agentsMap) {
      return new Map<string, string>();
    }

    // Handle case where cache returns plain object instead of Map
    if (agentsMap instanceof Map) {
      return agentsMap;
    }

    // Convert plain object to Map
    return new Map(Object.entries(agentsMap));
  }

  private async setConnectedAgent(agentId: string, socketId: string): Promise<void> {
    const agentsMap = await this.getConnectedAgentsMap();
    agentsMap.set(agentId, socketId);
    await this.cacheManager.set(this.CONNECTED_AGENTS_CACHE_KEY, agentsMap);
  }

  private async removeConnectedAgent(agentId: string): Promise<void> {
    const agentsMap = await this.getConnectedAgentsMap();
    agentsMap.delete(agentId);
    await this.cacheManager.set(this.CONNECTED_AGENTS_CACHE_KEY, agentsMap);
  }

  private async waitForServerReady(): Promise<void> {
    if (this.server?.sockets) {
      return;
    }

    await new Promise<void>((resolve) => {
      const checkServer = () => {
        if (this.server?.sockets) {
          resolve();
        } else {
          setTimeout(checkServer, 50);
        }
      };
      checkServer();
    });
  }

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
      const namespace = this.server?.sockets;

      if (namespace?.sockets) {
        for (const socket of [...namespace.sockets.values()]) {
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

      this.logger.debug(
        `Agent ${connectionData.jwtPayload.sub} authenticated successfully, setting jwtPayload on socket ${client.id}`,
      );

      Object.assign(client, {
        jwtPayload: connectionData.jwtPayload,
        authenticationCertificate: connectionData.authenticationCertificate,
      });

      this.logger.debug(`Socket ${client.id} jwtPayload set: sub=${client.jwtPayload?.sub}`);

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

      // Check for existing connections using our registry
      const agentsMap = await this.getConnectedAgentsMap();
      const existingSocketId = agentsMap.get(connectionData.jwtPayload.sub);
      if (existingSocketId && existingSocketId !== client.id) {
        this.logger.log(
          `Dropping existing connection for agent ${connectionData.jwtPayload.sub} (Socket ID: ${existingSocketId}) in favor of new connection (Socket ID: ${client.id})`,
        );
        // Disconnect the existing socket using Socket.IO room functionality
        this.server.to(existingSocketId).disconnectSockets(true);
        await this.rabbitService.unsubscribe(connectionData.jwtPayload.sub);
      }

      // Add to our socket registry
      await this.setConnectedAgent(connectionData.jwtPayload.sub, client.id);
      this.logger.debug(`Agent ${connectionData.jwtPayload.sub} added to socket registry`);

      const centOpsConfigurations = await this.centOpsService.getCentOpsConfigurations();
      this.server.emit(AgentEventNames.FULL_AGENT_LIST, centOpsConfigurations);

      this.metricService.activeConnectionGauge.inc(1);
      this.metricService.connectionsTotalCounter.inc(1);

      this.logger.log(
        `Agent ${connectionData.jwtPayload.sub} connected successfully (Socket ID: ${client.id})`,
      );
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
      await this.removeConnectedAgent(agentId);
      this.logger.debug(`Agent ${agentId} removed from socket registry`);
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
    // Use our socket registry instead of trying to access Socket.IO's internal collection
    const agentsMap = await this.getConnectedAgentsMap();

    if (agentsMap.size === 0) {
      return;
    }

    const currentAgentConfigs = await this.centOpsService.getCentOpsConfigurations();
    const currentAgentMap = new Map(currentAgentConfigs.map((agent) => [agent.id, agent]));

    const deletedAgentIds = new Set(data.deleted.map((agent) => agent.id));
    const certificateChangedAgentIds = new Set(data.certificateChanged.map((agent) => agent.id));

    // Validate each connected agent
    for (const [agentId] of agentsMap.entries()) {
      await this.validateAndDisconnectAgentById(
        agentId,
        deletedAgentIds,
        certificateChangedAgentIds,
        currentAgentMap,
      );
    }
  }

  private async validateAndDisconnectAgentById(
    agentId: string,
    deletedAgentIds: Set<string>,
    certificateChangedAgentIds: Set<string>,
    currentAgentMap: Map<string, ClientConfigDto>,
  ): Promise<void> {
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
      const currentAgentConfig = currentAgentMap.get(agentId);
      if (!currentAgentConfig) {
        shouldDisconnect = true;
        reason = 'Agent not found in current authorized list';
      }
    }

    if (shouldDisconnect) {
      this.logger.warn(`Dropping connection for agent ${agentId}: ${reason}`);

      try {
        await this.rabbitService.unsubscribe(agentId);
      } catch (error) {
        this.logger.error(
          `Error unsubscribing agent ${agentId} during security disconnect: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      // Disconnect the agent by finding and disconnecting their socket
      await this.disconnectAgentById(agentId);
    }
  }

  private async findSocketByAgentId(agentId: string): Promise<Socket | null> {
    const agentsMap = await this.getConnectedAgentsMap();
    const socketId = agentsMap.get(agentId);
    if (!socketId) return null;

    await this.waitForServerReady();

    let socket: Socket | undefined;

    //  iterating through sockets map
    const serverWithSockets = this.server as unknown as { sockets?: Map<string, Socket> };
    if (serverWithSockets.sockets) {
      socket = serverWithSockets.sockets.get(socketId);
      if (socket) {
        this.logger.debug(`Found socket through sockets map`, socket);
      }
    }

    if (socket?.connected) {
      return socket;
    }

    // Socket no longer exists or is disconnected, clean up cache
    await this.removeConnectedAgent(agentId);
    return null;
  }

  private async disconnectAgentById(agentId: string): Promise<void> {
    const socket = await this.findSocketByAgentId(agentId);

    if (socket) {
      socket.disconnect(true);
      await this.removeConnectedAgent(agentId);
      this.logger.debug(`Agent ${agentId} (Socket ID: ${socket.id}) disconnected`);
    }
  }

  public async forwardMessageToAgent(
    agentId: string,
    message: AgentMessageDto,
  ): Promise<ISocketAckPayload | null> {
    try {
      const socket = await this.findSocketByAgentId(agentId);

      if (!socket) {
        this.logger.warn(`No connected socket found for agent ${agentId}`);
        return null;
      }

      const response = (await socket
        .timeout(this.ACK_TIMEOUT)
        .emitWithAck(AgentEventNames.MESSAGE_FROM_DMR_SERVER, message)) as ISocketAckPayload;

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
