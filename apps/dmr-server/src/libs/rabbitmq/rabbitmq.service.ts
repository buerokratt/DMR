import {
  AgentMessageDto,
  IRabbitQueue,
  ISocketAckPayload,
  SocketAckStatus,
  ValidationErrorType,
} from '@dmr/shared';
import { HttpService } from '@nestjs/axios';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as rabbit from 'amqplib';
import { ConsumeMessage } from 'amqplib';
import { firstValueFrom } from 'rxjs';
import { rabbitMQConfig, RabbitMQConfig } from '../../common/config';
import { AgentGateway } from '../../modules/gateway';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private _connection: rabbit.ChannelModel | null = null;
  private _channel: rabbit.Channel | null = null;

  private readonly logger = new Logger(RabbitMQService.name);
  private readonly RECONNECT_INTERVAL_NAME = 'RECONNECT_INTERVAL_NAME';
  private readonly CHANNEL_NOT_AVAILABLE_ERROR = 'RabbitMQ channel is not available';

  constructor(
    @Inject(rabbitMQConfig.KEY)
    private readonly rabbitMQConfig: RabbitMQConfig,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => AgentGateway))
    private readonly agentGateway: AgentGateway,
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
    const channel = this.channel;

    if (!channel) {
      this.logger.error(`Cannot setup queue ${queueName}: RabbitMQ channel is not available`);
      return false;
    }

    try {
      const dlqName = this.getDLQName(queueName);

      const alreadyExist = await this.checkQueue(queueName);

      if (alreadyExist) {
        return true;
      }

      // Create DLQ for our queue
      await channel.assertQueue(dlqName, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': this.rabbitMQConfig.dlqTTL,
        },
      });

      // Create and setup our queue
      await channel.assertQueue(queueName, {
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

  async setupQueueWithoutDLQ(queueName: string, ttl?: number): Promise<boolean> {
    const channel = this.channel;

    if (!channel) {
      this.logger.error(this.CHANNEL_NOT_AVAILABLE_ERROR);
      return false;
    }

    try {
      await channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': ttl ?? this.rabbitMQConfig.ttl,
        },
      });

      this.logger.log(
        `Queue ${queueName} with TTL ${ttl ?? this.rabbitMQConfig.ttl}ms set up (no DLQ).`,
      );

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error while setting up queue ${queueName}: ${error.message}`);
      }

      return false;
    }
  }

  async deleteQueue(queueName: string): Promise<boolean> {
    const channel = this.channel;

    if (!channel) {
      this.logger.error(this.CHANNEL_NOT_AVAILABLE_ERROR);
      return false;
    }

    try {
      const dlqName = this.getDLQName(queueName);

      // Delete DLQ for our queue
      await channel.deleteQueue(dlqName);

      // Delete our queue
      await channel.deleteQueue(queueName);

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
      const base64 = Buffer.from(
        `${this.rabbitMQConfig.username}:${this.rabbitMQConfig.password}`,
      ).toString('base64');
      const authorization = `Basic ${base64}`;

      const encodedVhost = encodeURIComponent('/');
      const getQueueURL = `${this.rabbitMQConfig.managementUIUri}/api/queues/${encodedVhost}/${queueName}`;

      const { data: queue } = await firstValueFrom(
        this.httpService.get<IRabbitQueue>(getQueueURL, {
          headers: { Authorization: authorization },
        }),
      );

      this.logger.log(`Queues in vhost "/":`, queue.name);
      return true;
    } catch {
      return false;
    }
  }

  async subscribe(queueName: string): Promise<boolean> {
    const channel = this.channel;

    if (!channel) {
      this.logger.error(
        `Cannot subscribe to queue ${queueName}: ${this.CHANNEL_NOT_AVAILABLE_ERROR}`,
      );
      return false;
    }

    try {
      const queueExists = await this.checkQueue(queueName);

      if (!queueExists) {
        this.logger.error('Queue does not exist:', queueName);

        return false;
      }

      const handleMessage = async (message: ConsumeMessage | null): Promise<void> => {
        try {
          if (!message) {
            return this.logger.warn('Message is null');
          }

          const result = await this.forwardMessageToAgent(queueName, message);

          if (!result) {
            return channel.nack(message, false, true);
          }

          if (result.status === SocketAckStatus.ERROR) {
            const errorTypes = result.errors?.map((error) => error.type) ?? [];

            if (errorTypes.includes(ValidationErrorType.DECRYPTION_FAILED)) {
              return channel.nack(message, false, false);
            }

            if (errorTypes.includes(ValidationErrorType.DELIVERY_FAILED)) {
              return channel.nack(message, false, true);
            }
          }

          channel.ack(message);
        } catch (error) {
          this.logger.error(`Error processing message from queue ${queueName}:`, error);
          if (message) {
            channel.nack(message, false, false);
          }
        }
      };

      const consume = await channel.consume(
        queueName,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        handleMessage,
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

  private async forwardMessageToAgent(
    agentId: string,
    message: ConsumeMessage,
  ): Promise<ISocketAckPayload | null> {
    try {
      const messageContent = message.content.toString();
      const parsedMessage = JSON.parse(messageContent) as AgentMessageDto;

      const result = await this.agentGateway.forwardMessageToAgent(agentId, parsedMessage);
      this.logger.log(`Message forwarded to agent ${agentId}`);

      return result;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Error forwarding message to agent ${agentId}: ${error.message}`);
      }

      return null;
    }
  }

  async unsubscribe(queueName: string): Promise<boolean> {
    const channel = this.channel;
    const consumeTagKey = this.getConsumeTagKey(queueName);

    if (!channel) {
      this.logger.error(this.CHANNEL_NOT_AVAILABLE_ERROR);
      return false;
    }

    try {
      const consumerTag = await this.cacheManager.get<string | null>(consumeTagKey);

      if (!consumerTag) {
        this.logger.warn(`No active consumer found for queue ${queueName}`);
        return false;
      }

      await channel.cancel(consumerTag);
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

  get connection(): rabbit.ChannelModel {
    if (!this._connection) {
      throw new Error('Rabbit does not connected');
    }

    return this._connection;
  }

  get channel(): rabbit.Channel | null {
    if (!this._channel) {
      this.logger.warn('Rabbit channel not defined, attempting to reconnect...');
      this.scheduleReconnect();
      return null;
    }

    return this._channel;
  }
}
