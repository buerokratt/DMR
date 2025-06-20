import { ValidationErrorDto } from '../dtos/validation-failure-message.dto';

export interface SimpleValidationFailureMessage {
  id: string;
  errors: ValidationErrorDto[];
  receivedAt: string;
  message: unknown;
}
