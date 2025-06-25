import {
  AgentDecryptedMessageDto,
  AgentDto,
  AgentEncryptedMessageDto,
  AgentEventNames,
  ExternalServiceMessageDto,
  IAgent,
  IAgentList,
  MessageType,
  Utils,
} from '@dmr/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AgentConfig, agentConfig } from '../../common/config';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly AGENTS_CACHE_KEY = 'DMR_AGENTS_LIST';
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @Inject(agentConfig.KEY) private readonly agentConfig: AgentConfig,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly websocketService: WebsocketService,
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

    socket.on(AgentEventNames.MESSAGE_FROM_DMR_SERVER, (data: AgentEncryptedMessageDto, ackCb) => {
      void this.handleMessageFromDMRServerEvent(data, ackCb);
    });
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

  private async handleMessageFromDMRServerEvent(message: AgentEncryptedMessageDto): Promise<void> {
    try {
      const decryptedMessage = await this.decryptMessagePayloadFromDMRServer(message);

      if (!decryptedMessage) {
        this.logger.error(`Something went wrong while decrypting the message`);
        return;
      }

      this.logger.log('Message is decrypted');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling message from DMR Server: ${errorMessage}`);
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
        type: MessageType.Message,
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
