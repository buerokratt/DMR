import { SocketActEnum } from '../enums';

export interface SocketAckResponse {
  status: SocketActEnum;
  error?: string;
}
