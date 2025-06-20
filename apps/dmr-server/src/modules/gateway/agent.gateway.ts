import { AgentEventNames, CentOpsEvent } from '@dmr/shared';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import { Server, Socket } from 'socket.io';
import { Metrics } from '../../common/metrics';
import { RabbitMQService } from '../../libs/rabbitmq';
import { AuthService } from '../auth/auth.service';
import { CentOpsService } from '../centops/centops.service';
import { CentOpsConfigurationDifference } from '../centops/interfaces/cent-ops-configuration-difference.interface';

@WebSocketGateway({
  connectionStateRecovery: {
    maxDisconnectionDuration: Number(process.env.WEB_SOCKET_MAX_DISCONNECTION_DURATION || '120000'),
    skipMiddlewares: true,
  },
})
export class AgentGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AgentGateway.name);
  private handleError: (socket: Socket) => void;

  constructor(
    @InjectMetric(Metrics.dmrSocketErrorsTotal)
    private readonly errorsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionsActive)
    private readonly activeConnectionGauge: Gauge<string>,
    @InjectMetric(Metrics.dmrSocketConnectionsTotal)
    private readonly connectionsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketDisconnectionsTotal)
    private readonly disconnectionsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionDurationSeconds)
    private readonly dmrSocketConnectionDurationSecondsHistogram: Histogram<string>,
    private readonly authService: AuthService,
    private readonly rabbitService: RabbitMQService,
    private readonly centOpsService: CentOpsService,
  ) {}

  onModuleInit() {
    this.handleError = (socket: Socket) => {
      socket.on('error', () => {
        this.errorsTotalCounter.inc(1);
      });
    };

    this.server.on('connection', this.handleError);
  }

  onModuleDestroy() {
    this.server.off('connection', this.handleError);
  }

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

      this.activeConnectionGauge.inc(1);
      this.connectionsTotalCounter.inc(1);

      Object.assign(client, { agent: Object.assign(jwtPayload, { connectedAt: Date.now() }) });
    } catch {
      this.logger.error(`Error during agent socket connection: ${client.id}`, 'AgentGateway');
      client.disconnect();
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket): Promise<void> {
    this.activeConnectionGauge.dec(1);
    this.disconnectionsTotalCounter.inc(1);

    const agentId = client?.agent?.sub;
    const connectedAt = client?.agent?.cat;

    if (agentId) {
      await this.rabbitService.unsubscribe(agentId);
    }

    if (connectedAt) {
      const durationSeconds = (Date.now() - connectedAt) / 1000;

      this.dmrSocketConnectionDurationSecondsHistogram.observe(durationSeconds);
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
