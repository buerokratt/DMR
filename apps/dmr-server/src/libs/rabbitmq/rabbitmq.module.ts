import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { RabbitMQMessageService } from './rabbitmq-message.service';
import { RabbitMQService } from './rabbitmq.service';

@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [RabbitMQService, RabbitMQMessageService],
  exports: [RabbitMQService, RabbitMQMessageService],
})
export class RabbitMQModule {}
