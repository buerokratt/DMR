import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { MessagesController } from './messages.controller';

@Module({
  controllers: [MessagesController],
  imports: [WebsocketModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
