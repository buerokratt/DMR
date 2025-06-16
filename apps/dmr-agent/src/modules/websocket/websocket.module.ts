import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebsocketService } from './websocket.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        signOptions: {
          algorithm: 'RS256',
          expiresIn: '1m',
          keyid: configService.get<string>('AGENT_ID'),
        },
      }),
    }),
  ] as const,
  providers: [WebsocketService] as const,
  exports: [WebsocketService] as const,
})
export class WebsocketModule {}
