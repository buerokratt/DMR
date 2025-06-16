import { JwtPayload } from '@dmr/shared';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client';

@Injectable()
export class WebsocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebsocketService.name);
  private socket: Socket | null = null;
  private reconnectionAttempts = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  onModuleInit(): void {
    this.connectToServer();
  }

  private connectToServer(): void {
    const requiredConfigs = {
      serverUrl: this.configService.get<string>('DMR_SERVER_WEBSOCKET_URL'),
      agentId: this.configService.get<string>('AGENT_ID'),
      privateKey: this.configService.get<string>('AGENT_PRIVATE_KEY'),
    };

    const configNameMap = {
      serverUrl: 'DMR_SERVER_WEBSOCKET_URL',
      agentId: 'AGENT_ID',
      privateKey: 'AGENT_PRIVATE_KEY',
    } as const;

    for (const [key, value] of Object.entries(requiredConfigs)) {
      if (!value) {
        const configName = configNameMap[key as keyof typeof configNameMap];
        this.logger.error(`${configName} is not configured`);
        return;
      }
    }

    try {
      const { serverUrl, agentId, privateKey } = requiredConfigs;
      const socketOptions: Partial<ManagerOptions & SocketOptions> = {
        reconnectionDelay: this.configService.get<number>('WEBSOCKET_RECONNECTION_DELAY', 1000),
        reconnectionDelayMax: this.configService.get<number>('WEBSOCKET_DELAY_MAX', 5000),
        auth: {
          token: this.generateJwtToken(agentId, privateKey),
        },
      };

      this.socket = io(serverUrl, socketOptions);

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
      const agentId = this.configService.get<string>('AGENT_ID');
      const privateKey = this.configService.get<string>('AGENT_PRIVATE_KEY');
      if (agentId && privateKey && this.socket) {
        this.socket.auth = {
          token: this.generateJwtToken(agentId, privateKey),
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
