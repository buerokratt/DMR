import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as rabbit from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMQService.name);

  constructor() {}

  client: rabbit.ChannelModel;
  channel: rabbit.Channel;

  //Sherifbai is implementing config module, I am going to integrate it then
  async onModuleInit(): Promise<void> {
    this.client = await rabbit.connect({
      hostname: 'localhost',
      port: 5672,
      username: 'admin',
      password: 'admin',
    });

    this.channel = await this.client.createChannel();
    this.logger.log('RabbitMQ connected');
  }

  async setupQueue(queueName: string, ttl: number = 30000): Promise<void> {
    const dlqName = `${queueName}_dlq`;

    // Create DLQ for our queue
    await this.channel.assertQueue(dlqName, { durable: true });

    // Create and setup our queue
    await this.channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-message-ttl': ttl, // 30 seconds
        'x-dead-letter-exchange': '', // use default exchange
        'x-dead-letter-routing-key': dlqName,
      },
    });

    console.log(`Queue ${queueName} with TTL ${ttl}ms and DLQ ${dlqName} set up.`);
  }
}
