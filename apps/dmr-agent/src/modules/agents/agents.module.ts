import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AgentsService } from './agents.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule, HttpModule],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
