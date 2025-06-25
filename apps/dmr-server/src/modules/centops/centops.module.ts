import { forwardRef, Module } from '@nestjs/common';

import { CentOpsService } from './centops.service';
import { RabbitMQModule } from '../../libs/rabbitmq';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [forwardRef(() => RabbitMQModule)],
  providers: [CentOpsService],
  exports: [CentOpsService],
})
export class CentOpsModule {}
