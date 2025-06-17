import { Module } from '@nestjs/common';
import { AgentGateway } from './agent.gateway';
import { AuthModule } from '../auth/auth.module';
import { CentOpsModule } from '../centops/centops.module';
import { RabbitMQModule } from '../../libs/rabbitmq';

@Module({
  imports: [AuthModule, CentOpsModule, RabbitMQModule],
  providers: [AgentGateway],
})
export class GatewayModule {}
