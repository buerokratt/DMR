import { JwtPayload } from '@dmr/shared';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { AgentConfig, agentConfig } from '../../common/config/agent.config';
import { DMRServerConfig, dmrServerConfig } from '../../common/config/dmr-server.config';
import { WebSocketConfig } from '../../common/config/web-socket.config';

@Injectable()
export class WebsocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketService.name);
  private socket: Socket | null = null;
  private reconnectionAttempts = 0;

  constructor(
    @Inject(agentConfig.KEY) private readonly agentConfig: AgentConfig,
    @Inject(dmrServerConfig.KEY) private readonly dmrServerConfig: DMRServerConfig,
    @Inject(dmrServerConfig.KEY) private readonly webSocketConfig: WebSocketConfig,
    private readonly jwtService: JwtService,
  ) {}

  onModuleInit(): void {
    this.connectToServer();
  }

  private connectToServer(): void {
    try {
      const socketOptions: Partial<ManagerOptions & SocketOptions> = {
        reconnectionDelay: this.webSocketConfig.reconnectionDelay.min,
        reconnectionDelayMax: this.webSocketConfig.reconnectionDelay.max,
        auth: {
          token: this.generateJwtToken(this.agentConfig.uuid, this.agentConfig.privateKey),
        },
      };

      this.socket = io(this.dmrServerConfig.webSocketURL, socketOptions);

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

    this.socket.on('connect', () => {
      this.reconnectionAttempts = 0;

      if (this.socket) {
        this.logger.log(`Connected to DMR server with ID: ${this.socket.id}`);
        this.logger.log(
          `Recovery state: ${this.socket.recovered ? 'recovered' : 'new connection'}`,
        );
      }
    });

    this.socket.on('disconnect', (reason: string) => {
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
          token: this.generateJwtToken(this.agentConfig.uuid, this.agentConfig.privateKey),
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
  }

  private generateJwtToken(agentId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: agentId,
      iat: now,
      exp: now + 60,
    };

    return this.jwtService.sign(payload, {
      algorithm: 'RS256',
      privateKey,
      keyid: agentId,
    });
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  onModuleDestroy(): void {
    this.disconnect();
    this.logger.log('Socket disconnected on application shutdown');
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
