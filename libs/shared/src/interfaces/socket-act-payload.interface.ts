import { ValidationErrorDto } from '../dtos';
import { SocketAckStatusEnum } from '../enums';

export interface ISocketAckPayload {
  status: SocketAckStatusEnum;
  errors?: ValidationErrorDto[];
}
