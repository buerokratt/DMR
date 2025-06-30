import { MessageType } from '@dmr/shared';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { useContainer } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { centOpsConfig } from '../../common/config/cent-ops.config';
import { RabbitMQService } from '../../libs/rabbitmq/rabbitmq.service';
import { CentOpsService } from '../centops/centops.service';
import { MessageValidatorService } from './message-validator.service';

describe('MessageValidatorService', () => {
  let service: MessageValidatorService;
  let centOpsService: CentOpsService;

  beforeEach(async () => {
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
          return {
            clientId: id,
            name: `Test Agent ${id}`,
            status: 'active',
            configuration: {
              test: 'config',
            },
          };
        }
        throw new BadRequestException(`Agent with ID ${id} not found`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageValidatorService,
        {
          provide: CentOpsService,
          useValue: mockCentOpsService,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: ClassSerializerInterceptor,
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn() },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: vi.fn(), set: vi.fn() },
        },
        {
          provide: SchedulerRegistry,
          useValue: { addCronJob: vi.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
        {
          provide: centOpsConfig.KEY,
          useValue: {
            url: 'http://test-url',
            cronTime: '* * * * *',
          },
        },
        {
          provide: RabbitMQService,
          useValue: { setupQueue: vi.fn(), deleteQueue: vi.fn() },
        },
        {
          provide: 'GLOBAL_VALIDATION_PIPE',
          useFactory: () =>
            new ValidationPipe({
              transform: true,
              whitelist: true,
              forbidNonWhitelisted: false,
            }),
        },
      ],
    }).compile();

    useContainer(module, { fallbackOnErrors: true });

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
        type: MessageType.ChatMessage,
        payload: 'test payload',
      };

      const result = await service.validateMessage(messageData);

      expect(result.message).toBeDefined();
      expect(result.message.id).toBe(messageData.id);
      expect(result.message.senderId).toBe(messageData.senderId);
      expect(result.message.recipientId).toBe(messageData.recipientId);
      expect(result.message.timestamp).toBe(messageData.timestamp);
      expect(result.message.type).toBe(messageData.type);
      expect(result.message.payload).toBe(messageData.payload);
    });

    it('should reject null/undefined message data', async () => {
      await expect(service.validateMessage(null)).rejects.toThrow(BadRequestException);
      await expect(service.validateMessage(undefined)).rejects.toThrow(BadRequestException);
    });

    it('should reject messages with missing required fields', async () => {
      const incompleteMessage = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
      };

      await expect(service.validateMessage(incompleteMessage)).rejects.toThrow(BadRequestException);
    });

    it('should handle complex message objects with nested properties', async () => {
      const complexMessage = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: new Date().toISOString(),
        type: MessageType.ChatMessage,
        payload: JSON.stringify({ content: 'nested content', values: [1, 2, 3] }),
      };

      const result = await service.validateMessage(complexMessage);

      expect(result.message).toBeDefined();
      expect(result.message.id).toBe(complexMessage.id);
      expect(result.message.senderId).toBe(complexMessage.senderId);
      expect(result.message.recipientId).toBe(complexMessage.recipientId);
      expect(result.message.timestamp).toBe(complexMessage.timestamp);
      expect(result.message.type).toBe(complexMessage.type);
      expect(result.message.payload).toBe(complexMessage.payload);
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
        type: MessageType.ChatMessage,
        payload: 'test payload',
        extraField: 'should be preserved',
      };

      const result = await service.validateMessage(messageData);

      expect(result.message).toBeDefined();
      expect(result.message.id).toBe(messageData.id);
      expect(result.message.senderId).toBe(messageData.senderId);
      expect(result.message.recipientId).toBe(messageData.recipientId);
      expect(result.message.timestamp).toBe(messageData.timestamp);
      expect(result.message.type).toBe(messageData.type);
      expect(result.message.payload).toBe(messageData.payload);
      expect((result.message as any).extraField).toBe(messageData.extraField);
    });

    it('should throw if senderId does not exist', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174099',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: new Date().toISOString(),
        type: MessageType.ChatMessage,
        payload: 'test payload',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });

    it('should throw if recipientId does not exist', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174099',
        timestamp: new Date().toISOString(),
        type: MessageType.ChatMessage,
        payload: 'test payload',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });

    it('should reject message with invalid timestamp', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: 'invalid-timestamp',
        type: MessageType.ChatMessage,
        payload: 'test payload',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });

    it('should reject message with invalid message type', async () => {
      const messageData = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        senderId: '123e4567-e89b-12d3-a456-426614174001',
        recipientId: '123e4567-e89b-12d3-a456-426614174002',
        timestamp: new Date().toISOString(),
        type: 'INVALID_TYPE' as MessageType,
        payload: 'test payload',
      };

      await expect(service.validateMessage(messageData)).rejects.toThrow(BadRequestException);
    });
  });
});
