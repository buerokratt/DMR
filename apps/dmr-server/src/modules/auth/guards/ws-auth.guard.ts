import { Injectable, ExecutionContext, CanActivate } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AuthService } from '../auth.service';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token: string = (client.handshake?.auth?.token ||
      client.handshake?.headers?.authorization?.replace('Bearer ', '')) as string;

    if (!token) {
      client.disconnect();

      return false;
    }

    try {
      const jwtPayload = await this.authService.verifyToken(token);
      Object.assign(client, { agent: jwtPayload });
    } catch {
      client.disconnect();

      return false;
    }

    return true;
  }
}
