import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { AgentsController } from './agents.controller';

@Module({
  controllers: [AgentsController],
  imports: [WebsocketModule],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
