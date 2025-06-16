import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as rabbit from 'amqplib';
import { rabbitMQConfig, RabbitMQConfig } from '../../common/config';

@Injectable()
export class RabbitMQService implements OnModuleInit {
  private _connection: rabbit.ChannelModel;
  private _channel: rabbit.Channel;

  private readonly logger = new Logger(RabbitMQService.name);
  private readonly RECONNECT_INTERVAL_NAME = 'RECONNECT_INTERVAL_NAME';

  constructor(
    @Inject(rabbitMQConfig.KEY)
    private readonly rabbitMQConfig: RabbitMQConfig,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Error during connection to RabbitMQ: ${error.message}`);
      }

      this.scheduleReconnect();
    }
  }

  async onModuleDestroy() {
    this.schedulerRegistry.deleteInterval(this.RECONNECT_INTERVAL_NAME);

    this._connection?.removeAllListeners();
    await this._connection?.close();
  }

  private async connect(): Promise<void> {
    this._connection = await rabbit.connect({
      port: this.rabbitMQConfig.port,
      hostname: this.rabbitMQConfig.hostname,
      username: this.rabbitMQConfig.username,
      password: this.rabbitMQConfig.password,
    });

    this._connection.on('close', () => this.onClose());
    this._connection.on('error', (error: Error) => {
      this.logger.error(error);
      this.logger.error(`RabbitMQ connection error: ${error.message}`);
    });

    this._channel = await this._connection.createChannel();

    this._channel.on('error', (error: Error) => {
      this.logger.error(error);
      this.logger.error(`RabbitMQ chanel error: ${error.message}`);
    });

    this.logger.log('RabbitMQ connected');
  }

  private onClose() {
    this.logger.warn('Connection closed. Reconnecting...');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.schedulerRegistry.doesExist('interval', this.RECONNECT_INTERVAL_NAME)) {
      // Interval already exists
      return;
    }

    const callback = async () => {
      this.logger.log('Trying to reconnect to RabbitMQ...');

      try {
        await this.connect();

        this.schedulerRegistry.deleteInterval(this.RECONNECT_INTERVAL_NAME);
      } catch {
        this.logger.warn(`Reconnect attempt failed. Will try again...`);
      }
    };

    const interval = setInterval(callback as () => void, this.rabbitMQConfig.reconnectInterval);

    this.schedulerRegistry.addInterval(this.RECONNECT_INTERVAL_NAME, interval);
  }

  async setupQueue(queueName: string, ttl?: number): Promise<boolean> {
    try {
      const dlqName = this.getDLQName(queueName);

      // Create DLQ for our queue
      await this._channel.assertQueue(dlqName, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': this.rabbitMQConfig.dlqTTL,
        },
      });

      // Create and setup our queue
      await this._channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
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
      await this._channel.deleteQueue(dlqName);

      // Delete our queue
      await this._channel.deleteQueue(queueName);

      this.logger.log(`Queue ${queueName} and DLQ ${dlqName} deleted.`);

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error while setup queue for ${queueName}: ${error.message}`);
      }

      return false;
    }
  }

  // Do not use, may break the connection.
  async checkQueue(queueName: string): Promise<boolean> {
    try {
      await this._channel.checkQueue(queueName);

      return true;
    } catch {
      return false;
    }
  }

  private getDLQName(queueName: string): string {
    return `${queueName}.dlq`;
  }

  get connection(): rabbit.ChannelModel {
    return this._connection;
  }

  get channel(): rabbit.Channel {
    return this._channel;
  }
}
