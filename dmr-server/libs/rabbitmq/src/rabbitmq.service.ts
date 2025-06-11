import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as rabbit from 'amqplib';
import { RabbitMQConfig, rabbitMQConfig } from 'src/common/config';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  client: rabbit.ChannelModel;
  channel: rabbit.Channel;

  private readonly ttl = 3600 * 24; // 1 day
  private readonly logger = new Logger(RabbitMQService.name);

  constructor(
    @Inject(rabbitMQConfig.KEY)
    private readonly rabbitMQConfig: RabbitMQConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client = await rabbit.connect({
      port: this.rabbitMQConfig.port,
      hostname: this.rabbitMQConfig.hostname,
      username: this.rabbitMQConfig.username,
      password: this.rabbitMQConfig.password,
    });

    this.channel = await this.client.createChannel();
    this.logger.log('RabbitMQ connected');
  }

  async setupQueue(queueName: string, ttl?: number): Promise<void> {
    const dlqName = `${queueName}_dlq`;

    // Create DLQ for our queue
    await this.channel.assertQueue(dlqName, { durable: true });

    // Create and setup our queue
    await this.channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-message-ttl': ttl ?? this.ttl, // 30 seconds
        'x-dead-letter-exchange': '', // use default exchange
        'x-dead-letter-routing-key': dlqName,
      },
    });

    this.logger.log(`Queue ${queueName} with TTL ${ttl ?? this.ttl}ms and DLQ ${dlqName} set up.`);
  }
}
