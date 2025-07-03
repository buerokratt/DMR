import { JwtPayload } from '@dmr/shared';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DefaultEventsMap } from 'socket.io';
import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { AgentConfig, agentConfig } from '../../common/config/agent.config';
import { webSocketConfig, WebSocketConfig } from '../../common/config/web-socket.config';
import { MetricService } from '../../libs/metrics';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class WebsocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketService.name);
  private socket: Socket<DefaultEventsMap, DefaultEventsMap> | null = null;
  private reconnectionAttempts = 0;

  constructor(
    @Inject(agentConfig.KEY) private readonly agentConfig: AgentConfig,
    @Inject(webSocketConfig.KEY) private readonly webSocketConfig: WebSocketConfig,
    private readonly jwtService: JwtService,
    private readonly metricService: MetricService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
  ) {}

  onModuleInit(): void {
    this.connectToServer();
  }

  private connectToServer(): void {
    try {
      const socketOptions: Partial<ManagerOptions & SocketOptions> = {
        reconnectionDelay: this.webSocketConfig.reconnectionDelayMin,
        reconnectionDelayMax: this.webSocketConfig.reconnectionDelayMax,
        auth: {
          token: this.generateJwtToken(this.agentConfig.id, this.agentConfig.privateKey),
        },
      };

      this.socket = io(this.webSocketConfig.url + this.webSocketConfig.namespace, socketOptions);

      this.setupSocketEventListeners();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to DMR server: ${errorMessage}`);
    }
  }

  private setupSocketEventListeners(): void {
    if (!this.socket) {
      this.logger.error('Cannot setup event listeners: Socket is not initialized');
      return;
    }

    let startTime: number;

    this.socket.on('connect', () => {
      startTime = Date.now();
      this.metricService.activeConnectionStatusGauge.inc(1);
      this.reconnectionAttempts = 0;

      if (this.socket) {
        this.messagesService.setupSocketEventListeners();
        this.logger.log(`Connected to DMR server with ID: ${this.socket.id}`);
        this.logger.log(
          `Recovery state: ${this.socket.recovered ? 'recovered' : 'new connection'}`,
        );
      }
    });

    this.socket.on('disconnect', (reason: string) => {
      this.metricService.activeConnectionStatusGauge.dec(1);

      if (startTime) {
        const durationSeconds = (Date.now() - startTime) / 1000;
        this.metricService.socketConnectionDurationSecondsHistogram.observe(durationSeconds);
        startTime = undefined;
      }

      this.logger.warn(`Disconnected from DMR server. Reason: ${reason}`);
    });

    this.socket.on('connect_error', (error: unknown) => {
      this.reconnectionAttempts++;
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Connection error (attempt ${this.reconnectionAttempts}): ${errorMessage}`);
    });

    this.socket.on('reconnect', (attempt: number) => {
      this.logger.log(`Reconnected to DMR server after ${attempt} attempts`);
    });

    this.socket.on('reconnect_attempt', () => {
      this.logger.log('Attempting to reconnect to DMR server...');

      if (this.socket) {
        this.socket.auth = {
          token: this.generateJwtToken(this.agentConfig.id, this.agentConfig.privateKey),
        };
      }
    });

    this.socket.on('reconnect_error', (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Reconnection error: ${errorMessage}`);
    });

    this.socket.on('reconnect_failed', () => {
      this.logger.error('Failed to reconnect to DMR server');
    });

    this.socket.onAny((event: string) => {
      if (event === 'error') {
        this.metricService.errorsTotalCounter.inc(1);
      }

      const ignored = ['ping', 'disconnect', 'connect', 'error'];
      if (!ignored.includes(event)) {
        this.metricService.eventsReceivedTotalCounter.inc({
          event,
          namespace: this.webSocketConfig.namespace,
        });
      }
    });

    this.socket.onAnyOutgoing((event: string) => {
      this.metricService.eventsSentTotalCounter.inc({
        event,
        namespace: this.webSocketConfig.namespace,
      });
    });
  }

  private generateJwtToken(agentId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: agentId,
      iat: now,
      exp: now + 60,
      cat: Date.now(),
    };

    return this.jwtService.sign(payload, {
      algorithm: 'RS256',
      privateKey,
      keyid: agentId,
    });
  }

  isConnected(): boolean {
    this.logger.log(`Socket connected: ${this.socket?.connected}`);
    return Boolean(this.socket?.connected);
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  onModuleDestroy(): void {
    this.disconnect();
    this.logger.log('Socket disconnected on application shutdown');
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
    }
  }
}
