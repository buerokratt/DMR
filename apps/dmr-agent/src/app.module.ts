import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AgentsModule } from './modules/agents/agents.module';
import { HealthModule } from './modules/health/health.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [CommonModule, HealthModule, WebsocketModule, AgentsModule],
})
export class AppModule {}
