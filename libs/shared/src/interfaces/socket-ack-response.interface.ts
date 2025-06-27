import { SocketAckStatus } from '../enums';

export interface SocketAckResponse {
  status: SocketAckStatus;
  error?: string;
}
