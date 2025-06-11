import { Module } from '@nestjs/common';

import { CentOpsService } from './centops.service';

@Module({
  providers: [CentOpsService],
})
export class CentOpsModule {}
