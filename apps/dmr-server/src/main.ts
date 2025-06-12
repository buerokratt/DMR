import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { setupServer } from 'msw/node';
import { AppModule } from './app.module';
import { handlers } from './mocks/handlers/centops.response';
import { APP_CONFIG_TOKEN, AppConfig, GlobalConfig } from './common/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  app.use(compression());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  const configService = app.get<ConfigService<GlobalConfig>>(ConfigService);

  const appConfig = configService.getOrThrow<AppConfig>(APP_CONFIG_TOKEN);

  await app.listen(appConfig.port);

  if (appConfig.environment === 'development') {
    const logger = new Logger('bootstrap');
    logger.log(`Listening on ${await app.getUrl()}`);

    const server = setupServer(...handlers);
    server.listen();
  }
  Logger.log(`🚀 Application is running on: http://localhost:${appConfig.port}`);
}

void bootstrap();
