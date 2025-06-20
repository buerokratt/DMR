import { MessageType } from '@dmr/shared';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CentOpsService } from '../centops/centops.service';
import { MessageValidatorService } from './message-validator.service';

const mockCentOpsService = {
  getCentOpsConfigurationByClientId: vi.fn().mockImplementation(async (id: string) => {
    if (
      [
        'agent-1',
        'agent-2',
        'complex-sender',
        'complex-recipient',
        '123e4567-e89b-12d3-a456-426614174000',
        '123e4567-e89b-12d3-a456-426614174001',
        '123e4567-e89b-12d3-a456-426614174002',
      ].includes(id)
    ) {
      return { id, name: 'Test Agent' };
    }
    throw new BadRequestException(`Agent with ID ${id} not found`);
  }),
};

describe('MessageValidatorService', () => {
  let service: MessageValidatorService;
  let centOpsService: CentOpsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageValidatorService,
        {
          provide: CentOpsService,
          useValue: mockCentOpsService,
        },
      ],
    }).compile();

    service = module.get<MessageValidatorService>(MessageValidatorService);
    centOpsService = module.get<CentOpsService>(CentOpsService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateMessage', () => {
    it('should validate a properly formatted message', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: new Date().toISOString(),
        type: MessageType.Message,
        payload: 'test payload',
      };

      const result = await service.validateMessage(messageData);

      expect(result.message).toEqual(
        expect.objectContaining({
          id: messageData.id,
          senderId: messageData.senderId,
          recipientId: messageData.recipientId,
        }),
      );
    });

    it('should reject null/undefined message data', async () => {
      await expect(service.validateMessage(null)).rejects.toThrow(BadRequestException);
      await expect(service.validateMessage(undefined)).rejects.toThrow(BadRequestException);
    });

    it('should reject messages with missing required fields', async () => {
      const incompleteMessage = {
        id: 'msg-123',
        recipientId: 'agent-2',
        payload: 'test payload',
      };

      await expect(service.validateMessage(incompleteMessage)).rejects.toThrow(BadRequestException);
    });

    it('should handle complex message objects with nested properties', async () => {
      const complexMessage = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: new Date().toISOString(),
        type: MessageType.Message,
        payload: JSON.stringify({ content: 'nested content', values: [1, 2, 3] }),
      };

      const result = await service.validateMessage(complexMessage);

      expect(result.message).toEqual(
        expect.objectContaining({
          id: complexMessage.id,
          senderId: complexMessage.senderId,
          recipientId: complexMessage.recipientId,
        }),
      );
    });

    it('should reject completely empty objects', async () => {
      const emptyMessage = {};

      await expect(service.validateMessage(emptyMessage)).rejects.toThrow(BadRequestException);
    });

    it('should reject non-object message types', async () => {
      const nonObjectMessages = ['string message', 123, true, [1, 2, 3]];

      for (const message of nonObjectMessages) {
        await expect(service.validateMessage(message)).rejects.toThrow(BadRequestException);
      }
    });

    it('should validate and transform message to AgentMessageDto, preserving unknown fields', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: new Date().toISOString(),
        type: MessageType.Message,
        payload: 'test payload',
        extraField: 'should be ignored',
      };

      const result = await service.validateMessage(messageData);

      expect(result.message).toHaveProperty('id', messageData.id);
      expect(result.message).toHaveProperty('senderId', messageData.senderId);
      expect(result.message).toHaveProperty('recipientId', messageData.recipientId);
      expect(result.message).toHaveProperty('timestamp', messageData.timestamp);
      expect(result.message).toHaveProperty('type', messageData.type);
      expect(result.message).toHaveProperty('payload', messageData.payload);
      expect((result.message as any).extraField).toBe('should be ignored');
    });

    it('should throw if senderId does not exist', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174099',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: new Date().toISOString(),
        type: MessageType.Message,
        payload: 'test',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });

    it('should throw if recipientId does not exist', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174099',
        timestamp: new Date().toISOString(),
        type: MessageType.Message,
        payload: 'test',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });

    it('should reject message with invalid timestamp', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: 'not-a-date',
        type: MessageType.Message,
        payload: 'test',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });

    it('should reject message with invalid message type', async () => {
      const messageData = {
        id: 'msg-invalid-type',
        senderId: 'agent-1',
        recipientId: 'agent-2',
        timestamp: new Date().toISOString(),
        type: 'INVALID_TYPE',
        payload: 'test',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });
  });
});
