import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HealthModule } from '../src/modules/health/health.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/v1/health (GET)', async () => {
    type HealthResponse = { status: string; timestamp: number };

    const response = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200)
      .expect('Content-Type', /json/);

    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('number');
    expect(body.timestamp).toBeLessThanOrEqual(Date.now());
    expect(body.timestamp).toBeGreaterThan(Date.now() - 1000); // Should be recent
  });
});
