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

  const createChannelMock = vi.fn().mockResolvedValue({
    on: onMock,
    checkQueue: checkQueueMock,
    assertQueue: assertQueueMock,
    deleteQueue: deleteQueueMock,
  });

  const connectMock = vi.fn().mockResolvedValue({
    on: onMock,
    createChannel: createChannelMock,
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
    },
  };
});

import * as amqplib from 'amqplib';
const { assertQueueMock, deleteQueueMock, checkQueueMock } = (amqplib as any).__mocks;

describe('RabbitMQService', () => {
  let service: RabbitMQService;
  let schedulerRegistry: SchedulerRegistry;

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);

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
    const checkQueue = checkQueueMock.mockResolvedValue(true);
    const result = await service.checkQueue('test-queue');

    expect(result).toBe(true);
    expect(checkQueue).toHaveBeenCalledWith('test-queue');
  });

  it('should return false if queue does not exist', async () => {
    const checkQueue = checkQueueMock.mockRejectedValueOnce(new Error('Not Found'));
    const result = await service.checkQueue('test-queue');

    expect(result).toBe(false);
    expect(checkQueue).toHaveBeenCalledWith('test-queue');
  });

  it('should setup queue and DLQ', async () => {
    const checkQueue = checkQueueMock.mockRejectedValueOnce(new Error('Not Found'));
    const result = await service.setupQueue('test-queue', 1000);

    expect(result).toBe(true);
    expect(checkQueue).toHaveBeenCalledWith('test-queue');
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
});
