import { afterAll, beforeAll, vi } from 'vitest';

import('reflect-metadata');

beforeAll(() => {
  // Add any global setup here
});

afterAll(() => {
  // Add any global cleanup here
  vi.resetModules();
});
