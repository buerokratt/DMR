import { Module } from '@nestjs/common';

import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { MetricService } from './metric.service';
import { Metrics } from './metrics';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    MetricService,
    makeGaugeProvider({
      name: Metrics.dmrSocketConnectionsActive,
      help: Metrics.dmrSocketConnectionsActiveHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketConnectionsTotal,
      help: Metrics.dmrSocketConnectionsTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketDisconnectionsTotal,
      help: Metrics.dmrSocketDisconnectionsTotalHelp,
    }),
    makeHistogramProvider({
      name: Metrics.dmrSocketConnectionDurationSeconds,
      help: Metrics.dmrSocketConnectionDurationSecondsHelp,
      buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200], // sec
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketErrorsTotal,
      help: Metrics.dmrSocketErrorsTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketEventsReceivedTotal,
      help: Metrics.dmrSocketEventsReceivedTotalHelp,
      labelNames: ['event', 'namespace'],
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketEventsSentTotal,
      help: Metrics.dmrSocketEventsSentTotalHelp,
      labelNames: ['event', 'namespace'],
    }),
    makeHistogramProvider({
      name: Metrics.dmrMessageProcessingDurationSeconds,
      help: Metrics.dmrMessageProcessingDurationSecondsHelp,
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5], // sec
      labelNames: ['event'],
    }),
  ],
  exports: [MetricService],
})
export class MetricModule {}
