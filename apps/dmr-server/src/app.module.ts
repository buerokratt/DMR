import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { CentOpsModule } from './modules/centops/centops.module';
import { AuthModule } from './modules/auth/auth.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { RabbitMQModule } from './libs/rabbitmq';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    CommonModule,
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
    }),
    HttpModule.register({ global: true }),
    EventEmitterModule.forRoot({ global: true }),
    HealthModule,
    RabbitMQModule,
    CentOpsModule,
    AuthModule,
    GatewayModule,
  ],
})
export class AppModule {}
