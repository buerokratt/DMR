import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { RabbitMQModule } from './libs/rabbitmq';
import { AuthModule } from './modules/auth/auth.module';
import { CentOpsModule } from './modules/centops/centops.module';
import { GatewayModule } from './modules/gateway';
import { HealthModule } from './modules/health/health.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    CommonModule,
    HealthModule,
    RabbitMQModule,
    CentOpsModule,
    AuthModule,
    GatewayModule,
    EventEmitterModule.forRoot(),
  ],
})
export class AppModule {}
