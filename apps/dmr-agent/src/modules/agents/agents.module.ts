import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
