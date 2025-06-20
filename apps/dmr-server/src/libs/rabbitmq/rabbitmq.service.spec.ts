import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
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

  const createChannelMock = vi.fn().mockResolvedValue({
    on: onMock,
    checkQueue: checkQueueMock,
    assertQueue: assertQueueMock,
    deleteQueue: deleteQueueMock,
    consume: consumeMock,
    cancel: cancelMock,
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
    },
  };
});

import * as amqplib from 'amqplib';
const {
  assertQueueMock,
  deleteQueueMock,
  checkQueueMock,
  consumeMock,
  cancelMock,
  closeConnectionMock,
  removeAllListenersConnectionMock,
} = (amqplib as any).__mocks;

describe('RabbitMQService', () => {
  let service: RabbitMQService;
  let schedulerRegistry: SchedulerRegistry;
  let cacheManager: Cache;

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
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
    cacheManager = module.get(CACHE_MANAGER);

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
    checkQueueMock.mockResolvedValueOnce(true);
    const result = await service.checkQueue('test-queue');

    expect(result).toBe(true);
    expect(checkQueueMock).toHaveBeenCalledWith('test-queue');
  });

  it('should return false if queue does not exist', async () => {
    checkQueueMock.mockRejectedValueOnce(new Error('Not Found'));
    const result = await service.checkQueue('test-queue');

    expect(result).toBe(false);
    expect(checkQueueMock).toHaveBeenCalledWith('test-queue');
  });

  it('should setup queue and DLQ', async () => {
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
});
