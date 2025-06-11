import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  app.use(compression());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const port = process.env.PORT;
  await app.listen(port);
  if (process.env.NODE_ENV === 'development') {
    const logger = new Logger('bootstrap');
    logger.log(`Listening on ${await app.getUrl()}`);
  }
  Logger.log(`🚀 Application is running on: http://localhost:${port}`);
}

void bootstrap();
