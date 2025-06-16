import { Module } from '@nestjs/common';
import { CentOpsModule } from '../centops/centops.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Module({
  imports: [CentOpsModule, JwtModule.register({ verifyOptions: { algorithms: ['RS256'] } })],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
