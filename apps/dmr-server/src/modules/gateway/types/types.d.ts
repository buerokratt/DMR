import { JwtPayload } from '@dmr/shared';

declare module 'socket.io' {
  interface Socket {
    agent: JwtPayload;
  }
}
