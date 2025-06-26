import {
  AgentEventNames,
  AgentMessageDto,
  DmrServerEvent,
  ISocketAckPayload,
  SocketAckStatusEnum,
  ValidationErrorDto,
} from '@dmr/shared';
import { BadRequestException, forwardRef, Inject, Logger } from '@nestjs/common';
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
import { RabbitMQService } from '../../libs/rabbitmq';
import { RabbitMQMessageService } from '../../libs/rabbitmq/rabbitmq-message.service';
import { AuthService } from '../auth/auth.service';
import { CentOpsService } from '../centops/centops.service';
import { CentOpsConfigurationDifference } from '../centops/interfaces/cent-ops-configuration-difference.interface';
import { MessageValidatorService } from './message-validator.service';

@WebSocketGateway({
  namespace: '/v1/dmr-agent-events',
  connectionStateRecovery: {
    maxDisconnectionDuration: Number(process.env.WEB_SOCKET_MAX_DISCONNECTION_DURATION || '120000'),
    skipMiddlewares: true,
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => RabbitMQService))
    private readonly rabbitService: RabbitMQService,
    private readonly messageValidator: MessageValidatorService,
    @Inject(forwardRef(() => RabbitMQMessageService))
    private readonly rabbitMQMessageService: RabbitMQMessageService,
    private readonly centOpsService: CentOpsService,
  ) {}

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
    } catch {
      this.logger.error(`Error during agent socket connection: ${client.id}`, 'AgentGateway');
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    const agentId = client?.agent?.sub;

    if (agentId) {
      await this.rabbitService.unsubscribe(agentId);
    }

    this.logger.log(`Agent disconnected: ${agentId} (Socket ID: ${client.id})`);
  }

  @OnEvent(DmrServerEvent.UPDATED)
  onAgentConfigUpdate(data: CentOpsConfigurationDifference): void {
    this.server.emit(AgentEventNames.PARTIAL_AGENT_LIST, [...data.added, ...data.deleted]);

    this.logger.log('Agent configurations updated and emitted to all connected clients');
  }

  public async forwardMessageToAgent(agentId: string, message: AgentMessageDto): Promise<void> {
    try {
      const socket = this.findSocketByAgentId(agentId);
      if (!socket) {
        this.logger.warn(`No connected socket found for agent ${agentId}`);
        return;
      }

      const response = (await socket.emitWithAck(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        message,
      )) as ISocketAckPayload;

      if (response.status === SocketAckStatusEnum.ERROR) {
        await this.rabbitMQMessageService.sendValidationFailure(
          message,
          response.errors!,
          message.receivedAt ?? new Date().toISOString(),
        );
      }

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
