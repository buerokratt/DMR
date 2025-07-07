import { ConsoleLogger, LogLevel, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { setupServer } from 'msw/node';
import { AppModule } from './app.module';
import { APP_CONFIG_TOKEN, AppConfig, GlobalConfig } from './common/config';
import { handlers } from './mocks/handlers/centops.response';

async function bootstrap(): Promise<void> {
  const logger = new ConsoleLogger({
    logLevels: (process.env.LOGGER_LOG_LEVELS?.split(',') as LogLevel[]) || [
      'error',
      'warn',
      'log',
    ],
    timestamp: true,
    colors: process.env.LOGGER_COLORS === 'true',
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
    bufferLogs: true,
    logger,
  });

  const configService = app.get<ConfigService<GlobalConfig>>(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>(APP_CONFIG_TOKEN);

  app.use(compression());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  if (appConfig.mswEnable) {
    logger.log('Mock values enabled - starting MSW server');

    const server = setupServer(...handlers);
    server.listen({
      onUnhandledRequest: 'bypass',
    });
  }

  await app.listen(appConfig.port);

  if (appConfig.environment === 'development') {
    logger.log(`Listening on ${await app.getUrl()}`);
  }
}

void bootstrap();
