import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('Prometheus Metrics (e2e)', () => {
  let app: INestApplication;
  let metricsEndpoint: string;
  let messagesEndpoint: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(5001);

    const port = app.getHttpServer().address().port;
    metricsEndpoint = `http://localhost:${port}/metrics`;
    messagesEndpoint = `http://localhost:${port}/messages`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should report correct request total and errors total', async () => {
    const validChatPayload = {
      chat: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        endUserFirstName: 'John',
        created: '2023-01-01T12:00:00.000Z',
      },
      messages: [
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          chatId: '123e4567-e89b-12d3-a456-426614174000',
          content: 'Hello world',
          authorTimestamp: '2023-01-01T12:00:00.000Z',
          authorFirstName: 'John',
          authorRole: 'user',
          forwardedByUser: 'system',
          forwardedFromCsa: 'csa1',
          forwardedToCsa: 'csa2',
        },
      ],
    };

    const messagesResponse = await request(messagesEndpoint).post('').send(validChatPayload);
    const metricsResponse = await request(metricsEndpoint).get('');

    expect(messagesResponse.statusCode).toBe(500);
    expect(metricsResponse.statusCode).toBe(200);
    expect(metricsResponse.text).toMatch(
      'dmr_http_requests_total{route="/messages",method="POST"} 1',
    );
    expect(metricsResponse.text).toMatch(
      'dmr_http_errors_total{route="/messages",method="POST",status="500"} 1',
    );
  });
});
