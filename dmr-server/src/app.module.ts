import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from 'libs/rabbitmq';

import { appConfig, centOpsConfig, rabbitMQConfig } from './common/config';
import { HealthModule } from './health/health.module';
import { CentOpsModule } from './modules/centops/centops.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, centOpsConfig, rabbitMQConfig],
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
    }),
    HttpModule.register({ global: true }),
    RabbitMQModule,
    HealthModule,
    CentOpsModule,
  ],
})
export class AppModule {}
