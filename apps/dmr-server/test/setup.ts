import 'reflect-metadata';
import { afterAll, beforeAll, vi } from 'vitest';

beforeAll(() => {
  // Add any global setup here
});

afterAll(() => {
  // Add any global cleanup here
  vi.resetModules();
});
