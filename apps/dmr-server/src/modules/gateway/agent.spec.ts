import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { RabbitMQService } from '../../libs/rabbitmq';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';
import { JwtPayload } from '@dmr/shared';
import { AgentGateway } from './agent.gateway';

declare module 'socket.io' {
  interface Socket {
    agent: JwtPayload;
  }
}

const mockAuthService = {
  verifyToken: vi.fn(),
};

const mockRabbitMQService = {
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

describe('AgentGateway', () => {
  let gateway: AgentGateway;
  let authService: AuthService;
  let rabbitService: RabbitMQService;
  let loggerSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let serverMock: Server;

  const createMockSocket = (token?: string, agentPayload?: any, id?: string): Socket => {
    const mockSocket: Partial<Socket> = {
      id: id || `socket-${Math.random().toString(36).substring(7)}`,
      handshake: {
        auth: { token: token },
        headers: { authorization: token ? `Bearer ${token}` : undefined },
        query: {},
        address: '',
        time: new Date().toISOString(),
        issued: Date.now(),
        url: '',
        secure: false,
        xdomain: false,
      } as any,
      disconnect: vi.fn(),
      agent: agentPayload || undefined,
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
    };
    return mockSocket as Socket;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentGateway,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: RabbitMQService,
          useValue: mockRabbitMQService,
        },
      ],
    }).compile();

    gateway = module.get<AgentGateway>(AgentGateway);
    authService = module.get<AuthService>(AuthService);
    rabbitService = module.get<RabbitMQService>(RabbitMQService);

    serverMock = {
      sockets: {
        sockets: new Map<string, Socket>(),
        get: vi.fn((id: string) => serverMock.sockets.sockets.get(id)),
      } as any,
    } as Server;
    gateway.server = serverMock;

    loggerSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    loggerSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    const mockPayload = { sub: 'testAgentId', iat: 123, exp: 123 };

    it('should allow connection for a valid token and subscribe to RabbitMQ when consume is truthy', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true); // consume is truthy

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRabbitMQService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect((client as any).agent).toEqual(mockPayload);
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should disconnect client when consume is falsy', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(false); // consume is falsy

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRabbitMQService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect((client as any).agent).toEqual(mockPayload);
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should disconnect client when consume is null', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(null); // consume is null

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRabbitMQService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect((client as any).agent).toEqual(mockPayload);
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should disconnect client and log error if no token is provided', async () => {
      const client = createMockSocket(undefined);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(undefined);
      expect(mockRabbitMQService.subscribe).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should disconnect client and log error if authService.verifyToken fails', async () => {
      const token = 'invalid.jwt.token';
      const client = createMockSocket(token);
      const error = new Error('Token verification failed');

      mockAuthService.verifyToken.mockRejectedValueOnce(error);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRabbitMQService.subscribe).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should disconnect client and log error if authService.verifyToken returns null', async () => {
      const token = 'token.returns.null';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(null);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRabbitMQService.subscribe).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should get token from authorization header if auth.token is not present', async () => {
      const token = 'valid.jwt.token.from.header';
      const client = createMockSocket();
      client.handshake.auth.token = undefined;
      client.handshake.headers.authorization = `Bearer ${token}`;

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRabbitMQService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect((client as any).agent).toEqual(mockPayload);
    });

    it('should prioritize auth.token over authorization header', async () => {
      const authToken = 'auth.token';
      const headerToken = 'header.token';
      const client = createMockSocket(authToken);
      client.handshake.headers.authorization = `Bearer ${headerToken}`;

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(authToken);
      expect(mockRabbitMQService.subscribe).toHaveBeenCalledWith('testAgentId');
    });

    it('should disconnect client and log error if RabbitMQ subscribe throws an error', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);
      const rabbitmqError = new Error('RabbitMQ connection failed');

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockRejectedValueOnce(rabbitmqError);

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(mockRabbitMQService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should handle empty token string', async () => {
      const client = createMockSocket();
      client.handshake.auth.token = '';
      client.handshake.headers.authorization = '';

      mockAuthService.verifyToken.mockRejectedValueOnce(new Error('Empty token'));

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith('');
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should handle missing handshake data gracefully', async () => {
      const client = createMockSocket();
      Object.defineProperty(client, 'handshake', {
        value: null,
        writable: true,
        configurable: true,
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should handle authorization header without Bearer prefix', async () => {
      const token = 'token.without.bearer';
      const client = createMockSocket();
      client.handshake.auth.token = undefined;
      client.handshake.headers.authorization = token;

      await gateway.handleConnection(client);

      expect(mockAuthService.verifyToken).toHaveBeenCalledWith(token);
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should log agent disconnection and unsubscribe from RabbitMQ when agent exists', async () => {
      const mockAgentId = 'agent-123';
      const client = createMockSocket(undefined, { sub: mockAgentId }, 'mockSocketId456');

      mockRabbitMQService.unsubscribe.mockResolvedValueOnce(undefined);

      await gateway.handleDisconnect(client);

      expect(mockRabbitMQService.unsubscribe).toHaveBeenCalledWith(mockAgentId);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Agent disconnected: ${mockAgentId} (Socket ID: ${client.id})`,
      );
    });

    it('should handle disconnection when agent data is missing', async () => {
      const client = createMockSocket(undefined, undefined, 'mockSocketId789');

      await gateway.handleDisconnect(client);

      expect(mockRabbitMQService.unsubscribe).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        `Agent disconnected: undefined (Socket ID: ${client.id})`,
      );
    });

    it('should handle disconnection when agent.sub is missing', async () => {
      const client = createMockSocket(undefined, {}, 'mockSocketId101');

      await gateway.handleDisconnect(client);

      expect(mockRabbitMQService.unsubscribe).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        `Agent disconnected: undefined (Socket ID: ${client.id})`,
      );
    });

    it('should handle RabbitMQ unsubscribe failure gracefully', async () => {
      const mockAgentId = 'agent-456';
      const client = createMockSocket(undefined, { sub: mockAgentId }, 'mockSocketId102');
      const rabbitmqError = new Error('Failed to unsubscribe');

      mockRabbitMQService.unsubscribe.mockRejectedValueOnce(rabbitmqError);

      // The method doesn't throw errors anymore, it handles them internally
      await expect(gateway.handleDisconnect(client)).rejects.toThrow('Failed to unsubscribe');

      expect(mockRabbitMQService.unsubscribe).toHaveBeenCalledWith(mockAgentId);
    });

    it('should handle client without agent property', async () => {
      const client = createMockSocket(undefined, undefined, 'mockSocketId103');
      delete (client as any).agent;

      await gateway.handleDisconnect(client);

      expect(mockRabbitMQService.unsubscribe).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        `Agent disconnected: undefined (Socket ID: ${client.id})`,
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

    it('should handle empty message', () => {
      const client = createMockSocket(undefined, { sub: 'testAgent' }, 'messageSocketId');
      const messageData = '';

      gateway.handleMessage(client, messageData);

      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: ${messageData}`);
    });

    it('should handle null/undefined message', () => {
      const client = createMockSocket(undefined, { sub: 'testAgent' }, 'messageSocketId');

      gateway.handleMessage(client, null as any);
      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: null`);

      gateway.handleMessage(client, undefined as any);
      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: undefined`);
    });

    it('should handle object message', () => {
      const client = createMockSocket(undefined, { sub: 'testAgent' }, 'messageSocketId');
      const messageData = { type: 'test', payload: 'data' };

      gateway.handleMessage(client, messageData as any);

      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: [object Object]`);
    });

    it('should handle numeric message', () => {
      const client = createMockSocket(undefined, { sub: 'testAgent' }, 'messageSocketId');
      const messageData = 12345;

      gateway.handleMessage(client, messageData as any);

      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: 12345`);
    });

    it('should handle boolean message', () => {
      const client = createMockSocket(undefined, { sub: 'testAgent' }, 'messageSocketId');

      gateway.handleMessage(client, true as any);
      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: true`);

      gateway.handleMessage(client, false as any);
      expect(loggerSpy).toHaveBeenCalledWith(`${client.id} sent message to DMR: false`);
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle verifyToken throwing non-Error objects', async () => {
      const token = 'valid.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockRejectedValueOnce('String error');

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should handle subscribe being called with undefined sub', async () => {
      const token = 'valid.token';
      const client = createMockSocket(token);
      const payloadWithoutSub = { iat: 123, exp: 123 };

      mockAuthService.verifyToken.mockResolvedValueOnce(payloadWithoutSub as any);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);

      await gateway.handleConnection(client);

      expect(mockRabbitMQService.subscribe).toHaveBeenCalledWith(undefined);
      expect((client as any).agent).toEqual(payloadWithoutSub);
    });

    it('should handle client.disconnect throwing an error', async () => {
      const client = createMockSocket('invalid.token');
      const disconnectError = new Error('Disconnect failed');
      client.disconnect = vi.fn().mockImplementation(() => {
        throw disconnectError;
      });

      mockAuthService.verifyToken.mockRejectedValueOnce(new Error('Invalid token'));

      await expect(gateway.handleConnection(client)).rejects.toThrow('Disconnect failed');

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });
  });
});
