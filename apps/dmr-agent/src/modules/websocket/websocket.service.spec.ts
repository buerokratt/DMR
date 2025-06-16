import { describe, it, expect, beforeEach, vi, afterEach, type MockInstance } from 'vitest';
import { WebsocketService } from './websocket.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

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
  let configService: ConfigService;
  let jwtService: JwtService;

  beforeEach(() => {
    vi.clearAllMocks();
    configService = {
      get: vi.fn((key: string) => {
        const defaults = {
          DMR_SERVER_WEBSOCKET_URL: 'http://localhost:3000',
          AGENT_ID: 'test-agent',
          AGENT_PRIVATE_KEY: 'test-private-key',
          WEBSOCKET_RECONNECTION_DELAY: 1000,
          WEBSOCKET_DELAY_MAX: 5000,
        };
        return defaults[key];
      }),
    } as unknown as ConfigService;

    jwtService = {
      sign: mockJwtSign,
    } as unknown as JwtService;

    service = new WebsocketService(configService, jwtService);
  });

  it('should generate a JWT token correctly', () => {
    const token = 'signed-jwt';
    mockJwtSign.mockReturnValue(token);

    const result = service['generateJwtToken']('agent123', 'private-key-xyz');
    expect(mockJwtSign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'agent123' }),
      expect.objectContaining({
        algorithm: 'RS256',
        privateKey: 'private-key-xyz',
        keyid: 'agent123',
      }),
    );
    expect(result).toBe(token);
  });

  it('should log an error if DMR_SERVER_WEBSOCKET_URL is not configured', async () => {
    vi.spyOn(Logger.prototype, 'error');
    vi.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'DMR_SERVER_WEBSOCKET_URL') return undefined;
      return 'mocked';
    });

    await service['connectToServer']();

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'DMR_SERVER_WEBSOCKET_URL is not configured',
    );
  });

  it('should establish socket connection with proper auth', async () => {
    const { io } = await import('socket.io-client');
    mockJwtSign.mockReturnValue('test-token');

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
