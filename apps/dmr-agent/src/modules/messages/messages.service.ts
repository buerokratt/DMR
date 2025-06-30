import {
  AgentDecryptedMessageDto,
  AgentDto,
  AgentEncryptedMessageDto,
  AgentEventNames,
  AgentMessageDto,
  ExternalServiceMessageDto,
  IAgent,
  IAgentList,
  ISocketAckCallback,
  MessageType,
  SocketAckResponse,
  SocketAckStatus,
  Utils,
  ValidationErrorType,
} from '@dmr/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { HttpService } from '@nestjs/axios';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AgentConfig, agentConfig } from '../../common/config';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable()
export class MessagesService implements OnModuleInit {
  private readonly AGENTS_CACHE_KEY = 'DMR_AGENTS_LIST';
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @Inject(agentConfig.KEY) private readonly agentConfig: AgentConfig,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly websocketService: WebsocketService,
    private readonly httpService: HttpService,
  ) {}

  onModuleInit(): void {
    this.setupSocketEventListeners();
  }

  private setupSocketEventListeners(): void {
    if (!this.websocketService.isConnected()) {
      this.logger.warn(
        'WebSocket is not connected. Will retry setting up agent event listeners when connected.',
      );
      return;
    }

    const socket = this.websocketService.getSocket();

    if (!socket) {
      this.logger.error(
        'Failed to get socket instance even though connection was reported as active',
      );
      return;
    }

    socket.on(AgentEventNames.FULL_AGENT_LIST, (data: IAgentList) => {
      void this.handleFullAgentListEvent(data);
    });

    socket.on(AgentEventNames.PARTIAL_AGENT_LIST, (data: IAgentList) => {
      void this.handlePartialAgentListEvent(data);
    });

    socket.on(
      AgentEventNames.MESSAGE_FROM_DMR_SERVER,
      (data: AgentEncryptedMessageDto, ackCb: ISocketAckCallback) => {
        void this.handleMessageFromDMRServerEvent(data, ackCb);
      },
    );
  }

  private async handleFullAgentListEvent(data: IAgentList): Promise<void> {
    try {
      const responseItems = Array.isArray(data.response) ? data.response : [];
      const validAgents: IAgent[] = [];

      for (const item of responseItems) {
        if (!item.id) continue;

        const agentDto = plainToInstance(AgentDto, item);
        const errors = await validate(agentDto);

        if (errors.length > 0) {
          this.logger.error(`Validation failed for agent: ${JSON.stringify(errors)}`);
          continue;
        }

        validAgents.push(agentDto);
      }

      await this.cacheManager.set(this.AGENTS_CACHE_KEY, validAgents);
      this.logger.log(`Received full agent list with ${validAgents.length} active agents`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling full agent list: ${errorMessage}`);
    }
  }

  private async handlePartialAgentListEvent(data: IAgentList): Promise<void> {
    try {
      const currentAgents: IAgent[] =
        (await this.cacheManager.get<IAgent[]>(this.AGENTS_CACHE_KEY)) ?? [];

      const agentMap: Map<string, IAgent> = new Map();
      currentAgents.forEach((agent: IAgent) => agentMap.set(agent.id, agent));

      const responseItems = Array.isArray(data.response) ? data.response : [];

      for (const item of responseItems) {
        if (!item.id) continue;

        const agentDto = plainToInstance(AgentDto, item);
        const errors = await validate(agentDto);

        if (errors.length > 0) {
          this.logger.error(`Validation failed for agent: ${JSON.stringify(errors)}`);
          continue;
        }

        if (agentDto.deleted) {
          agentMap.delete(agentDto.id);
        } else {
          agentMap.set(agentDto.id, agentDto);
        }
      }

      const updatedAgents = Array.from(agentMap.values());

      await this.cacheManager.set(this.AGENTS_CACHE_KEY, updatedAgents, 0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling partial agent list: ${errorMessage}`);
    }
  }

  private async handleMessageFromDMRServerEvent(
    message: AgentMessageDto,
    ackCb: ISocketAckCallback,
  ): Promise<void> {
    try {
      const decryptedMessage = await this.decryptMessagePayloadFromDMRServer(message);

      if (!decryptedMessage) {
        this.logger.error('Failed to decrypt message from DMR Server');

        return ackCb({
          status: SocketAckStatus.ERROR,
          errors: [
            {
              type: ValidationErrorType.DECRYPTION_FAILED,
              message: 'Failed to decrypt message from DMR Server',
            },
          ],
        });
      }

      const outgoingMessage: ExternalServiceMessageDto = {
        id: message.id,
        recipientId: message.recipientId,
        payload: decryptedMessage.payload,
      };

      const response = await this.handleOutgoingMessage(outgoingMessage);

      if (!response) {
        this.logger.error('Failed to deliver message to External Service');

        return ackCb({
          status: SocketAckStatus.ERROR,
          errors: [
            {
              type: ValidationErrorType.DELIVERY_FAILED,
              message: 'Failed to deliver message to External Service',
            },
          ],
        });
      }

      this.logger.log(`Successfully processed and forwarded message ${message.id}`);

      this.logger.log('Message is decrypted');

      return ackCb({ status: SocketAckStatus.OK });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling message from DMR Server: ${errorMessage}`);

      return ackCb({
        status: SocketAckStatus.ERROR,
        errors: [
          {
            type: ValidationErrorType.DELIVERY_FAILED,
            message: errorMessage,
          },
        ],
      });
    }
  }

  private async handleOutgoingMessage(message: ExternalServiceMessageDto): Promise<boolean> {
    if (!this.agentConfig.outgoingMessageEndpoint) {
      throw new Error('Outgoing message endpoint not configured');
    }
    try {
      await firstValueFrom(
        this.httpService.post(this.agentConfig.outgoingMessageEndpoint, message),
      );

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to handle outgoing message: ${errorMessage}`);

      return false;
    }
  }

  async getAgentById(id: string): Promise<IAgent | null> {
    try {
      const agents: IAgent[] = (await this.cacheManager.get<IAgent[]>(this.AGENTS_CACHE_KEY)) ?? [];
      return agents.find((agent) => agent.id === id) || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error getting agent by ID: ${errorMessage}`);
      return null;
    }
  }

  async sendEncryptedMessageToServer(message: ExternalServiceMessageDto): Promise<void> {
    const encryptedMessage = await this.encryptMessagePayloadFromExternalService(message);

    if (!encryptedMessage) {
      this.logger.error('Message not encrypted');
      throw new Error('Message not encrypted');
    }

    this.logger.log(`Message encrypted successfully`);

    if (!this.websocketService.isConnected()) {
      this.logger.error('WebSocket service is not connected to DMR server.');
      throw new BadGatewayException('WebSocket service is not connected to DMR server.');
    }

    const socket = this.websocketService.getSocket();

    if (!socket) {
      this.logger.error(
        'Failed to get socket instance even though connection was reported as active',
      );
      throw new BadGatewayException(
        'Failed to get socket instance even though connection was reported as active.',
      );
    }

    try {
      const ack = (await socket.emitWithAck(
        AgentEventNames.MESSAGE_TO_DMR_SERVER,
        encryptedMessage,
      )) as SocketAckResponse;

      if (ack.status === SocketAckStatus.ERROR) {
        this.logger.error(ack.error);
        throw new BadRequestException(ack.error);
      }

      this.logger.log('DMR Server acknowledged message');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unexpected error sending message to DMR Server';

      if (error instanceof GatewayTimeoutException || error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error(message);
      throw new BadGatewayException(message);
    }
  }

  async encryptMessagePayloadFromExternalService(
    message: ExternalServiceMessageDto,
  ): Promise<AgentEncryptedMessageDto | null> {
    try {
      const uuid = crypto.randomUUID();
      const recipient = await this.getAgentById(message.recipientId);

      if (!recipient) {
        this.logger.error(`Recipient info not found.`);
        return null;
      }

      const encryptedPayload = await Utils.encryptPayload(
        message.payload,
        this.agentConfig.privateKey,
        recipient.authenticationCertificate,
      );

      const encryptedMessage: AgentEncryptedMessageDto = {
        id: uuid,
        type: MessageType.ChatMessage,
        payload: encryptedPayload,
        recipientId: recipient.id,
        senderId: this.agentConfig.id,
        timestamp: new Date().toISOString(),
      };

      return encryptedMessage;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error encrypting message: ${errorMessage}`);
      return null;
    }
  }

  async decryptMessagePayloadFromDMRServer(
    message: AgentEncryptedMessageDto,
  ): Promise<AgentDecryptedMessageDto | null> {
    try {
      const sender = await this.getAgentById(message.senderId);

      if (!sender) {
        this.logger.error(`Sender info not found.`);
        return null;
      }

      const decryptedPayload = await Utils.decryptPayload(
        message.payload,
        sender.authenticationCertificate,
        this.agentConfig.privateKey,
      );

      const decryptedMessage: AgentDecryptedMessageDto = {
        id: message.id,
        type: message.type,
        payload: decryptedPayload.data,
        recipientId: this.agentConfig.id,
        senderId: sender.id,
        timestamp: message.timestamp,
      };

      return decryptedMessage;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);

      this.logger.error(`Error decrypting message: ${errorMessage}`);
      return null;
    }
  }
}
