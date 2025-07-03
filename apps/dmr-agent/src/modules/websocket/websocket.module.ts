import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentConfig, agentConfig } from '../../common/config';
import { MetricModule } from '../../libs/metrics';
import { WebsocketService } from './websocket.service';

@Module({
  imports: [
    MetricModule,
    JwtModule.registerAsync({
      inject: [agentConfig.KEY],
      useFactory: (agentConfig: AgentConfig) => ({
        signOptions: {
          algorithm: 'RS256',
          keyid: agentConfig.id,
        },
      }),
    }),
  ] as const,
  providers: [WebsocketService] as const,
  exports: [WebsocketService] as const,
})
export class WebsocketModule {}
