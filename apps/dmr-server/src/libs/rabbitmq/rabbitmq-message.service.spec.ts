import { MessageType, ValidationErrorType } from '@dmr/shared';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rabbitMQConfig } from '../../common/config';
import { RabbitMQMessageService } from './rabbitmq-message.service';
import { RabbitMQService } from './rabbitmq.service';

describe('RabbitMQMessageService', () => {
  let service: RabbitMQMessageService;
  let rabbitMQService: RabbitMQService;
  let channelMock: any;

  const mockConfig = {
    validationFailuresTTL: 86400000, // 24 hours
  };

  beforeEach(async () => {
    channelMock = {
      sendToQueue: vi.fn().mockReturnValue(true),
    };

    const rabbitMQServiceMock = {
      channel: channelMock,
      checkQueue: vi.fn().mockResolvedValue(true),
      setupQueue: vi.fn().mockResolvedValue(true),
      setupQueueWithoutDLQ: vi.fn().mockResolvedValue(true),
      rabbitMQConfig: mockConfig,
    };

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQMessageService,
        {
          provide: RabbitMQService,
          useValue: rabbitMQServiceMock,
        },
        {
          provide: rabbitMQConfig.KEY,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<RabbitMQMessageService>(RabbitMQMessageService);
    rabbitMQService = module.get<RabbitMQService>(RabbitMQService);

    vi.spyOn(service as any, 'generateUuid').mockReturnValue('mocked-uuid');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setupValidationFailuresQueue', () => {
    it('should log success when validation failures queue exists', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log');

      await (service as any).setupValidationFailuresQueue();

      expect(rabbitMQService.checkQueue).toHaveBeenCalledWith('validation-failures');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Validation failures queue 'validation-failures' exists"),
      );
    });

    it('should create queue when validation failures queue does not exist', async () => {
      vi.spyOn(rabbitMQService, 'checkQueue').mockResolvedValueOnce(false);
      const logSpy = vi.spyOn(Logger.prototype, 'log');

      await (service as any).setupValidationFailuresQueue();

      expect(rabbitMQService.setupQueueWithoutDLQ).toHaveBeenCalledWith(
        'validation-failures',
        mockConfig.validationFailuresTTL,
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Validation failures queue 'validation-failures' does not exist"),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Validation failures queue 'validation-failures' created successfully",
        ),
      );
    });

    it('should throw error when queue creation fails', async () => {
      vi.spyOn(rabbitMQService, 'checkQueue').mockResolvedValueOnce(false);
      vi.spyOn(rabbitMQService, 'setupQueueWithoutDLQ').mockResolvedValueOnce(false);
      const errorSpy = vi.spyOn(Logger.prototype, 'error');

      await expect((service as any).setupValidationFailuresQueue()).rejects.toThrow(
        "Failed to create validation failures queue 'validation-failures'",
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create validation failures queue'),
      );
    });

    it('should handle errors when checking queue', async () => {
      const testError = new Error('Test error');
      vi.spyOn(rabbitMQService, 'checkQueue').mockRejectedValueOnce(testError);
      const errorSpy = vi.spyOn(Logger.prototype, 'error');

      await expect((service as any).setupValidationFailuresQueue()).rejects.toThrow('Test error');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error setting up validation failures queue: Test error'),
      );
    });
  });

  describe('onModuleInit', () => {
    it('should call setupValidationFailuresQueueWithRetry', async () => {
      const setupSpy = vi
        .spyOn(service as any, 'setupValidationFailuresQueueWithRetry')
        .mockResolvedValueOnce(undefined);

      vi.useFakeTimers();

      await service.onModuleInit();
      await vi.runAllTimersAsync();

      expect(setupSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('sendValidMessage', () => {
    const mockMessage = {
      id: 'test-message-id',
      senderId: 'sender-123',
      recipientId: 'recipient-456',
      type: MessageType.ChatMessage,
      timestamp: '2023-01-01T12:00:00.000Z',
      content: { test: 'data' },
      payload: 'test-payload',
    };
    const mockReceivedAt = '2023-01-01T12:00:05.000Z';

    it('should send a valid message to the recipient queue', async () => {
      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(true);
      expect(rabbitMQService.checkQueue).toHaveBeenCalledWith(mockMessage.recipientId);
      expect(channelMock.sendToQueue).toHaveBeenCalledWith(
        mockMessage.recipientId,
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage).toEqual({
        ...mockMessage,
        receivedAt: mockReceivedAt,
      });
    });

    it('should create queue if it does not exist', async () => {
      vi.spyOn(rabbitMQService, 'checkQueue').mockResolvedValueOnce(false);

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(true);
      expect(rabbitMQService.setupQueue).toHaveBeenCalledWith(mockMessage.recipientId);
      expect(channelMock.sendToQueue).toHaveBeenCalled();
    });

    it('should return false if queue creation fails', async () => {
      vi.spyOn(rabbitMQService, 'checkQueue').mockResolvedValueOnce(false);
      vi.spyOn(rabbitMQService, 'setupQueue').mockResolvedValueOnce(false);

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(false);
      expect(channelMock.sendToQueue).not.toHaveBeenCalled();
    });

    it('should handle errors and return false', async () => {
      channelMock.sendToQueue.mockImplementationOnce(() => {
        throw new Error('Send error');
      });

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(false);
    });

    it('should log warning when sendToQueue returns false', async () => {
      channelMock.sendToQueue.mockReturnValueOnce(false);
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');

      const result = await service.sendValidMessage(mockMessage, mockReceivedAt);

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to send message ${mockMessage.id}`),
      );
    });
  });

  describe('sendValidationFailure', () => {
    const mockErrors = [{ type: ValidationErrorType.INVALID_FORMAT, message: 'Invalid format' }];
    const mockReceivedAt = '2023-01-01T12:00:05.000Z';

    it('should send validation failure with message ID from original message', async () => {
      const originalMessage = { id: 'original-id', content: 'test' };

      const result = await service.sendValidationFailure(
        originalMessage,
        mockErrors,
        mockReceivedAt,
      );

      expect(result).toBe(true);
      expect(channelMock.sendToQueue).toHaveBeenCalledWith(
        'validation-failures',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage).toEqual({
        id: 'original-id',
        errors: mockErrors,
        receivedAt: mockReceivedAt,
        message: originalMessage,
      });
    });

    it('should generate UUID when original message has no ID', async () => {
      const originalMessage = { content: 'test-no-id' };

      await service.sendValidationFailure(originalMessage, mockErrors, mockReceivedAt);

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.id).toBe('mocked-uuid');
    });

    it('should generate UUID when original message ID is invalid', async () => {
      const originalMessage = { id: null, content: 'test-invalid-id' };

      await service.sendValidationFailure(originalMessage, mockErrors, mockReceivedAt);

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.id).toBe('mocked-uuid');
    });

    it('should generate UUID when original message is not an object', async () => {
      const originalMessage = 'string-message';

      await service.sendValidationFailure(originalMessage, mockErrors, mockReceivedAt);

      const sentMessage = JSON.parse(channelMock.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.id).toBe('mocked-uuid');
      expect(sentMessage.message).toBe('string-message');
    });

    it('should handle errors and return false', async () => {
      channelMock.sendToQueue.mockImplementationOnce(() => {
        throw new Error('Send error');
      });

      const result = await service.sendValidationFailure({}, mockErrors, mockReceivedAt);

      expect(result).toBe(false);
    });

    it('should log warning when sendToQueue returns false', async () => {
      channelMock.sendToQueue.mockReturnValueOnce(false);
      const warnSpy = vi.spyOn(Logger.prototype, 'warn');

      const result = await service.sendValidationFailure({}, mockErrors, mockReceivedAt);

      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send validation failure message'),
      );
    });

    // Queue existence check and creation is now handled in onModuleInit
  });
});
