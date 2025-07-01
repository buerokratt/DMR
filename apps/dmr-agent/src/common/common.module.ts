import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MetricModule } from '../libs/metrics';
import { configs } from './config';
import { HttpMetricsInterceptor } from './interceptors/http-metrics.interceptor';
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
  providers: [TimeoutInterceptor, HttpMetricsInterceptor],
})
export class CommonModule {}
