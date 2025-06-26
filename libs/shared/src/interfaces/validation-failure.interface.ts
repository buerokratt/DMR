import { ValidationErrorDto } from '../dtos';

export interface SimpleValidationFailureMessage {
  id: string; // Message id
  errors: ValidationErrorDto[]; // Errors
  receivedAt: string; // Message received at
  message: unknown; // Message
}
