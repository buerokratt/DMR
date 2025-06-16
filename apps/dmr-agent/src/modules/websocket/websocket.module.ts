import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AgentConfig, agentConfig } from '../../common/config';
import { WebsocketService } from './websocket.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [agentConfig.KEY],
      useFactory: (agentConfig: AgentConfig) => ({
        signOptions: {
          algorithm: 'RS256',
          expiresIn: '1m',
          keyid: agentConfig.uuid,
        },
      }),
    }),
  ] as const,
  providers: [WebsocketService] as const,
  exports: [WebsocketService] as const,
})
export class WebsocketModule {}
