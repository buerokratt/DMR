import { IJwtPayload } from '@dmr/shared';

declare module 'socket.io' {
  interface Socket {
    user: IJwtPayload;
  }
}
