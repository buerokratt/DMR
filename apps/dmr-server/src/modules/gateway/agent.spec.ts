import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { RabbitMQService } from '../../libs/rabbitmq';
import { CentOpsService } from '../centops/centops.service';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest';
import { AgentEncryptedMessageDto, JwtPayload, MessageType } from '@dmr/shared';
import { AgentGateway } from './agent.gateway';
import { AgentEventNames } from '@dmr/shared';

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
  channel: {
    sendToQueue: vi.fn(),
  },
};

const mockCentOpsService = {
  getCentOpsConfigurations: vi.fn(),
};

describe('AgentGateway', () => {
  let gateway: AgentGateway;
  let authService: AuthService;
  let rabbitService: RabbitMQService;
  let centOpsService: CentOpsService;
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
        { provide: AuthService, useValue: mockAuthService },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
        { provide: CentOpsService, useValue: mockCentOpsService },
      ],
    }).compile();

    gateway = module.get<AgentGateway>(AgentGateway);
    authService = module.get<AuthService>(AuthService);
    rabbitService = module.get<RabbitMQService>(RabbitMQService);
    centOpsService = module.get<CentOpsService>(CentOpsService);

    serverMock = {
      sockets: {
        sockets: new Map<string, Socket>(),
        get: vi.fn((id: string) => serverMock.sockets.sockets.get(id)),
      },
      emit: vi.fn(),
    } as any as Server;
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

    it('should allow connection and emit full agent list when consume is truthy', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(rabbitService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(centOpsService.getCentOpsConfigurations).toHaveBeenCalled();
      expect(serverMock.emit).toHaveBeenCalledWith(AgentEventNames.FULL_AGENT_LIST, ['agentA']);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect((client as any).agent).toEqual(mockPayload);
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should disconnect client when consume is falsy', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(false);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(rabbitService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect((client as any).agent).toEqual(mockPayload);
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should disconnect client when consume is null', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(null);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(rabbitService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).toHaveBeenCalledOnce();
    });

    it('should disconnect client and log error if no token', async () => {
      const client = createMockSocket(undefined);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(undefined);
      expect(rabbitService.subscribe).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during agent socket connection: ${client.id}`,
        'AgentGateway',
      );
    });

    it('should handle verifyToken error', async () => {
      const token = 'invalid.jwt.token';
      const client = createMockSocket(token);
      mockAuthService.verifyToken.mockRejectedValueOnce(new Error('fail'));

      await gateway.handleConnection(client);

      expect(rabbitService.subscribe).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should disconnect if verifyToken returns null', async () => {
      const token = 'token.null';
      const client = createMockSocket(token);
      mockAuthService.verifyToken.mockResolvedValueOnce(null);

      await gateway.handleConnection(client);

      expect(rabbitService.subscribe).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledOnce();
    });

    it('should get token from header if missing in auth', async () => {
      const token = 'header.jwt.token';
      const client = createMockSocket();
      client.handshake.auth.token = undefined;
      client.handshake.headers.authorization = `Bearer ${token}`;

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(serverMock.emit).toHaveBeenCalled();
    });

    it('should prefer auth.token over header', async () => {
      const authToken = 'auth.token';
      const headerToken = 'header.token';
      const client = createMockSocket(authToken);
      client.handshake.headers.authorization = `Bearer ${headerToken}`;

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(authToken);
    });

    it('should disconnect if subscribe throws error', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);
      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.subscribe.mockRejectedValueOnce(new Error('rabbit fail'));

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should handle empty token string', async () => {
      const client = createMockSocket();
      client.handshake.auth.token = '';
      client.handshake.headers.authorization = '';

      mockAuthService.verifyToken.mockRejectedValueOnce(new Error('Empty token'));

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith('');
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should handle missing handshake gracefully', async () => {
      const client = createMockSocket();
      Object.defineProperty(client, 'handshake', {
        value: null,
        writable: true,
        configurable: true,
      });

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should handle authorization header without Bearer', async () => {
      const token = 'token.noBearer';
      const client = createMockSocket();
      client.handshake.auth.token = undefined;
      client.handshake.headers.authorization = token;

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should handle non-Error thrown from verifyToken', async () => {
      const token = 'some.token';
      const client = createMockSocket(token);
      mockAuthService.verifyToken.mockRejectedValueOnce('string error');

      await gateway.handleConnection(client);

      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should call subscribe with undefined sub', async () => {
      const token = 'no.sub.token';
      const client = createMockSocket(token);
      mockAuthService.verifyToken.mockResolvedValueOnce({ iat: 1, exp: 2 } as any);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce([]);

      await gateway.handleConnection(client);

      expect(rabbitService.subscribe).toHaveBeenCalledWith(undefined);
    });

    it('should propagate disconnect errors', async () => {
      const client = createMockSocket('bad.token');
      client.disconnect = vi.fn().mockImplementation(() => {
        throw new Error('disconnect fail');
      });
      mockAuthService.verifyToken.mockRejectedValueOnce(new Error('fail'));

      await expect(gateway.handleConnection(client)).rejects.toThrow('disconnect fail');
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should unsubscribe and log when agent exists', async () => {
      const client = createMockSocket(undefined, { sub: 'agent-123' }, 'id1');
      mockRabbitMQService.unsubscribe.mockResolvedValueOnce(undefined);

      await gateway.handleDisconnect(client);

      expect(rabbitService.unsubscribe).toHaveBeenCalledWith('agent-123');
      expect(loggerSpy).toHaveBeenCalledWith(`Agent disconnected: agent-123 (Socket ID: id1)`);
    });

    it('should log even without agent', async () => {
      const client = createMockSocket(undefined, undefined, 'id2');

      await gateway.handleDisconnect(client);

      expect(rabbitService.unsubscribe).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(`Agent disconnected: undefined (Socket ID: id2)`);
    });

    it('should log when sub is missing', async () => {
      const client = createMockSocket(undefined, {}, 'id3');

      await gateway.handleDisconnect(client);

      expect(rabbitService.unsubscribe).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(`Agent disconnected: undefined (Socket ID: id3)`);
    });

    it('should rethrow unsubscribe errors', async () => {
      const client = createMockSocket(undefined, { sub: 'agent-456' }, 'id4');
      mockRabbitMQService.unsubscribe.mockRejectedValueOnce(new Error('fail'));

      await expect(gateway.handleDisconnect(client)).rejects.toThrow('fail');
      expect(rabbitService.unsubscribe).toHaveBeenCalledWith('agent-456');
    });

    it('should handle missing agent property', async () => {
      const client = createMockSocket(undefined, undefined, 'id5');
      delete (client as any).agent;

      await gateway.handleDisconnect(client);

      expect(rabbitService.unsubscribe).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(`Agent disconnected: undefined (Socket ID: id5)`);
    });
  });

  describe('handleMessage', () => {
    it('should log simple message', () => {
      const client = createMockSocket(undefined, { sub: 'a' }, 'mid');
      gateway.handleMessage(client, 'Hello');
      expect(loggerSpy).toHaveBeenCalledWith(`mid sent message to DMR: Hello`);
    });

    it('should cover null/undefined/object/number/boolean payloads', () => {
      const client = createMockSocket(undefined, { sub: 'a' }, 'mid');
      gateway.handleMessage(client, null as any);
      expect(loggerSpy).toHaveBeenCalledWith(`mid sent message to DMR: null`);
      gateway.handleMessage(client, undefined as any);
      expect(loggerSpy).toHaveBeenCalledWith(`mid sent message to DMR: undefined`);
      gateway.handleMessage(client, { foo: 'bar' } as any);
      expect(loggerSpy).toHaveBeenCalledWith(`mid sent message to DMR: [object Object]`);
      gateway.handleMessage(client, 123 as any);
      expect(loggerSpy).toHaveBeenCalledWith(`mid sent message to DMR: 123`);
      gateway.handleMessage(client, true as any);
      expect(loggerSpy).toHaveBeenCalledWith(`mid sent message to DMR: true`);
      gateway.handleMessage(client, false as any);
      expect(loggerSpy).toHaveBeenCalledWith(`mid sent message to DMR: false`);
    });
  });

  describe('handleMessageFromDMRAgent', () => {
    const agentId = 'agent-789';
    const mockClient = createMockSocket(undefined, { sub: agentId });
    const message: AgentEncryptedMessageDto = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      senderId: agentId,
      recipientId: 'recipient-abc',
      type: MessageType.ChatMessage,
      payload: 'secret',
    };

    beforeEach(() => {
      mockRabbitMQService.channel = {
        sendToQueue: vi.fn(),
      };
    });

    it('should send message to the correct queue and return OK status', () => {
      const result = gateway.handleMessageFromDMRAgent(mockClient, message);

      expect(mockRabbitMQService.channel.sendToQueue).toHaveBeenCalledWith(
        agentId,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );

      expect(result).toEqual({ status: 'ok' });
      expect(loggerSpy).toHaveBeenCalledWith(
        `Message from agent ${agentId} forwarded to queue: ${agentId}`,
      );
    });

    it('should return error if agent ID is missing', () => {
      const clientWithoutAgent = createMockSocket(undefined, undefined);
      const result = gateway.handleMessageFromDMRAgent(clientWithoutAgent, message);

      expect(result).toEqual({ status: 'error', error: 'Unauthorized client' });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Client not authenticated: ${clientWithoutAgent.id}`,
      );
    });

    it('should handle exceptions from sendToQueue', () => {
      const errorMessage = 'Queue failure';
      mockRabbitMQService.channel.sendToQueue = vi.fn(() => {
        throw new Error(errorMessage);
      });

      const result = gateway.handleMessageFromDMRAgent(mockClient, message);

      expect(result).toEqual({ status: 'error', error: errorMessage });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error processing message from ${agentId}: ${errorMessage}`,
      );
    });

    it('should handle non-Error exceptions from sendToQueue', () => {
      mockRabbitMQService.channel.sendToQueue = vi.fn(() => {
        throw 'string error';
      });

      const result = gateway.handleMessageFromDMRAgent(mockClient, message);

      expect(result).toEqual({ status: 'error', error: 'string error' });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error processing message from ${agentId}: string error`,
      );
    });
  });
});
