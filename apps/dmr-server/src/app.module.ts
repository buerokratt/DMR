import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';
import { HealthModule } from './modules/health/health.module';
import { RabbitMQModule } from './rabbitmq/src';
import { CentOpsModule } from './modules/centops/centops.module';
import { AuthModule } from './modules/auth/auth.module';
import { GatewayModule } from './modules/gateway/gateway.module';

@Module({
  imports: [
    CommonModule,
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
    }),
    HttpModule.register({ global: true }),
    HealthModule,
    RabbitMQModule,
    CentOpsModule,
    AuthModule,
    GatewayModule,
  ],
})
export class AppModule {}
