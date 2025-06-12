import { Module } from '@nestjs/common';
import { DmrServerGateway } from './dmr.server.gateway';
import { AuthModule } from '../auth/auth.module';
import { CentOpsModule } from '../centops/centops.module';

@Module({
  imports: [AuthModule, CentOpsModule],
  providers: [DmrServerGateway],
})
export class GatewayModule {}
