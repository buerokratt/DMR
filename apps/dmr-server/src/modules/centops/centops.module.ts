import { Module } from '@nestjs/common';

import { CentOpsService } from './centops.service';
import { RabbitMQModule } from '../../libs/rabbitmq';

@Module({
  imports: [RabbitMQModule],
  providers: [CentOpsService],
})
export class CentOpsModule {}
