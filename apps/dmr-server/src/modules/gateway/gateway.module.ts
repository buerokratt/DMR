import { Module } from '@nestjs/common';
import { RabbitMQModule } from '../../libs/rabbitmq';
import { AuthModule } from '../auth/auth.module';
import { CentOpsModule } from '../centops/centops.module';
import { AgentGateway } from './agent.gateway';
import { MessageValidatorService } from './message-validator.service';

@Module({
  imports: [AuthModule, CentOpsModule, RabbitMQModule],
  providers: [AgentGateway, MessageValidatorService],
})
export class GatewayModule {}
