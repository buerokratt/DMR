import { ISocketAckPayload } from './socket-ack-payload.interface';

export type ISocketAckCallback = (payload: ISocketAckPayload) => void;
