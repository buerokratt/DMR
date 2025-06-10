import { Logger, Module } from '@nestjs/common';
import { CentopsService } from './centops.service';

@Module({
  providers: [CentopsService, Logger],
})
export class CentopsModule {}
