import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as rabbit from 'amqplib';
import { ConsumeMessage } from 'amqplib';
import { rabbitMQConfig, RabbitMQConfig } from '../../common/config';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private _connection: rabbit.ChannelModel | null = null;
  private _channel: rabbit.Channel | null = null;

  private readonly logger = new Logger(RabbitMQService.name);
  private readonly RECONNECT_INTERVAL_NAME = 'RECONNECT_INTERVAL_NAME';

  constructor(
    @Inject(rabbitMQConfig.KEY)
    private readonly rabbitMQConfig: RabbitMQConfig,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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
      this.logger.error(`RabbitMQ connection error: ${error.message}`);
    });

    this._channel = await this._connection.createChannel();

    this._channel.on('error', (error: Error) => {
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
    if (!this._channel) {
      throw new BadRequestException('Rabbit channel not defined');
    }

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
    if (!this._channel) {
      throw new BadRequestException('Rabbit channel not defined');
    }

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
    if (!this._channel) {
      throw new BadRequestException('Rabbit channel not defined');
    }

    try {
      await this._channel.checkQueue(queueName);

      return true;
    } catch {
      return false;
    }
  }

  async subscribe(queueName: string): Promise<boolean> {
    if (!this._channel) {
      throw new BadRequestException('Rabbit channel not defined');
    }

    try {
      const queueExists = await this.checkQueue(queueName);

      if (!queueExists) {
        this.logger.error('Queue does not exist:', queueName);

        return false;
      }

      const consume = await this._channel.consume(
        queueName,
        (message: ConsumeMessage | null): void => {
          try {
            const messageContent = message ? message.content.toString() : null;

            this.logger.debug(`Processing message from queue ${queueName}:`, messageContent);
          } catch (error) {
            this.logger.error(`Error processing message from queue ${queueName}:`, error);
          }
        },
        { noAck: false },
      );

      const consumeTagKey = this.getConsumeTagKey(queueName);
      await this.cacheManager.set(consumeTagKey, consume.consumerTag);

      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Error subscribing to queue ${queueName}: ${error.message}`);
      }
      return false;
    }
  }

  async unsubscribe(queueName: string): Promise<boolean> {
    if (!this._channel) {
      throw new BadRequestException('Rabbit channel not defined');
    }

    const consumeTagKey = this.getConsumeTagKey(queueName);

    try {
      const consumerTag = await this.cacheManager.get<string | null>(consumeTagKey);

      if (!consumerTag) {
        this.logger.warn(`No active consumer found for queue ${queueName}`);
        return false;
      }

      await this._channel.cancel(consumerTag);
      await this.cacheManager.del(consumeTagKey);

      this.logger.log(`Unsubscribed from queue ${queueName}`);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Error unsubscribing from queue ${queueName}: ${error.message}`);
      }
      return false;
    }
  }

  private getConsumeTagKey(queueName: string): string {
    return `consumeTag:${queueName}`;
  }

  private getDLQName(queueName: string): string {
    return `${queueName}.dlq`;
  }

  get connection(): rabbit.ChannelModel | null {
    return this._connection;
  }

  get channel(): rabbit.Channel | null {
    return this._channel;
  }
}
