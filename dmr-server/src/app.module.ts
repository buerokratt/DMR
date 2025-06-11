import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { centOpsConfig } from './common/config/app.config';
import { CentopsModule } from './modules/centops/centops.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [centOpsConfig],
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
    }),
    HttpModule.register({ global: true }),
    CentopsModule,
  ],
})
export class AppModule {}
