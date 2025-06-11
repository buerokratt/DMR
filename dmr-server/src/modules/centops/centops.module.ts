import { Module } from '@nestjs/common';
import { RabbitMQModule } from 'libs/rabbitmq';

import { CentOpsService } from './centops.service';

@Module({
  imports: [RabbitMQModule],
  providers: [CentOpsService],
})
export class CentOpsModule {}
