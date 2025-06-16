import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthModule } from './modules/health/health.module';
import { WebsocketModule } from './modules/websocket/websocket.module';

@Module({
  imports: [CommonModule, HealthModule, WebsocketModule],
})
export class AppModule {}
