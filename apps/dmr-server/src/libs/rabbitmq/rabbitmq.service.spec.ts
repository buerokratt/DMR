import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rabbitMQConfig } from '../../common/config';
import { RabbitMQService } from './rabbitmq.service';

vi.mock('amqplib', async () => {
  const assertQueueMock = vi.fn();
  const deleteQueueMock = vi.fn();

  const createChannelMock = vi.fn().mockResolvedValue({
    assertQueue: assertQueueMock,
    deleteQueue: deleteQueueMock,
  });

  const connectMock = vi.fn().mockResolvedValue({
    createChannel: createChannelMock,
  });

  return {
    connect: connectMock,
    __mocks: {
      connectMock,
      createChannelMock,
      assertQueueMock,
      deleteQueueMock,
    },
  };
});

import * as amqplib from 'amqplib';
const { assertQueueMock, deleteQueueMock } = (amqplib as any).__mocks;

describe('RabbitMQService', () => {
  let service: RabbitMQService;

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
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);

    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
});
