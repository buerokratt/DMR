import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetricModule } from '../libs/metrics';
import { configs } from './config';
import { MetricInterceptor } from './interceptors/metric.interceptor';
import { TimeoutInterceptor } from './interceptors/timeout.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: configs,
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: ['.env'],
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    CacheModule.register({
      isGlobal: true,
    }),
    MetricModule,
  ],
  providers: [TimeoutInterceptor, MetricInterceptor],
})
export class CommonModule {}
