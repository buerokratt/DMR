import {
  AgentEventNames,
  ExternalServiceMessageDto,
  IAgent,
  IAgentList,
  MessageType,
  SocketAckStatus,
  Utils,
  ValidationErrorType,
} from '@dmr/shared';
import { HttpService } from '@nestjs/axios';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import * as classTransformer from 'class-transformer';
import * as classValidator from 'class-validator';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentConfig, AgentConfig } from '../../common/config';
import { WebsocketService } from '../websocket/websocket.service';
import { MessagesService } from './messages.service';
import { BadGatewayException, BadRequestException, GatewayTimeoutException } from '@nestjs/common';

describe('AgentsService', () => {
  let service: MessagesService;
  let websocketService: WebsocketService;
  let cacheManager: Cache;
  let agentConfigMock: AgentConfig;
  let httpService: HttpService;

  const agent1: IAgent = {
    id: '1',
    name: 'Agent 1',
    authenticationCertificate: 'cert1',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-02',
  };

  const agent2: IAgent = {
    id: '2',
    name: 'Agent 2',
    authenticationCertificate: 'cert2',
    createdAt: '2023-01-03',
    updatedAt: '2023-01-04',
  };

  const deletedAgent: IAgent = {
    id: '3',
    name: 'Deleted Agent',
    authenticationCertificate: 'cert3',
    createdAt: '2023-01-05',
    updatedAt: '2023-01-06',
    deleted: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: agentConfig.KEY,
          useValue: {
            id: 'test-agent',
            privateKey: 'test-private-key',
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { set: vi.fn(), get: vi.fn() },
        },
        {
          provide: WebsocketService,
          useValue: {
            isConnected: vi.fn().mockReturnValue(true),
            getSocket: vi.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: vi.fn().mockReturnValue(of({ data: {} })),
          },
        },
      ],
    }).compile();

    service = module.get(MessagesService);
    websocketService = module.get(WebsocketService);
    cacheManager = module.get(CACHE_MANAGER);
    agentConfigMock = module.get(agentConfig.KEY);
    httpService = module.get(HttpService);

    vi.spyOn(classTransformer, 'plainToInstance').mockImplementation((_, obj) => obj as any);
    vi.spyOn(classValidator, 'validate').mockResolvedValue([]);
  });

  it('should call setupSocketEventListeners on module init', () => {
    const setupSpy = vi.spyOn(service as any, 'setupSocketEventListeners');
    service.onModuleInit();
    expect(setupSpy).toHaveBeenCalled();
  });

  it('should store only valid agents from full list', async () => {
    const data: IAgentList = {
      response: [agent1, deletedAgent, { ...agent2, id: null } as any],
    };

    await (service as any).handleFullAgentListEvent(data);

    expect(cacheManager.set).toHaveBeenCalledWith(
      'DMR_AGENTS_LIST',
      expect.arrayContaining([
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '3' }),
      ]),
    );
    const cachedAgents = (cacheManager.set as any).mock.calls[0][1];
    expect(cachedAgents).toHaveLength(2);
  });

  it('should merge agents and delete marked ones on partial list event', async () => {
    cacheManager.get = vi.fn().mockResolvedValue([agent1]);

    const update: IAgentList = {
      response: [agent2, { ...agent1, deleted: true }],
    };

    await (service as any).handlePartialAgentListEvent(update);

    expect(cacheManager.set).toHaveBeenCalledWith(
      'DMR_AGENTS_LIST',
      [expect.objectContaining({ id: '2' })],
      0,
    );
  });

  it('should retrieve agent by ID from cache', async () => {
    cacheManager.get = vi.fn().mockResolvedValue([agent1, agent2]);

    const result = await service.getAgentById('2');
    expect(result).toEqual(agent2);
  });

  it('should return null if agent ID is not found', async () => {
    cacheManager.get = vi.fn().mockResolvedValue([agent1]);

    const result = await service.getAgentById('not-found');
    expect(result).toBeNull();
  });

  it('should return null if getAgentById throws error', async () => {
    cacheManager.get = vi.fn().mockRejectedValue(new Error('Unexpected error'));

    const result = await service.getAgentById('1');
    expect(result).toBeNull();
  });

  const encryptedPayload = 'encrypted-payload';
  const decryptedPayload = { data: ['decrypted'] };

  describe('encryptMessagePayloadFromExternalService', () => {
    it('should return encrypted message if recipient is found', async () => {
      const mockRecipient = {
        id: 'recipient-id',
        authenticationCertificate: 'mock-recipient-key',
      };

      vi.spyOn(service as any, 'getAgentById').mockResolvedValueOnce(mockRecipient);
      vi.spyOn(Utils, 'encryptPayload').mockResolvedValueOnce(encryptedPayload);

      const message = {
        id: 'test-message-id',
        payload: ['some-data'],
        recipientId: mockRecipient.id,
      };

      const result = await service.encryptMessagePayloadFromExternalService(message);

      expect(result).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          type: MessageType.ChatMessage,
          payload: encryptedPayload,
          recipientId: mockRecipient.id,
          senderId: agentConfigMock.id,
          timestamp: expect.any(String),
        }),
      );
    });

    it('should return null if recipient is not found', async () => {
      vi.spyOn(service as any, 'getAgentById').mockResolvedValueOnce(null);

      const result = await service.encryptMessagePayloadFromExternalService({
        id: 'test-message-id',
        payload: ['data'],
        recipientId: 'invalid',
      });

      expect(result).toBeNull();
    });

    it('should return null if exception thrown', async () => {
      const mockRecipient = {
        id: 'recipient-id',
        authenticationCertificate: 'mock-recipient-key',
      };

      vi.spyOn(service as any, 'getAgentById').mockResolvedValueOnce(mockRecipient);
      vi.spyOn(Utils, 'encryptPayload').mockRejectedValueOnce(new Error('Test Error'));

      const result = await service.encryptMessagePayloadFromExternalService({
        id: 'test-message-id',
        payload: ['data'],
        recipientId: 'recipient-id',
      });

      expect(result).toBeNull();
    });
  });

  describe('decryptMessagePayloadFromDMRServer', () => {
    it('should return decrypted message if sender is found', async () => {
      const mockSender = {
        id: 'sender-id',
        authenticationCertificate: 'mock-sender-key',
      };

      vi.spyOn(service as any, 'getAgentById').mockResolvedValueOnce(mockSender);
      vi.spyOn(Utils, 'decryptPayload').mockResolvedValueOnce(decryptedPayload);

      const result = await service.decryptMessagePayloadFromDMRServer({
        id: 'id',
        type: MessageType.ChatMessage,
        payload: encryptedPayload,
        senderId: mockSender.id,
        recipientId: agentConfigMock.id,
        timestamp: '2025-06-16T00:00:00.000Z',
      });

      expect(result).toEqual({
        id: 'id',
        type: MessageType.ChatMessage,
        payload: decryptedPayload.data,
        senderId: mockSender.id,
        recipientId: agentConfigMock.id,
        timestamp: '2025-06-16T00:00:00.000Z',
      });
    });

    it('should return null if sender not found', async () => {
      vi.spyOn(service as any, 'getAgentById').mockResolvedValueOnce(null);

      const result = await service.decryptMessagePayloadFromDMRServer({
        id: 'id',
        type: MessageType.ChatMessage,
        payload: 'payload',
        senderId: 'invalid-id',
        recipientId: agentConfigMock.id,
        timestamp: '',
      });

      expect(result).toBeNull();
    });

    it('should return null if decryption fails', async () => {
      const mockSender = {
        id: 'sender-id',
        authenticationCertificate: 'mock-sender-key',
      };

      vi.spyOn(service as any, 'getAgentById').mockResolvedValueOnce(mockSender);
      vi.spyOn(Utils, 'decryptPayload').mockRejectedValueOnce(new Error('Decrypt fail'));

      try {
        await service.decryptMessagePayloadFromDMRServer({
          id: 'id',
          type: MessageType.ChatMessage,
          payload: encryptedPayload,
          senderId: mockSender.id,
          recipientId: agentConfigMock.id,
          timestamp: '',
        });
      } catch (error) {
        expect(error instanceof Error ? error.message : '').toContain('Decrypt fail');
      }
    });
  });

  describe('handleMessageFromDMRServerEvent', () => {
    it('should return error if decryption fails', async () => {
      const mockSender = {
        id: 'sender-id',
        authenticationCertificate: 'mock-cert',
      };

      const message = {
        id: 'msg-1',
        type: MessageType.ChatMessage,
        payload: 'encrypted-payload',
        senderId: mockSender.id,
        recipientId: agentConfigMock.id,
        timestamp: new Date().toISOString(),
      };
      const ackCbSpy = vi.fn();

      const emitSpy = vi.fn();

      vi.spyOn(websocketService, 'getSocket').mockReturnValue({
        emit: emitSpy,
      } as any);

      vi.spyOn(service as any, 'decryptMessagePayloadFromDMRServer').mockResolvedValueOnce(null);

      await (service as any).handleMessageFromDMRServerEvent(message, ackCbSpy);

      expect(ackCbSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SocketAckStatus.ERROR,
          errors: expect.arrayContaining([
            expect.objectContaining({
              type: ValidationErrorType.DECRYPTION_FAILED,
            }),
          ]),
        }),
      );
    });
  });

  describe('sendEncryptedMessageToServer', () => {
    const mockMessage = {
      id: 'test-message-id',
      recipientId: 'recipient-id',
      payload: ['some-data'],
    };

    const mockEncryptedMessage = {
      id: 'encrypted-message-id',
      type: MessageType.ChatMessage,
      payload: 'encrypted-payload',
      recipientId: 'recipient-id',
      senderId: 'test-agent',
      timestamp: '2025-06-26T10:00:00.000Z',
    };

    let mockSocket: any;

    beforeEach(() => {
      vi.clearAllMocks();

      mockSocket = {
        timeout: vi.fn().mockReturnThis(),
        emitWithAck: vi.fn(),
      };
    });

    it('should successfully send encrypted message to DMR server', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(mockSocket);

      mockSocket.emitWithAck.mockResolvedValue({
        status: SocketAckStatus.OK,
      });

      await service.sendEncryptedMessageToServer(mockMessage);

      expect(service.encryptMessagePayloadFromExternalService).toHaveBeenCalledWith(mockMessage);
      expect(websocketService.isConnected).toHaveBeenCalled();
      expect(websocketService.getSocket).toHaveBeenCalled();
      expect(mockSocket.emitWithAck).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_TO_DMR_SERVER,
        mockEncryptedMessage,
      );
    });

    it('should throw Error when message encryption fails', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(null);

      await expect(service.sendEncryptedMessageToServer(mockMessage)).rejects.toThrow(
        'Message not encrypted',
      );

      expect(websocketService.isConnected).not.toHaveBeenCalled();
      expect(websocketService.getSocket).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when websocket is not connected', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(false);

      await expect(service.sendEncryptedMessageToServer(mockMessage)).rejects.toThrow(
        BadGatewayException,
      );

      await expect(service.sendEncryptedMessageToServer(mockMessage)).rejects.toThrow(
        'WebSocket service is not connected to DMR server.',
      );

      expect(websocketService.getSocket).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when socket instance is null', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(null);

      await expect(service.sendEncryptedMessageToServer(mockMessage)).rejects.toThrow(
        BadGatewayException,
      );

      await expect(service.sendEncryptedMessageToServer(mockMessage)).rejects.toThrow(
        'Failed to get socket instance even though connection was reported as active.',
      );
    });

    it('should throw BadGatewayException when socket instance is undefined', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(undefined);

      await expect(service.sendEncryptedMessageToServer(mockMessage)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should handle timeout and throw BadGatewayException', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(mockSocket);

      mockSocket.emitWithAck.mockRejectedValue(new GatewayTimeoutException('Timeout'));

      try {
        await service.sendEncryptedMessageToServer(mockMessage);
        expect.fail('Expected GatewayTimeoutException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GatewayTimeoutException);
        expect(error.message).toBe('Timeout');
      }
    });

    it('should handle BadGatewayException and rethrow it', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(mockSocket);

      mockSocket.emitWithAck.mockRejectedValue(new BadGatewayException('Gateway error'));

      try {
        await service.sendEncryptedMessageToServer(mockMessage);
        expect.fail('Expected BadGatewayException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadGatewayException);
        expect(error.message).toBe('Gateway error');
      }
    });

    it('should convert unknown errors to BadGatewayException', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(mockSocket);

      const unknownError = new Error('Unexpected socket error');
      mockSocket.emitWithAck.mockRejectedValue(unknownError);

      try {
        await service.sendEncryptedMessageToServer(mockMessage);
        expect.fail('Expected BadGatewayException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadGatewayException);
        expect(error.message).toBe('Unexpected socket error');
      }
    });

    it('should convert non-Error exceptions to BadGatewayException', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(mockSocket);

      const nonErrorException = { code: 'SOCKET_ERROR', details: 'Connection lost' };
      mockSocket.emitWithAck.mockRejectedValue(nonErrorException);

      try {
        await service.sendEncryptedMessageToServer(mockMessage);
        expect.fail('Expected BadGatewayException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadGatewayException);
        expect(error.message).toBe('Unexpected error sending message to DMR Server');
      }
    });

    it('should handle successful response with additional data', async () => {
      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        mockEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(mockSocket);

      const successResponse = {
        status: SocketAckStatus.OK,
        messageId: 'server-message-id',
        timestamp: '2025-06-26T10:00:00.000Z',
      };

      mockSocket.emitWithAck.mockResolvedValue(successResponse);

      await expect(service.sendEncryptedMessageToServer(mockMessage)).resolves.not.toThrow();
    });

    it('should handle complex message payloads', async () => {
      const complexMessage: ExternalServiceMessageDto = {
        id: 'complex-message-id',
        recipientId: 'recipient-123',
        payload: ['payload'],
      };

      const complexEncryptedMessage = {
        ...mockEncryptedMessage,
        payload: 'complex-encrypted-payload',
      };

      vi.spyOn(service as any, 'encryptMessagePayloadFromExternalService').mockResolvedValue(
        complexEncryptedMessage,
      );

      websocketService.isConnected = vi.fn().mockReturnValue(true);
      websocketService.getSocket = vi.fn().mockReturnValue(mockSocket);

      mockSocket.emitWithAck.mockResolvedValue({ status: SocketAckStatus.OK });

      await service.sendEncryptedMessageToServer(complexMessage);

      expect(service.encryptMessagePayloadFromExternalService).toHaveBeenCalledWith(complexMessage);
      expect(mockSocket.emitWithAck).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_TO_DMR_SERVER,
        complexEncryptedMessage,
      );
    });
  });
});
