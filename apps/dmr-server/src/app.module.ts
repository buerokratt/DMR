import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { CentOpsModule } from './modules/centops/centops.module';
import { RabbitMQModule } from './libs/rabbitmq';

@Module({
  imports: [CommonModule, HealthModule, RabbitMQModule, CentOpsModule],
})
export class AppModule {}
