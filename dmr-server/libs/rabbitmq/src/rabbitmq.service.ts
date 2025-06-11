import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as rabbit from 'amqplib';
import { RabbitMQConfig, rabbitMQConfig } from 'src/common/config';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  client: rabbit.ChannelModel;
  channel: rabbit.Channel;

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

  async setupQueue(queueName: string, ttl?: number): Promise<boolean> {
    try {
      const dlqName = this.getDLQName(queueName);

      // Create DLQ for our queue
      await this.channel.assertQueue(dlqName, { durable: true });

      // Create and setup our queue
      await this.channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-message-ttl': ttl ?? this.rabbitMQConfig.ttl,
          'x-dead-letter-exchange': '', // use default exchange
          'x-dead-letter-routing-key': dlqName,
        },
      });

      this.logger.log(
        `Queue ${queueName} with TTL ${ttl ?? this.rabbitMQConfig.ttl}ms and DLQ ${dlqName} set up.`,
      );

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error while setup queue for ${queueName}: ${error.message}`);
      }

      return false;
    }
  }

  async deleteQueue(queueName: string): Promise<boolean> {
    try {
      const dlqName = this.getDLQName(queueName);

      // Delete DLQ for our queue
      await this.channel.deleteQueue(dlqName);

      // Delete our queue
      await this.channel.deleteQueue(queueName);

      this.logger.log(`Queue ${queueName} and DLQ ${dlqName} deleted.`);

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error while setup queue for ${queueName}: ${error.message}`);
      }

      return false;
    }
  }

  private getDLQName(queueName: string): string {
    return `${queueName}_dlq`;
  }
}
