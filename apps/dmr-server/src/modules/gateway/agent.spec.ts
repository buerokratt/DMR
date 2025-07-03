import {
  AgentEncryptedMessageDto,
  AgentEventNames,
  JwtPayload,
  MessageType,
  SocketAckStatus,
  ValidationErrorType,
} from '@dmr/shared';
import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricService } from '../../libs/metrics';
import { RabbitMQService } from '../../libs/rabbitmq';
import { RabbitMQMessageService } from '../../libs/rabbitmq/rabbitmq-message.service';
import { AuthService } from '../auth/auth.service';
import { CentOpsService } from '../centops/centops.service';
import { AgentGateway } from './agent.gateway';
import { MessageValidatorService } from './message-validator.service';

declare module 'socket.io' {
  interface Socket {
    agent: JwtPayload;
  }
}

const mockCounter = {
  inc: vi.fn(),
};

const mockGauge = {
  inc: vi.fn(),
  dec: vi.fn(),
};

const mockHistogram = {
  observe: vi.fn(),
  startTimer: vi.fn(() => vi.fn()),
};

const mockAuthService = {
  verifyToken: vi.fn(),
};

const mockRabbitMQService = {
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  setupQueue: vi.fn(),
  channel: {
    sendToQueue: vi.fn(),
  },
};

const mockMetricService = {
  errorsTotalCounter: mockCounter,
  activeConnectionGauge: mockGauge,
  connectionsTotalCounter: mockCounter,
  disconnectionsTotalCounter: mockCounter,
  eventsReceivedTotalCounter: mockCounter,
  eventsSentTotalCounter: mockCounter,
  socketConnectionDurationSecondsHistogram: mockHistogram,
  messageProcessingDurationSecondsHistogram: mockHistogram,
};

const mockRabbitMQMessageService = {
  sendValidMessage: vi.fn(),
  sendValidationFailure: vi.fn(),
};

const mockCentOpsService = {
  getCentOpsConfigurations: vi.fn(),
};

const mockMessageValidatorService = {
  validateMessage: vi.fn(),
};

