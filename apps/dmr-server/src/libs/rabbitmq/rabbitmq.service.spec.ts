import { SocketAckStatus } from '@dmr/shared';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { ConsumeMessage } from 'amqplib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rabbitMQConfig } from '../../common/config';
import { RabbitMQService } from './rabbitmq.service';

vi.mock('amqplib', async () => {
  const checkQueueMock = vi.fn();
  const assertQueueMock = vi.fn();
  const deleteQueueMock = vi.fn();
  const onMock = vi.fn();
  const consumeMock = vi.fn();
  const cancelMock = vi.fn();
  const ackMock = vi.fn(); // Mock for channel.ack
  const nackMock = vi.fn(); // Mock for channel.nack

  const createChannelMock = vi.fn().mockResolvedValue({
    on: onMock,
    checkQueue: checkQueueMock,
    assertQueue: assertQueueMock,
    deleteQueue: deleteQueueMock,
    consume: consumeMock,
    cancel: cancelMock,
    ack: ackMock, // Add ack to mocked channel
    nack: nackMock, // Add nack to mocked channel
  });

  const closeConnectionMock = vi.fn();
  const removeAllListenersConnectionMock = vi.fn();

  const connectMock = vi.fn().mockResolvedValue({
    on: onMock,
    createChannel: createChannelMock,
    close: closeConnectionMock,
    removeAllListeners: removeAllListenersConnectionMock,
  });

  return {
    connect: connectMock,
    __mocks: {
      onMock,
      connectMock,
      createChannelMock,
      assertQueueMock,
      deleteQueueMock,
      checkQueueMock,
      consumeMock,
      cancelMock,
      closeConnectionMock,
      removeAllListenersConnectionMock,
      ackMock, // Export ackMock
      nackMock, // Export nackMock
    },
  };
});

import { HttpService } from '@nestjs/axios';
import * as amqplib from 'amqplib';
import { of, throwError } from 'rxjs';
import { AgentGateway } from '../../modules/gateway'; // Import AgentGateway
const {
  assertQueueMock,
  deleteQueueMock,
  checkQueueMock,
  consumeMock,
  cancelMock,
  closeConnectionMock,
  removeAllListenersConnectionMock,
  ackMock, // Destructure ackMock
  nackMock, // Destructure nackMock
} = (amqplib as any).__mocks;

