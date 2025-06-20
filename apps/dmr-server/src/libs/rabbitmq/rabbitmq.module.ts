import { Module } from '@nestjs/common';

import { RabbitMQService } from './rabbitmq.service';
import { RabbitMQMessageService } from './rabbitmq-message.service';

@Module({
  providers: [RabbitMQService, RabbitMQMessageService],
  exports: [RabbitMQService, RabbitMQMessageService],
})
export class RabbitMQModule {}
