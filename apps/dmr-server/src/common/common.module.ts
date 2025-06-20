import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {
  makeCounterProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { configs } from './config';
import { Metrics } from './metrics';

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
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
    }),
    HttpModule.register({ global: true }),
    EventEmitterModule.forRoot({ global: true }),
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: false },
    }),
  ],
  providers: [
    makeCounterProvider({
      name: Metrics.dmrSocketErrorsTotal,
      help: Metrics.dmrSocketErrorsTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketEventsReceivedTotal,
      help: Metrics.dmrSocketEventsReceivedTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketEventsSentTotal,
      help: Metrics.dmrSocketEventsSentTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketReceivedBytesTotal,
      help: Metrics.dmrSocketReceivedBytesTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketTransmittedBytesTotal,
      help: Metrics.dmrSocketTransmittedBytesTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrMessagesReceivedTotal,
      help: Metrics.dmrMessagesReceivedTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrMessagesForwardedTotal,
      help: Metrics.dmrMessagesForwardedTotalHelp,
    }),
    makeHistogramProvider({
      name: Metrics.dmrMessageProcessingDurationSeconds,
      help: Metrics.dmrMessageProcessingDurationSecondsHelp,
    }),
  ],
})
export class CommonModule {}
