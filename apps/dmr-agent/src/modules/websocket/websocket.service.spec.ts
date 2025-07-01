import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { agentConfig, webSocketConfig } from '../../common/config';
import { WebsocketService } from './websocket.service';

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

const mockJwtSign = vi.fn();
const mockSocket = {
  on: vi.fn(),
  disconnect: vi.fn(),
  auth: {},
  connected: true,
  id: 'test-socket-id',
  recovered: false,
};

describe('WebsocketService', () => {
  let service: WebsocketService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsocketService,
        {
          provide: agentConfig.KEY,
          useValue: {
            id: 'test-agent',
            privateKey: 'test-private-key',
          },
        },
        {
          provide: webSocketConfig.KEY,
          useValue: {
            reconnectionDelayMin: 1000,
            reconnectionDelayMax: 5000,
            url: 'http://localhost:3000',
            namespace: 'namespace',
            messageDeliveryTimeoutMs: 2000,
          },
        },
        {
          provide: JwtService,
          useValue: { sign: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(WebsocketService);
    jwtService = module.get(JwtService);
    vi.clearAllMocks();
  });

  it('should generate a JWT token correctly', () => {
    const token = 'signed-jwt';

    vi.spyOn(jwtService, 'sign').mockReturnValue(token);

    const result = service['generateJwtToken']('agent123', 'private-key-xyz');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'agent123' }),
      expect.objectContaining({
        algorithm: 'RS256',
        privateKey: 'private-key-xyz',
        keyid: 'agent123',
      }),
    );
    expect(result).toBe(token);
  });

  it('should establish socket connection with proper auth', async () => {
    const { io } = await import('socket.io-client');
    vi.spyOn(jwtService, 'sign').mockReturnValue('test-token');

    (io as unknown as MockInstance).mockImplementation((_url, options) => {
      // Verify auth is an object with token property
      expect(options.auth).toEqual({ token: 'test-token' });
      return mockSocket;
    });

    service['connectToServer']();

    expect(io).toHaveBeenCalled();
    expect(service['socket']).toBe(mockSocket);
  });

  it('should set up event listeners after connection', async () => {
    service['socket'] = mockSocket as any;

    service['setupSocketEventListeners']();

    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('reconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('reconnect_error', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
  });

  it('isConnected() should return true when socket is connected', () => {
    service['socket'] = { connected: true } as any;
    expect(service.isConnected()).toBe(true);
  });

  it('disconnect() should call socket.disconnect()', () => {
    service['socket'] = mockSocket as any;

    service.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('onModuleDestroy() should call disconnect() and log shutdown message', () => {
    const disconnectSpy = vi.spyOn(service, 'disconnect');
    const logSpy = vi.spyOn(Logger.prototype, 'log');

    service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Socket disconnected on application shutdown');
  });
});
