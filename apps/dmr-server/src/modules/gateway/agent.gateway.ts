import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RabbitMQService } from '../../libs/rabbitmq';
import { CentOpsService } from '../centops/centops.service';
import { AgentEventNames, CentOpsEvent } from '@dmr/shared';
import { OnEvent } from '@nestjs/event-emitter';
import { CentOpsConfigurationDifference } from '../centops/interfaces/cent-ops-configuration-difference.interface';

@WebSocketGateway({
  connectionStateRecovery: {
    maxDisconnectionDuration: Number(process.env.WEB_SOCKET_MAX_DISCONNECTION_DURATION || '120000'),
    skipMiddlewares: true,
  },
})
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly rabbitService: RabbitMQService,
    private readonly centOpsService: CentOpsService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token: string = (client.handshake?.auth?.token ||
        client.handshake?.headers?.authorization?.replace('Bearer ', '')) as string;

      const jwtPayload = await this.authService.verifyToken(token);

      const consume = await this.rabbitService.subscribe(jwtPayload.sub);

      if (!consume) {
        client.disconnect();
      }

      const centOpsConfigurations = await this.centOpsService.getCentOpsConfigurations();
      this.server.emit(AgentEventNames.FULL_AGENT_LIST, centOpsConfigurations);

      Object.assign(client, { agent: jwtPayload });
    } catch {
      this.logger.error(`Error during agent socket connection: ${client.id}`, 'AgentGateway');
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    const agentId = client?.agent?.sub;

    if (agentId) {
      await this.rabbitService.unsubscribe(agentId);
    }

    this.logger.log(`Agent disconnected: ${agentId} (Socket ID: ${client.id})`);
  }

  @OnEvent(CentOpsEvent.UPDATED)
  onAgentConfigUpdate(data: CentOpsConfigurationDifference): void {
    this.server.emit(AgentEventNames.PARTIAL_AGENT_LIST, [...data.added, ...data.deleted]);

    this.logger.log('Agent configurations updated and emitted to all connected clients');
  }

  @SubscribeMessage('messageToDMR')
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() data: string): void {
    this.logger.log(`${client.id} sent message to DMR: ${data}`);
  }
}
