import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';
import { IJwtPayload } from '@dmr/shared';
import { DmrServerGateway } from './dmr.server.gateway';

declare module 'socket.io' {
  interface Socket {
    user: IJwtPayload;
  }
}

const mockAuthService = {
  verifyToken: vi.fn(),
};

describe('DmrServerGateway', () => {
  let gateway: DmrServerGateway;
  let authService: AuthService;
  let loggerSpy: ReturnType<typeof vi.spyOn>;
  let serverMock: Server;

  const createMockSocket = (token?: string, userPayload?: any, id?: string): Socket => {
    const mockSocket: Partial<Socket> = {
      id: id || `socket-${Math.random().toString(36).substring(7)}`,
      handshake: {
        auth: { token: token },
        headers: { authorization: token ? `Bearer ${token}` : undefined },
      } as any,
      disconnect: vi.fn(),
      user: userPayload || undefined,
      emit: vi.fn(),
      on: vi.fn(),
    };
    return mockSocket as Socket;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmrServerGateway,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    gateway = module.get<DmrServerGateway>(DmrServerGateway);
    authService = module.get<AuthService>(AuthService);

    serverMock = {
      sockets: {
        sockets: new Map<string, Socket>(),
        get: vi.fn((id: string) => serverMock.sockets.sockets.get(id)),
      } as any,
    } as Server;
    gateway.server = serverMock;

    loggerSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    loggerSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    const mockPayload = { sub: 'testAgentId', email: 'test@example.com' };

    it('should allow connection for a valid token', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect((client as any).user).toEqual(mockPayload);
    });

    it('should disconnect client if no token is provided', async () => {
      const client = createMockSocket(undefined);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerSpy).not.toHaveBeenCalled();
    });

    it('should disconnect client if authService.verifyToken fails', async () => {
      const token = 'invalid.jwt.token';
      const client = createMockSocket(token);
      const error = new Error('Token verification failed');

      mockAuthService.verifyToken.mockRejectedValueOnce(error);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(client.disconnect).toHaveBeenCalledOnce();
    });

    it('should get token from authorization header if auth.token is not present', async () => {
      const token = 'valid.jwt.token.from.header';
      const client = createMockSocket();
      client.handshake.auth.token = undefined;
      client.handshake.headers.authorization = `Bearer ${token}`;

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect((client as any).user).toEqual(mockPayload);
    });
  });

  describe('handleDisconnect', () => {
    it('should log agent disconnection', () => {
      const mockAgentId = 'agent-123';
      const client = createMockSocket(undefined, { sub: mockAgentId }, 'mockSocketId456');

      gateway.handleDisconnect(client);

      expect(loggerSpy).toHaveBeenCalledWith(
        `Agent disconnected: ${mockAgentId} (Socket ID: ${client.id})`,
      );
    });
  });

  describe('handleMessage', () => {
    it('should log the received message', () => {
      const client = createMockSocket(undefined, { sub: 'testAgent' }, 'messageSocketId');
      const messageData = 'Hello DMR!';

      gateway.handleMessage(client, messageData);

      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: ${messageData}`);
    });
  });
});
