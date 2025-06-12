import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { WsAuthGuard } from '../auth/guards/ws-auth.guard';

@UseGuards(WsAuthGuard)
@WebSocketGateway()
export class DmrServerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DmrServerGateway.name);

  constructor(private readonly authService: AuthService) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    const token: string = (client.handshake?.auth?.token ||
      client.handshake?.headers?.authorization?.replace('Bearer ', '')) as string;

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const verify = await this.authService.verifyToken(token);
      Object.assign(client, { user: verify });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    const agentId = client.user.sub;
    this.logger.log(`Agent disconnected: ${agentId} (Socket ID: ${client.id})`);
  }

  @SubscribeMessage('messageToDMR')
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: string): void {
    this.logger.log(`${client.id} sent message to DMR: ${data}`);
  }
}
