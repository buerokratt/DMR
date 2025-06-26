import { forwardRef, Module } from '@nestjs/common';

import { RabbitMQMessageService } from './rabbitmq-message.service';
import { RabbitMQService } from './rabbitmq.service';
import { GatewayModule } from '../../modules/gateway';

@Module({
  imports: [forwardRef(() => GatewayModule)],
  providers: [RabbitMQService, RabbitMQMessageService],
  exports: [RabbitMQService, RabbitMQMessageService],
})
export class RabbitMQModule {}
