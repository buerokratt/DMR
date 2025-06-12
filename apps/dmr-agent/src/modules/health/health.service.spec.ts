import { beforeEach, describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  it('should return ok status', () => {
    const result = service.getStatus();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeTypeOf('number');
    expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    expect(result.timestamp).toBeGreaterThan(Date.now() - 1000); // Should be recent
  });
});
