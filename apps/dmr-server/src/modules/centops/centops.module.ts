import { forwardRef, Module } from '@nestjs/common';

import { RabbitMQModule } from '../../libs/rabbitmq';
import { CentOpsService } from './centops.service';

@Module({
  imports: [forwardRef(() => RabbitMQModule)],
  providers: [CentOpsService],
  exports: [CentOpsService],
})
export class CentOpsModule {}
