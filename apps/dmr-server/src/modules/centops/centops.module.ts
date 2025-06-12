import { Module } from '@nestjs/common';

import { CentOpsService } from './centops.service';

@Module({
  providers: [CentOpsService],
  exports: [CentOpsService],
})
export class CentOpsModule {}
