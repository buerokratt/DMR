import { AgentMessageDto, SimpleValidationFailureMessage, ValidationErrorDto } from '@dmr/shared';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { rabbitMQConfig, RabbitMQConfig } from '../../common/config';
import { RabbitMQService } from './rabbitmq.service';

@Injectable()
export class RabbitMQMessageService implements OnModuleInit {
  private readonly logger = new Logger(RabbitMQMessageService.name);
  private readonly VALIDATION_FAILURES_QUEUE = 'validation-failures';
  private readonly UNKNOWN_ERROR = 'Unknown error';

  private generateUuid(): string {
    return crypto.randomUUID();
  }

  constructor(
    @Inject(rabbitMQConfig.KEY)
    private readonly rabbitMQConfig: RabbitMQConfig,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.setupValidationFailuresQueueWithRetry();
  }

  private async setupValidationFailuresQueueWithRetry(retries = 5, delay = 5000): Promise<void> {
    try {
      await this.setupValidationFailuresQueue();
    } catch (error) {
      if (retries > 0) {
        this.logger.warn(
          `Failed to setup validation failures queue. Retrying in ${delay}ms... (${retries} attempts left)`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.setupValidationFailuresQueueWithRetry(retries - 1, delay);
      } else {
        this.logger.error(
          'Maximum retry attempts reached for setting up validation failures queue',
        );
        throw error;
      }
    }
  }

  private async setupValidationFailuresQueue(): Promise<void> {
    try {
      const queueExists = await this.rabbitMQService.checkQueue(this.VALIDATION_FAILURES_QUEUE);

      if (queueExists) {
        this.logger.log(
          `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' exists and is ready to use`,
        );
      } else {
        this.logger.log(
          `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' does not exist, creating it now`,
        );

        const success = await this.rabbitMQService.setupQueueWithoutDLQ(
          this.VALIDATION_FAILURES_QUEUE,
          this.rabbitMQConfig.validationFailuresTTL,
        );

        if (success) {
          this.logger.log(
            `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' created successfully`,
          );
        } else {
          const errorMessage = `Failed to create validation failures queue '${this.VALIDATION_FAILURES_QUEUE}'`;
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : this.UNKNOWN_ERROR;
      this.logger.error(`Error setting up validation failures queue: ${errorMessage}`);
      throw error;
    }
  }

  async sendValidMessage(message: AgentMessageDto, receivedAt: string): Promise<boolean> {
    try {
      const queueName = message.recipientId;
      const channel = this.rabbitMQService.channel;
      const queueExists = await this.rabbitMQService.checkQueue(queueName);
      if (!queueExists) {
        const success = await this.rabbitMQService.setupQueue(queueName);
        if (!success) {
          this.logger.error(`Failed to create queue for recipient ${queueName}`);
          return false;
        }
      }

      const enrichedMessage = {
        ...message,
        receivedAt,
      };

      const success = channel.sendToQueue(queueName, Buffer.from(JSON.stringify(enrichedMessage)), {
        persistent: true,
      });

      if (success) {
        this.logger.log(`Message ${message.id} sent to queue ${queueName}`);
      } else {
        this.logger.warn(`Failed to send message ${message.id} to queue ${queueName}`);
      }

      return Promise.resolve(success);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : this.UNKNOWN_ERROR;
      this.logger.error(`Error sending valid message: ${errorMessage}`);
      return Promise.resolve(false);
    }
  }

  private extractMessageId(originalMessage: unknown): string {
    try {
      const id = (originalMessage as { id?: unknown })?.id;
      return id && (typeof id === 'string' || typeof id === 'number')
        ? String(id)
        : this.generateUuid();
    } catch {
      this.logger.debug('Error extracting original message ID, using generated UUID instead');
      return this.generateUuid();
    }
  }

  async sendValidationFailure(
    originalMessage: unknown,
    errors: ValidationErrorDto[],
    receivedAt: string,
  ): Promise<boolean> {
    try {
      const channel = this.rabbitMQService.channel;
      const messageId = this.extractMessageId(originalMessage);

      const failureMessage: SimpleValidationFailureMessage = {
        id: messageId,
        errors,
        receivedAt,
        message: originalMessage,
      };

      const success = channel.sendToQueue(
        this.VALIDATION_FAILURES_QUEUE,
        Buffer.from(JSON.stringify(failureMessage)),
        { persistent: true },
      );

      if (success) {
        this.logger.log(
          `Validation failure message sent to queue ${this.VALIDATION_FAILURES_QUEUE}`,
        );
      } else {
        this.logger.warn(
          `Failed to send validation failure message to queue ${this.VALIDATION_FAILURES_QUEUE}`,
        );
      }

      return Promise.resolve(success);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : this.UNKNOWN_ERROR;
      this.logger.error(`Error sending validation failure: ${errorMessage}`);
      return Promise.resolve(false);
    }
  }
}
