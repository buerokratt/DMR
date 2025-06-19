import { AgentMessageDto, SimpleValidationFailureMessage, ValidationErrorDto } from '@dmr/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { rabbitMQConfig, RabbitMQConfig } from '../../common/config';
import { RabbitMQService } from './rabbitmq.service';

@Injectable()
export class RabbitMQMessageService {
  private readonly logger = new Logger(RabbitMQMessageService.name);
  private readonly VALIDATION_FAILURES_QUEUE = 'validation-failures';
  private readonly UNKNOWN_ERROR = 'Unknown error';

  private generateUuid(): string {
    return crypto.randomUUID();
  }

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    @Inject(rabbitMQConfig.KEY)
    private readonly rabbitMQConfig: RabbitMQConfig,
  ) {
    void this.setupValidationFailuresQueue();
  }

  private async setupValidationFailuresQueue(): Promise<void> {
    try {
      const queueExists = await this.rabbitMQService.checkQueue(this.VALIDATION_FAILURES_QUEUE);

      if (queueExists) {
        this.logger.log(
          `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' exists and is ready to use`,
        );
      } else {
        const errorMessage =
          `Validation failures queue '${this.VALIDATION_FAILURES_QUEUE}' not found. ` +
          'This queue should be created during RabbitMQ initialization.';

        this.logger.error(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : this.UNKNOWN_ERROR;
      this.logger.error(`Error checking validation failures queue: ${errorMessage}`);
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
      if (
        typeof originalMessage === 'object' &&
        originalMessage !== null &&
        'id' in originalMessage
      ) {
        const messageWithId = originalMessage as { id?: unknown };

        if (
          messageWithId.id !== undefined &&
          messageWithId.id !== null &&
          (typeof messageWithId.id === 'string' || typeof messageWithId.id === 'number')
        ) {
          return String(messageWithId.id);
        }
      }
      return this.generateUuid();
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

      // Check if queue exists, if not create it
      const queueExists = await this.rabbitMQService.checkQueue(this.VALIDATION_FAILURES_QUEUE);
      if (!queueExists) {
        const success = await this.rabbitMQService.setupQueueWithoutDLQ(
          this.VALIDATION_FAILURES_QUEUE,
          this.rabbitMQConfig.validationFailuresTTL,
        );
        if (!success) {
          this.logger.error(
            `Failed to create validation failures queue ${this.VALIDATION_FAILURES_QUEUE}`,
          );
          return false;
        }
      }

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
