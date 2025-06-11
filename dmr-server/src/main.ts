import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  app.use(compression());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  await app.listen(process.env.PORT ?? 5000);
  if (process.env.NODE_ENV === 'development') {
    const logger = new Logger('bootstrap');
    logger.log(`Listening on ${await app.getUrl()}`);

    const { setupServer } = await import('msw/node');
    const { handlers } = await import('./mocks/handlers/centops.response');

    const server = setupServer(...handlers);
    server.listen();
  }
}
bootstrap();
