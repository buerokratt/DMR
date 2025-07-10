import {
  AgentDecryptedMessageDto,
  AgentDto,
  AgentEncryptedMessageDto,
  AgentEventNames,
  ChatMessagePayloadDto,
  ClientConfigDto,
  DMRServerMessageDto,
  ExternalServiceMessageDto,
  IAgent,
  ISocketAckCallback,
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
import { webSocketConfig, WebSocketConfig } from '../../common/config/web-socket.config';
import { MetricService } from '../../libs/metrics';
import { WebsocketService } from '../websocket/websocket.service';

@Injectable()
export class MessagesService implements OnModuleInit {
  private readonly AGENTS_CACHE_KEY = 'DMR_AGENTS_LIST';
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @Inject(agentConfig.KEY) private readonly agentConfig: AgentConfig,
    @Inject(webSocketConfig.KEY) private readonly webSocketConfig: WebSocketConfig,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly websocketService: WebsocketService,
    private readonly metricService: MetricService,
    private readonly httpService: HttpService,
  ) {}

  onModuleInit(): void {
    this.setupSocketEventListeners();
  }

  setupSocketEventListeners(): void {
    const socket = this.websocketService.getSocket();

    if (!socket) {
      this.logger.error(
        'Cannot set up event listeners for agent events: Socket is not initialized',
      );
      return;
    }

    // Socket.io automatically wraps the emitted data in an array
    // So the type here is an array of arrays, ClientConfigDto[][]
    socket.on(AgentEventNames.FULL_AGENT_LIST, async (data: ClientConfigDto[][]) => {
      const endTimer = this.metricService.messageProcessingDurationSecondsHistogram.startTimer({
        event: AgentEventNames.FULL_AGENT_LIST,
      });

      await this.handleFullAgentListEvent(data[0]);

      endTimer();
    });

    socket.on(AgentEventNames.PARTIAL_AGENT_LIST, async (data: IAgent[][]) => {
      const endTimer = this.metricService.messageProcessingDurationSecondsHistogram.startTimer({
        event: AgentEventNames.PARTIAL_AGENT_LIST,
      });

      await this.handlePartialAgentListEvent(data[0]);

      endTimer();
    });

    socket.on(
      AgentEventNames.MESSAGE_FROM_DMR_SERVER,
      async (data: AgentEncryptedMessageDto, ackCallback: ISocketAckCallback) => {
        const endTimer = this.metricService.messageProcessingDurationSecondsHistogram.startTimer({
          event: AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        });

        await this.handleMessageFromDMRServerEvent(data, ackCallback);

        endTimer();
      },
    );

    this.logger.log('Successfully set up socket event listeners for agent events.');
  }

  private async handleFullAgentListEvent(data: ClientConfigDto[]): Promise<void> {
    try {
      const validAgents: ClientConfigDto[] = [];

      for (const item of data) {
        if (!item.id) continue;

        const dto = plainToInstance(ClientConfigDto, item);
        const errors = await validate(dto);

        if (errors.length > 0) {
          this.logger.error(`Validation failed for agent: ${JSON.stringify(errors)}`);
          continue;
        }

        validAgents.push(dto);
      }

      await this.cacheManager.set(this.AGENTS_CACHE_KEY, validAgents);
      this.logger.log(`Received full agent list with ${validAgents.length} active agents`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error handling full agent list: ${errorMessage}`);
    }
  }

  private async handlePartialAgentListEvent(data: IAgent[]): Promise<void> {
    try {
      const currentAgents: IAgent[] =
        (await this.cacheManager.get<IAgent[]>(this.AGENTS_CACHE_KEY)) ?? [];

      const agentMap: Map<string, IAgent> = new Map();
      currentAgents.forEach((agent: IAgent) => agentMap.set(agent.id, agent));

      for (const item of data) {
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
    message: AgentEncryptedMessageDto,
    ackCallback: ISocketAckCallback,
  ): Promise<void> {
    try {
      const decryptedMessage = await this.decryptMessagePayloadFromDMRServer(message);

      if (!decryptedMessage) {
        this.logger.error('Failed to decrypt message from DMR Server');

        return ackCallback({
          status: SocketAckStatus.ERROR,
          errors: [
            {
              type: ValidationErrorType.DECRYPTION_FAILED,
              message: 'Failed to decrypt message from DMR Server',
            },
          ],
        });
      }

      const outgoingMessage: DMRServerMessageDto = {
        id: message.id,
        senderId: message.senderId,
        recipientId: message.recipientId,
        timestamp: message.timestamp,
        type: message.type,
        payload: decryptedMessage.payload as ChatMessagePayloadDto,
      };

      const response = await this.handleOutgoingMessage(outgoingMessage);

      if (!response) {
        this.logger.error('Failed to deliver message to External Service');

        return ackCallback({
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

      return ackCallback({ status: SocketAckStatus.OK });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling message from DMR Server: ${errorMessage}`);

      return ackCallback({
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

  private async handleOutgoingMessage(
    message: ExternalServiceMessageDto | DMRServerMessageDto,
  ): Promise<boolean> {
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
    this.logger.debug(
      ` Starting sendEncryptedMessageToServer with message: ${JSON.stringify(message, null, 2)}`,
    );

    const encryptedMessage = await this.encryptMessagePayloadFromExternalService(message);

    if (!encryptedMessage) {
      this.logger.error('Message not encrypted');
      throw new Error('Message not encrypted');
    }

    this.logger.log(`Message encrypted successfully`);
    this.logger.debug(` Encrypted message: ${JSON.stringify(encryptedMessage, null, 2)}`);

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
      this.logger.debug(`Sending message to DMR server via WebSocket`);
      const ack = (await socket
        .timeout(this.webSocketConfig.ackTimeout)
        .emitWithAck(AgentEventNames.MESSAGE_TO_DMR_SERVER, encryptedMessage)) as SocketAckResponse;

      this.logger.debug(`Received ACK from DMR server: ${JSON.stringify(ack, null, 2)}`);

      if (ack.status === SocketAckStatus.ERROR) {
        this.logger.error(ack.error);
        throw new BadRequestException(ack.error);
      }

      this.logger.log('DMR Server acknowledged message');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unexpected error sending message to DMR Server';

      this.logger.error(`Error in sendEncryptedMessageToServer: ${message}`);
      this.logger.error(` Error details: ${JSON.stringify(error, null, 2)}`);

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
    this.logger.debug(`Starting encryption for message: ${JSON.stringify(message, null, 2)}`);

    try {
      const recipient = await this.getAgentById(message.recipientId);

      if (!recipient) {
        this.logger.error(`Recipient info not found for ID: ${message.recipientId}`);
        return null;
      }

      this.logger.debug(`Found recipient: ${JSON.stringify(recipient, null, 2)}`);

      const encryptedPayload = await Utils.encryptPayload(
        message.payload,
        this.agentConfig.privateKey,
        recipient.authenticationCertificate,
      );

      this.logger.debug(`Payload encrypted successfully`);

      const encryptedMessage: AgentEncryptedMessageDto = {
        id: message.id, // Preserve the original message ID
        type: message.type,
        payload: encryptedPayload,
        recipientId: recipient.id,
        senderId: this.agentConfig.id,
        timestamp: message.timestamp,
      };

      this.logger.debug(`Created encrypted message: ${JSON.stringify(encryptedMessage, null, 2)}`);

      return encryptedMessage;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Error encrypting message: ${errorMessage}`);
      this.logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack'}`);
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
