import { SocketActEnum } from '../enums';

export interface ISocketActPayload {
  status: SocketActEnum;
  error?: string;
}
