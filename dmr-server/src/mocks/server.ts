import { setupServer } from 'msw/node';
import { handlers } from './handlers/response';

export const server = setupServer(...handlers);
