import { ValidationErrorDto } from '../dtos';
import { SocketAckStatus } from '../enums';

export interface ISocketAckPayload {
  status: SocketAckStatus;
  errors?: ValidationErrorDto[];
}
