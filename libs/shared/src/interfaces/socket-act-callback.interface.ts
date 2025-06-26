import { ISocketAckPayload } from './socket-act-payload.interface';

export type ISocketActCallback = (payload: ISocketAckPayload) => void;
