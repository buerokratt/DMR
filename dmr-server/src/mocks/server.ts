import { setupServer } from 'msw/node';

import { handlers } from './handlers/centops.response';

export const server = setupServer(...handlers);
