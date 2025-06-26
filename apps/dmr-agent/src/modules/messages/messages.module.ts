import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { MessagesController } from './messages.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [MessagesController],
  imports: [WebsocketModule, HttpModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
