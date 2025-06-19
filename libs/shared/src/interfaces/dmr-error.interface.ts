import { ErrorType } from '../enums';

export interface DmrError {
  type: ErrorType;
  details: ErrorDetails;
}

interface ErrorDetails {
  errorMessage: string;
  messageId: string;
}
