import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { RabbitMQService } from '../src/libs/rabbitmq';
import { AuthService } from '../src/modules/auth/auth.service';
import { CentOpsService } from '../src/modules/centops/centops.service';
import { AgentConnectionData } from '@dmr/shared';

function createMockJwtWithKidAndSub(kid: string): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid,
  };

  const payload = {
    sub: kid,
    name: 'Mock User',
    iat: Math.floor(Date.now() / 1000),
  };

  const encode = (object: object) => Buffer.from(JSON.stringify(object)).toString('base64url');

  return `${encode(header)}.${encode(payload)}.${kid}`;
}

describe('WebSocket Metrics (e2e)', () => {
  let app: INestApplication;
  let client1: Socket;
  let client2: Socket;
  let metricsEndpoint: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CentOpsService)
      .useValue({
        onModuleInit: () => {},
        onModuleDestroy: () => {},
        getCentOpsConfigurations: () => [],
        getCentOpsConfigurationByClientId: () => ({
          id: 'mock-id',
          name: 'mock-name',
          authenticationCertificate: 'mock-cert',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      })
      .overrideProvider(AuthService)
      .useValue({
        verifyToken: (token: string): AgentConnectionData => {
          const [, payload] = token.split('.');
          const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
          return {
            jwtPayload: {
              sub: decodedPayload.sub,
              cat: Date.now(),
              iat: 123,
              exp: 123,
            },
            authenticationCertificate: 'certificate',
          };
        },
      })
      .overrideProvider(RabbitMQService)
      .useValue({
        setupQueue: () => true,
        subscribe: () => true,
        unsubscribe: () => true,
        checkQueue: () => true,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(5001);

    const port = app.getHttpServer().address().port;
    const namespace = process.env.WEB_SOCKET_NAMESPACE ?? '/v1/dmr-agent-events';
    const wsUrl = `http://localhost:${port}${namespace}`;
    metricsEndpoint = `http://localhost:${port}/metrics`;

    const mockClientId1 = 'mock-id-1';
    const mockAuthToken1 = createMockJwtWithKidAndSub(mockClientId1);

    client1 = io(wsUrl, {
      autoConnect: false,
      auth: { token: mockAuthToken1 },
      transports: ['websocket'],
    });

    const mockClientId2 = 'mock-id-2';
    const mockAuthToken2 = createMockJwtWithKidAndSub(mockClientId2);

    client2 = io(wsUrl, {
      autoConnect: false,
      auth: { token: mockAuthToken2 },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      client1.connect();
      client1.on('connect', () => {
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      client2.connect();
      client2.on('connect', () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    client1.disconnect();
    client2.disconnect();
    await app.close();
  });

  it('should report correct active and total WebSocket connections', async () => {
    const response = await request(metricsEndpoint).get('');

    expect(response.statusCode).toBe(200);
    expect(response.text).toMatch(/dmr_socket_connections_active\s+2/);
    expect(response.text).toMatch(/dmr_socket_connections_total\s+2/);
  });
});