describe('AgentGateway', () => {
  let gateway: AgentGateway;
  let authService: AuthService;
  let rabbitService: RabbitMQService;
  let centOpsService: CentOpsService;
  let messageValidatorService: MessageValidatorService;
  let rabbitMQMessageService: RabbitMQMessageService;
  let loggerSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
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
      emitWithAck: vi.fn(),
      on: vi.fn(),
      onAny: vi.fn(),
      onAnyOutgoing: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      removeAllListeners: vi.fn(),
    };
    return mockSocket as Socket;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        AgentGateway,
        { provide: AuthService, useValue: mockAuthService },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
        { provide: MessageValidatorService, useValue: mockMessageValidatorService },
        { provide: RabbitMQMessageService, useValue: mockRabbitMQMessageService },
        { provide: MetricService, useValue: mockMetricService },
        { provide: CentOpsService, useValue: mockCentOpsService },
      ],
    }).compile();

    gateway = module.get<AgentGateway>(AgentGateway);
    authService = module.get<AuthService>(AuthService);
    rabbitService = module.get<RabbitMQService>(RabbitMQService);
    messageValidatorService = module.get<MessageValidatorService>(MessageValidatorService);
    centOpsService = module.get<CentOpsService>(CentOpsService);
    rabbitMQMessageService = module.get(RabbitMQMessageService);

    const mockSocketsMap = new Map<string, Socket>();

    serverMock = {
      sockets: {
        get sockets() {
          return mockSocketsMap;
        },
        get: vi.fn((id: string) => mockSocketsMap.get(id)),
      },
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as any as Server;

    (serverMock as any).setMockSockets = (socketsArray: [string, Socket][]) => {
      mockSocketsMap.clear();
      socketsArray.forEach(([id, socket]) => mockSocketsMap.set(id, socket));
    };

    gateway.server = serverMock;

    loggerSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    loggerErrorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    loggerWarnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    const mockPayload = { sub: 'testAgentId', iat: 123, exp: 123, cat: 175 };

    it('should allow connection and emit full agent list when consume is truthy', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.setupQueue.mockResolvedValueOnce(true);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(rabbitService.setupQueue).toHaveBeenCalledWith('testAgentId');
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
      mockRabbitMQService.setupQueue.mockResolvedValueOnce(true);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(false);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(rabbitService.setupQueue).toHaveBeenCalledWith('testAgentId');
      expect(rabbitService.subscribe).toHaveBeenCalledWith('testAgentId');
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect((client as any).agent).toEqual(mockPayload);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to subscribe to queue for agent testAgentId',
        'AgentGateway',
      );
    });

    it('should disconnect client when consume is null', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.setupQueue.mockResolvedValueOnce(true);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(null);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(client);

      expect(rabbitService.setupQueue).toHaveBeenCalledWith('testAgentId');
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
        `Error during agent socket connection: ${client.id} - Cannot read properties of undefined (reading 'sub')`,
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
      mockRabbitMQService.setupQueue.mockResolvedValueOnce(true);
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
      mockRabbitMQService.setupQueue.mockResolvedValueOnce(true);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce([]);

      await gateway.handleConnection(client);

      expect(rabbitService.setupQueue).toHaveBeenCalledWith(undefined);
      expect(rabbitService.subscribe).toHaveBeenCalledWith(undefined);
    });

    it('should disconnect client when setupQueue fails', async () => {
      const token = 'valid.jwt.token';
      const client = createMockSocket(token);

      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.setupQueue.mockResolvedValueOnce(false);

      await gateway.handleConnection(client);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(rabbitService.setupQueue).toHaveBeenCalledWith('testAgentId');
      expect(rabbitService.subscribe).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledOnce();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to set up queue for agent testAgentId',
        'AgentGateway',
      );
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

    it('should drop existing connection when a new connection is made by the same agent', async () => {
      // Create existing socket for agent
      const existingSocket = createMockSocket(
        'existing.token',
        { sub: 'testAgentId' },
        'existing-socket',
      );
      const newClient = createMockSocket('new.token', undefined, 'new-socket');

      // Setup mock server with existing socket
      (serverMock as any).setMockSockets([['existing-socket', existingSocket]]);

      // Setup mocks for successful authentication and subscription
      mockAuthService.verifyToken.mockResolvedValueOnce(mockPayload);
      mockRabbitMQService.setupQueue.mockResolvedValueOnce(true);
      mockRabbitMQService.subscribe.mockResolvedValueOnce(true);
      mockCentOpsService.getCentOpsConfigurations.mockResolvedValueOnce(['agentA']);

      await gateway.handleConnection(newClient);

      // Verify existing socket was disconnected
      expect(existingSocket.disconnect).toHaveBeenCalledOnce();

      // Verify we unsubscribed from the old connection's queue
      expect(rabbitService.unsubscribe).toHaveBeenCalledWith('testAgentId');

      // Verify we set up the queue for the new connection
      expect(rabbitService.setupQueue).toHaveBeenCalledWith('testAgentId');

      // Verify we subscribed for the new connection
      expect(rabbitService.subscribe).toHaveBeenCalledWith('testAgentId');

      // Verify we logged the action
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Dropping existing connection for agent testAgentId`),
      );
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

  describe('forwardMessageToAgent', () => {
    beforeEach(() => {
      mockRabbitMQMessageService.sendValidMessage.mockResolvedValue(undefined);
      mockRabbitMQMessageService.sendValidationFailure.mockResolvedValue(undefined);
      mockHistogram.startTimer.mockClear();
    });

    it('should forward message to the correct agent socket', () => {
      // Setup mock sockets
      const mockSocket1 = createMockSocket('token1', { sub: 'agent-123' }, 'socket-1');
      const mockSocket2 = createMockSocket('token2', { sub: 'agent-456' }, 'socket-2');

      // Add sockets to the server's sockets collection
      (serverMock as any).setMockSockets([
        ['socket-1', mockSocket1],
        ['socket-2', mockSocket2],
      ]);

      const testMessage = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-123',
        type: MessageType.ChatMessage,
        payload: '{"key":"value"}',
      };

      gateway.forwardMessageToAgent('agent-123', testMessage);

      expect(mockSocket1.emitWithAck).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        testMessage,
      );

      expect(mockSocket2.emit).not.toHaveBeenCalled();
    });

    it('should handle DELIVERY_FAILED error from dmr agent', async () => {
      // Setup mock sockets
      const mockSocket1 = createMockSocket('token1', { sub: 'agent-123' }, 'socket-1');
      const mockSocket2 = createMockSocket('token2', { sub: 'agent-456' }, 'socket-2');

      // Add sockets to the server's sockets collection
      (serverMock as any).setMockSockets([
        ['socket-1', mockSocket1],
        ['socket-2', mockSocket2],
      ]);

      const testMessage = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-123',
        type: MessageType.ChatMessage,
        payload: '{"key":"value"}',
        receivedAt: '2025-06-18T14:00:00Z',
      };

      const mockSocket1Spy = vi.spyOn(mockSocket1, 'emitWithAck').mockResolvedValue({
        status: SocketAckStatus.ERROR,
        errors: [
          {
            type: ValidationErrorType.DELIVERY_FAILED,
            message: 'Failed to deliver message to External Service',
          },
        ],
      });

      const response = await gateway.forwardMessageToAgent('agent-123', testMessage);

      expect(response).toEqual(
        expect.objectContaining({
          status: SocketAckStatus.ERROR,
          errors: expect.arrayContaining([
            expect.objectContaining({
              type: ValidationErrorType.DELIVERY_FAILED,
              message: 'Failed to deliver message to External Service',
            }),
          ]),
        }),
      );
      expect(mockRabbitMQMessageService.sendValidationFailure).toHaveBeenCalledWith(
        testMessage,
        response?.errors ?? [],
        testMessage.receivedAt ?? '2025-06-18T14:00:00Z',
      );
      expect(mockSocket1Spy).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        testMessage,
      );

      expect(mockSocket2.emit).not.toHaveBeenCalled();
    });

    it('should handle DECRYPTION_FAILED error from dmr agent', async () => {
      // Setup mock sockets
      const mockSocket1 = createMockSocket('token1', { sub: 'agent-123' }, 'socket-1');
      const mockSocket2 = createMockSocket('token2', { sub: 'agent-456' }, 'socket-2');

      // Add sockets to the server's sockets collection
      (serverMock as any).setMockSockets([
        ['socket-1', mockSocket1],
        ['socket-2', mockSocket2],
      ]);

      const testMessage = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-123',
        type: MessageType.ChatMessage,
        payload: '{"key":"value"}',
        receivedAt: '2025-06-18T14:00:00Z',
      };

      const mockSocket1Spy = vi.spyOn(mockSocket1, 'emitWithAck').mockResolvedValue({
        status: SocketAckStatus.ERROR,
        errors: [
          {
            type: ValidationErrorType.DECRYPTION_FAILED,
            message: 'Failed to decrypt message from DMR Server',
          },
        ],
      });

      const response = await gateway.forwardMessageToAgent('agent-123', testMessage);

      expect(mockSocket1Spy).toHaveBeenCalledWith(
        AgentEventNames.MESSAGE_FROM_DMR_SERVER,
        testMessage,
      );

      expect(mockRabbitMQMessageService.sendValidationFailure).not.toHaveBeenCalled();
      expect(mockSocket2.emit).not.toHaveBeenCalled();

      expect(response).toEqual(
        expect.objectContaining({
          status: SocketAckStatus.ERROR,
          errors: expect.arrayContaining([
            expect.objectContaining({
              type: ValidationErrorType.DECRYPTION_FAILED,
              message: 'Failed to decrypt message from DMR Server',
            }),
          ]),
        }),
      );
    });

    it('should log warning when no socket found for agent', () => {
      // Setup server with no matching socket
      (serverMock as any).setMockSockets([]);

      const testMessage = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-789',
        type: MessageType.ChatMessage,
        payload: '{"key":"value"}',
      };

      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      gateway.forwardMessageToAgent('agent-789', testMessage);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No connected socket found for agent agent-789'),
      );
    });

    it('should handle errors during message forwarding', () => {
      // Setup mock socket that throws on emit
      const mockSocket = createMockSocket('token1', { sub: 'agent-123' }, 'socket-1');
      (mockSocket.emitWithAck as any).mockImplementation(() => {
        throw new Error('Socket error');
      });

      (serverMock as any).setMockSockets([['socket-1', mockSocket]]);

      const testMessage = {
        id: 'msg-123',
        timestamp: '2025-06-18T14:00:00Z',
        senderId: 'server-id',
        recipientId: 'agent-123',
        type: MessageType.ChatMessage,
        payload: '{"key":"value"}',
      };

      const errorSpy = vi.spyOn(gateway['logger'], 'error');

      gateway.forwardMessageToAgent('agent-123', testMessage);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error forwarding RabbitMQ message to agent: Socket error'),
      );
    });
  });

  describe('findSocketByAgentId', () => {
    it('should return socket for the specified agent ID', () => {
      // Setup mock sockets
      const mockSocket1 = createMockSocket('token1', { sub: 'agent-123' }, 'socket-1');
      const mockSocket2 = createMockSocket('token2', { sub: 'agent-456' }, 'socket-2');

      (serverMock as any).setMockSockets([
        ['socket-1', mockSocket1],
        ['socket-2', mockSocket2],
      ]);

      const socket = (gateway as any).findSocketByAgentId('agent-123');

      expect(socket).toBe(mockSocket1);
    });

    it('should return null when no socket found', () => {
      // Setup server with no matching socket
      (serverMock as any).setMockSockets([
        ['socket-2', createMockSocket('token2', { sub: 'agent-456' }, 'socket-2')],
      ]);

      const socket = (gateway as any).findSocketByAgentId('agent-789');

      expect(socket).toBeNull();
    });

    it('should return only the first socket when multiple sockets exist for the same agent', () => {
      // Setup multiple sockets for the same agent
      const mockSocket1 = createMockSocket('token1', { sub: 'agent-123' }, 'socket-1');
      const mockSocket3 = createMockSocket('token3', { sub: 'agent-123' }, 'socket-3');

      (serverMock as any).setMockSockets([
        ['socket-1', mockSocket1],
        ['socket-3', mockSocket3],
      ]);

      const socket = (gateway as any).findSocketByAgentId('agent-123');

      // Should return the first socket found
      expect(socket).toBe(mockSocket1);
    });
  });

  describe('handleMessage', () => {
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
    const mockValidatedMessage = {
      message: { ...message, payload: 'decrypted' },
      validationErrors: [],
    };

    beforeEach(() => {
      mockMessageValidatorService.validateMessage.mockResolvedValue(mockValidatedMessage);
      mockRabbitMQMessageService.sendValidMessage.mockResolvedValue(undefined);
      mockRabbitMQMessageService.sendValidationFailure.mockResolvedValue(undefined);
      mockHistogram.startTimer.mockClear();
    });

    it('should validate and send a valid message, returning OK status', async () => {
      const result = await gateway.handleMessage(mockClient, message);

      expect(mockMessageValidatorService.validateMessage).toHaveBeenCalledWith(
        message,
        expect.any(String),
      );
      expect(mockRabbitMQMessageService.sendValidMessage).toHaveBeenCalledWith(
        mockValidatedMessage.message,
        expect.any(String),
      );
      expect(result).toEqual({ status: SocketAckStatus.OK });
      expect(loggerSpy).toHaveBeenCalledWith(
        `Received valid message from agent ${mockValidatedMessage.message.senderId} to ${mockValidatedMessage.message.recipientId} (ID: ${mockValidatedMessage.message.id})`,
      );
      expect(mockHistogram.startTimer).toHaveBeenCalled();
    });

    it('should return error and send validation failure if message validation fails with BadRequestException', async () => {
      const validationErrors = [
        { property: 'payload', constraints: { isNotEmpty: 'Payload should not be empty' } },
      ];
      const badRequestError = new BadRequestException({
        message: 'Invalid message',
        validationErrors: validationErrors,
        originalMessage: message,
        receivedAt: new Date().toISOString(),
      });
      mockMessageValidatorService.validateMessage.mockRejectedValue(badRequestError);

      const result = await gateway.handleMessage(mockClient, message);

      expect(mockMessageValidatorService.validateMessage).toHaveBeenCalledWith(
        message,
        expect.any(String),
      );
      expect(mockRabbitMQMessageService.sendValidationFailure).toHaveBeenCalledWith(
        message,
        validationErrors,
        expect.any(String),
      );
      expect(result).toEqual({ status: SocketAckStatus.ERROR, error: 'Invalid message' });
      expect(loggerWarnSpy).toHaveBeenCalledWith(`Invalid message received: Invalid message`);
      expect(mockHistogram.startTimer).toHaveBeenCalled();
    });

    it('should return error and log unexpected error if validation throws a non-BadRequestException error', async () => {
      const unexpectedError = new Error('Something went wrong');
      mockMessageValidatorService.validateMessage.mockRejectedValue(unexpectedError);

      const result = await gateway.handleMessage(mockClient, message);

      expect(mockMessageValidatorService.validateMessage).toHaveBeenCalledWith(
        message,
        expect.any(String),
      );
      expect(mockRabbitMQMessageService.sendValidationFailure).not.toHaveBeenCalled();
      expect(result).toEqual({ status: SocketAckStatus.ERROR, error: 'Something went wrong' });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Unexpected error processing message: Something went wrong`,
      );
      expect(mockHistogram.startTimer).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions from message validator', async () => {
      mockMessageValidatorService.validateMessage.mockRejectedValue('Validation failed string');

      const result = await gateway.handleMessage(mockClient, message);

      expect(mockMessageValidatorService.validateMessage).toHaveBeenCalledWith(
        message,
        expect.any(String),
      );
      expect(mockRabbitMQMessageService.sendValidationFailure).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: SocketAckStatus.ERROR,
        error: '"Validation failed string"',
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Unexpected error processing message: Unknown error`,
      );
      expect(mockHistogram.startTimer).toHaveBeenCalled();
    });

    it('should throw error if validation succeeds but no message is returned', async () => {
      mockMessageValidatorService.validateMessage.mockResolvedValue(null);

      const result = await gateway.handleMessage(mockClient, message);

      expect(result).toEqual({
        status: SocketAckStatus.ERROR,
        error: 'Validation succeeded but no message was returned',
      });
      expect(mockRabbitMQMessageService.sendValidMessage).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Unexpected error processing message: Validation succeeded but no message was returned`,
      );
      expect(mockHistogram.startTimer).toHaveBeenCalled();
    });
  });
});
