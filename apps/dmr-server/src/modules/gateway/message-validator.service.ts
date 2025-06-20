import { AgentMessageDto, MessageType, ValidationErrorDto, ValidationErrorType } from '@dmr/shared';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ValidationError as ClassValidatorValidationError, validate } from 'class-validator';
import { CentOpsService } from '../centops/centops.service';

@Injectable()
export class MessageValidatorService {
  private readonly logger = new Logger(MessageValidatorService.name);
  private readonly UNKNOWN_ERROR = 'Unknown error';

  constructor(private readonly centOpsService: CentOpsService) {}

  async validateMessage(
    messageData: unknown,
    receivedAt = new Date().toISOString(),
  ): Promise<{ message: AgentMessageDto; validationErrors?: ValidationErrorDto[] }> {
    const validationErrors: ValidationErrorDto[] = [];

    try {
      const message = plainToInstance(AgentMessageDto, messageData);
      await this.validateMessageFormat(message, messageData, validationErrors, receivedAt);
      this.validateMessageTimestamp(message, messageData, validationErrors, receivedAt);
      this.validateMessageType(message, messageData, validationErrors, receivedAt);
      await this.validateMessageParticipants(message, messageData, validationErrors, receivedAt);
      return { message };
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // For unexpected errors
      validationErrors.push(
        this.createValidationError(
          ValidationErrorType.UNKNOWN,
          `Unexpected validation error: ${error instanceof Error ? error.message : this.UNKNOWN_ERROR}`,
        ),
      );

      this.logger.error(
        `Message validation error: ${error instanceof Error ? error.message : this.UNKNOWN_ERROR}`,
      );

      throw new BadRequestException({
        message: 'Message validation failed',
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private async validateMessageFormat(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): Promise<void> {
    const errors = await validate(message);
    if (errors.length > 0) {
      this.addFormatErrorsToValidationErrors(errors, validationErrors);
      throw new BadRequestException({
        message: 'Validation failed',
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private validateMessageTimestamp(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): void {
    if (message.timestamp && !this.isValidISODateString(message.timestamp)) {
      validationErrors.push(
        this.createValidationError(
          ValidationErrorType.INVALID_TIMESTAMP,
          'Invalid timestamp format',
        ),
      );

      throw new BadRequestException({
        message: 'Invalid timestamp format',
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private validateMessageType(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): void {
    if (!Object.values(MessageType).includes(message.type)) {
      const errorMessage = `Invalid message type: ${message.type}`;
      validationErrors.push(
        this.createValidationError(ValidationErrorType.INVALID_FORMAT, errorMessage),
      );

      throw new BadRequestException({
        message: errorMessage,
        validationErrors,
        originalMessage: messageData,
        receivedAt,
      });
    }
  }

  private async validateMessageParticipants(
    message: AgentMessageDto,
    messageData: unknown,
    validationErrors: ValidationErrorDto[],
    receivedAt: string,
  ): Promise<void> {
    try {
      await this.validateAgentExists(message.senderId, 'Sender');
    } catch (senderError) {
      if (senderError instanceof BadRequestException) {
        validationErrors.push(
          this.createValidationError(ValidationErrorType.INVALID_SENDER_ID, senderError.message),
        );
        throw new BadRequestException({
          message: senderError.message,
          validationErrors,
          originalMessage: messageData,
          receivedAt,
        });
      }
      throw senderError;
    }

    try {
      await this.validateAgentExists(message.recipientId, 'Recipient');
    } catch (recipientError) {
      if (recipientError instanceof BadRequestException) {
        validationErrors.push(
          this.createValidationError(
            ValidationErrorType.INVALID_RECIPIENT_ID,
            recipientError.message,
          ),
        );
        throw new BadRequestException({
          message: recipientError.message,
          validationErrors,
          originalMessage: messageData,
          receivedAt,
        });
      }
      throw recipientError;
    }
  }

  private addFormatErrorsToValidationErrors(
    errors: ClassValidatorValidationError[],
    validationErrors: ValidationErrorDto[],
  ): void {
    for (const error of errors) {
      if (!error || typeof error !== 'object') continue;
      if (!('constraints' in error) || !error.constraints || typeof error.constraints !== 'object')
        continue;
      const constraints = error.constraints as Record<string, string>;
      Object.entries(constraints).forEach(([, message]) => {
        validationErrors.push(
          this.createValidationError(ValidationErrorType.INVALID_FORMAT, message),
        );
      });
    }
  }

  createValidationError(type: ValidationErrorType, message: string): ValidationErrorDto {
    return {
      type,
      message,
    };
  }

  private isValidISODateString(dateString: string): boolean {
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime()) && date.toISOString() === dateString;
    } catch {
      return false;
    }
  }

  private async validateAgentExists(agentId: string, agentType: string): Promise<void> {
    try {
      try {
        await this.centOpsService.getCentOpsConfigurationByClientId(agentId);
        return;
      } catch {
        throw new BadRequestException(`${agentType} agent with ID ${agentId} not found`);
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to validate ${agentType.toLowerCase()} agent`);
    }
  }
}