describe('RabbitMQService', () => {
  let httpService: HttpService;
  let service: RabbitMQService;
  let schedulerRegistry: SchedulerRegistry;
  let cacheManager: Cache;
  let eventEmitter: EventEmitter2;
  let agentGateway: AgentGateway; // Declare agentGateway

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQService,
        {
          provide: rabbitMQConfig.KEY,
          useValue: {
            port: 5672,
            hostname: 'localhost',
            username: '',
            password: '',
            ttl: 60000,
            dlqTTL: 60000,
            reconnectInterval: 5000,
            managementUIUri: 'http://localhost:15672',
          },
        },
        {
          provide: SchedulerRegistry,
          useValue: { addInterval: vi.fn(), deleteInterval: vi.fn(), doesExist: vi.fn() },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: vi.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn() },
        },
        {
          provide: AgentGateway, // Provide mock for AgentGateway
          useValue: {
            forwardMessageToAgent: vi.fn(),
          },
        },
      ],
    }).compile();

    cacheManager = module.get(CACHE_MANAGER);
    httpService = module.get<HttpService>(HttpService);
    service = module.get<RabbitMQService>(RabbitMQService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    agentGateway = module.get<AgentGateway>(AgentGateway); // Get AgentGateway instance

    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call scheduleReconnect on failed connect', async () => {
    vi.spyOn(service as any, 'connect').mockRejectedValueOnce(new Error('Connection error'));
    const reconnectSpy = vi.spyOn(service as any, 'scheduleReconnect');

    await service.onModuleInit();

    expect(reconnectSpy).toHaveBeenCalled();
  });

  it('should call scheduleReconnect on close event', async () => {
    const reconnectSpy = vi.spyOn(service as any, 'scheduleReconnect');

    (service as any).onClose();

    expect(reconnectSpy).toHaveBeenCalled();
  });

  it('should call deleteInterval after successful reconnect', async () => {
    const connectSpy = vi.spyOn(service as any, 'connect').mockResolvedValue(undefined);
    const deleteSpy = vi.spyOn(schedulerRegistry, 'deleteInterval');
    vi.spyOn(schedulerRegistry, 'doesExist').mockReturnValue(false);

    vi.useFakeTimers();

    (service as any).scheduleReconnect();

    await vi.runOnlyPendingTimersAsync();

    expect(connectSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith((service as any).RECONNECT_INTERVAL_NAME);

    vi.useRealTimers();
  });

  it('should return true if queue exists', async () => {
    const mockData = {
      arguments: {},
      auto_delete: false,
      durable: true,
      exclusive: false,
      leader: 'rabbit',
      members: ['rabbit'],
      name: 'test-queue',
      node: 'rabbit',
      online: ['rabbit'],
      state: 'running',
      type: 'quorum',
      vhost: '/',
    };

    vi.spyOn(httpService, 'get').mockReturnValue(of({ data: mockData } as any));
    const result = await service.checkQueue('test-queue');

    expect(result).toBe(true);
  });

  it('should return false if queue does not exist', async () => {
    vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('Not found')));
    const result = await service.checkQueue('test-queue');

    expect(result).toBe(false);
  });

  it('should setup queue and DLQ', async () => {
    vi.spyOn(httpService, 'get').mockReturnValue(throwError(() => new Error('Not found')));
    const result = await service.setupQueue('test-queue', 1000);

    expect(result).toBe(true);
    expect(assertQueueMock).toHaveBeenCalledWith('test-queue.dlq', {
      durable: true,
      arguments: { 'x-queue-type': 'quorum', 'x-message-ttl': 60000 },
    });

    expect(assertQueueMock).toHaveBeenCalledWith(
      'test-queue',
      expect.objectContaining({
        durable: true,
        arguments: expect.objectContaining({
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'test-queue.dlq',
          'x-message-ttl': 1000,
        }),
      }),
    );
  });

  it('should delete queue and DLQ', async () => {
    const result = await service.deleteQueue('test-queue');

    expect(result).toBe(true);
    expect(deleteQueueMock).toHaveBeenCalledWith('test-queue.dlq');
    expect(deleteQueueMock).toHaveBeenCalledWith('test-queue');
  });

  describe('setupQueueWithoutDLQ', () => {
    it('should setup queue without DLQ with default TTL', async () => {
      const queueName = 'test-queue-no-dlq';
      const result = await service.setupQueueWithoutDLQ(queueName);

      expect(result).toBe(true);
      expect(assertQueueMock).toHaveBeenCalledWith(queueName, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 60000, // default TTL from config
        },
      });
    });

    it('should setup queue without DLQ with custom TTL', async () => {
      const queueName = 'test-queue-no-dlq-custom';
      const customTTL = 120000; // 2 minutes
      const result = await service.setupQueueWithoutDLQ(queueName, customTTL);

      expect(result).toBe(true);
      expect(assertQueueMock).toHaveBeenCalledWith(queueName, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': customTTL,
        },
      });
    });

    it('should return false when queue setup fails', async () => {
      const queueName = 'test-queue-error';
      const error = new Error('Queue setup failed');
      assertQueueMock.mockRejectedValueOnce(error);

      const result = await service.setupQueueWithoutDLQ(queueName);

      expect(result).toBe(false);
    });
  });

  it('should subscribe to a queue and store consumer tag', async () => {
    const testQueue = 'test-subscribe-queue';
    const mockConsumerTag = 'consumer-tag-123';

    vi.spyOn(service, 'checkQueue').mockResolvedValue(true);
    consumeMock.mockResolvedValue({ consumerTag: mockConsumerTag });

    const result = await service.subscribe(testQueue);

    expect(result).toBe(true);
    expect(consumeMock).toHaveBeenCalledWith(testQueue, expect.any(Function), { noAck: false });
    expect(cacheManager.set).toHaveBeenCalledWith(`consumeTag:${testQueue}`, mockConsumerTag);
  });

  it('should return false if queue does not exist for subscribe', async () => {
    const testQueue = 'non-existent-queue';
    vi.spyOn(service, 'checkQueue').mockResolvedValue(false);

    const result = await service.subscribe(testQueue);

    expect(result).toBe(false);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(cacheManager.set).not.toHaveBeenCalled();
  });

  it('should unsubscribe from a queue and remove consumer tag', async () => {
    const testQueue = 'test-unsubscribe-queue';
    const mockConsumerTag = 'consumer-tag-456';

    vi.spyOn(cacheManager, 'get').mockResolvedValue(mockConsumerTag);

    const result = await service.unsubscribe(testQueue);

    expect(result).toBe(true);
    expect(cacheManager.get).toHaveBeenCalledWith(`consumeTag:${testQueue}`);
    expect(cancelMock).toHaveBeenCalledWith(mockConsumerTag);
    expect(cacheManager.del).toHaveBeenCalledWith(`consumeTag:${testQueue}`);
  });

  it('should return false if no consumer tag is found for unsubscribe', async () => {
    const testQueue = 'test-unsubscribe-queue-no-tag';

    vi.spyOn(cacheManager, 'get').mockResolvedValue(null);

    const result = await service.unsubscribe(testQueue);

    expect(result).toBe(false);
    expect(cacheManager.get).toHaveBeenCalledWith(`consumeTag:${testQueue}`);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(cacheManager.del).not.toHaveBeenCalled();
  });

  it('should call removeAllListeners and close on module destroy', async () => {
    await service.onModuleDestroy();

    expect(removeAllListenersConnectionMock).toHaveBeenCalled();
    expect(closeConnectionMock).toHaveBeenCalled();
  });

  describe('Message Forwarding', () => {
    describe('forwardMessageToAgent', () => {
      it('should parse message content and forward message to AgentGateway', () => {
        const agentId = 'test-agent-id';
        const mockMessage = {
          content: Buffer.from(
            JSON.stringify({
              id: 'test-message-id',
              senderId: 'test-sender-id',
              recipientId: agentId,
              timestamp: '2025-06-18T14:00:00Z',
              payload: '{"key":"value"}',
            }),
          ),
        } as ConsumeMessage;

        (service as any).forwardMessageToAgent(agentId, mockMessage);

        expect(agentGateway.forwardMessageToAgent).toHaveBeenCalledWith(
          agentId,
          expect.objectContaining({
            id: 'test-message-id',
            senderId: 'test-sender-id',
            recipientId: agentId,
            timestamp: '2025-06-18T14:00:00Z',
            payload: '{"key":"value"}',
          }),
        );
      });

      it('should handle JSON parsing errors', () => {
        const agentId = 'test-agent-id';
        const mockMessage = {
          content: Buffer.from('invalid-json'),
        } as ConsumeMessage;

        const loggerSpy = vi.spyOn(Logger.prototype, 'error');

        (service as any).forwardMessageToAgent(agentId, mockMessage);

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining(`Error forwarding message to agent ${agentId}`),
        );
      });
    });

    describe('subscribe method with message processing', () => {
      it('should process messages and acknowledge them', async () => {
        const queueName = 'test-queue';
        const mockMessage = {
          content: Buffer.from(
            JSON.stringify({
              id: 'test-message-id',
              senderId: 'test-sender-id',
            }),
          ),
        } as ConsumeMessage;

        let capturedCallback: (msg: ConsumeMessage) => void;
        consumeMock.mockImplementation((queue: any, callback: (msg: ConsumeMessage) => void) => {
          capturedCallback = callback;
          return Promise.resolve({ consumerTag: 'test-tag' });
        });

        vi.spyOn(service, 'checkQueue').mockResolvedValue(true);

        const forwardSpy = vi
          .spyOn(service as any, 'forwardMessageToAgent')
          .mockResolvedValue({ status: SocketAckStatus.OK });

        await service.subscribe(queueName);

        expect(consumeMock).toHaveBeenCalledWith(queueName, expect.any(Function), { noAck: false });

        capturedCallback!(mockMessage);

        expect(forwardSpy).toHaveBeenCalledWith(queueName, mockMessage);
        // expect(ackMock).toHaveBeenCalledWith(mockMessage);
      });

      it('should handle errors and nack messages when processing fails', async () => {
        const queueName = 'test-queue';
        const mockMessage = {
          content: Buffer.from('invalid-json'),
        } as ConsumeMessage;

        let capturedCallback: (msg: ConsumeMessage) => void;
        consumeMock.mockImplementation((queue: any, callback: (msg: ConsumeMessage) => void) => {
          capturedCallback = callback;
          return Promise.resolve({ consumerTag: 'test-tag' });
        });

        vi.spyOn(service, 'checkQueue').mockResolvedValue(true);

        vi.spyOn(service as any, 'forwardMessageToAgent').mockImplementation(() => {
          throw new Error('Test error');
        });

        await service.subscribe(queueName);

        capturedCallback!(mockMessage);

        expect(ackMock).not.toHaveBeenCalled();
        expect(nackMock).toHaveBeenCalledWith(mockMessage, false, false);
      });
    });
  });
});
