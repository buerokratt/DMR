import { Module } from '@nestjs/common';
import { CentOpsModule } from '../centops/centops.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { WsAuthGuard } from './guards/ws-auth.guard';

@Module({
  imports: [CentOpsModule, JwtModule.register({ verifyOptions: { algorithms: ['RS256'] } })],
  providers: [AuthService, WsAuthGuard],
  exports: [AuthService, WsAuthGuard],
})
export class AuthModule {}
