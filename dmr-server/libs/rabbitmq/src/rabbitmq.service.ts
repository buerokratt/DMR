/* eslint-disable prettier/prettier */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as rabbit from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  private readonly dlqName: string = 'MAIN_DEAD_LETTERS_QUEUE';
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
    this.logger.log('Rabbit connected');
  }

  async setupQueue(queueName: string, ttl: number = 30000, dlqName?: string): Promise<void> {
    // Create DLQ for our queue
    await this.channel.assertQueue(dlqName ?? this.dlqName, { durable: true });

    // Create and setup our queue
    await this.channel.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-message-ttl': ttl, // 30 seconds
        'x-dead-letter-exchange': '', // use default exchange
        'x-dead-letter-routing-key': dlqName ?? this.dlqName,
      },
    });

    console.log(`Queue ${queueName} with TTL ${ttl}ms and DLQ ${dlqName ?? this.dlqName} set up.`);
  }
}
