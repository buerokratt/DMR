import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import { Metrics } from './metrics';

@Injectable()
export class MetricService {
  constructor(
    @InjectMetric(Metrics.dmrHttpRequestTotal)
    private readonly _httpRequestTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrHttpErrorsTotal)
    private readonly __httpErrorsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrHttpRequestDurationSeconds)
    private readonly _httpRequestDurationSecondsHistogram: Histogram<string>,
    @InjectMetric(Metrics.dmrSocketErrorsTotal)
    private readonly _errorsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionStatus)
    private readonly _activeConnectionStatusGauge: Gauge<string>,
    @InjectMetric(Metrics.dmrSocketEventsReceivedTotal)
    private readonly _eventsReceivedTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketEventsSentTotal)
    private readonly _eventsSentTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionDurationSeconds)
    private readonly _socketConnectionDurationSecondsHistogram: Histogram<string>,
    @InjectMetric(Metrics.dmrMessageProcessingDurationSeconds)
    private readonly _messageProcessingDurationSecondsHistogram: Histogram<string>,
  ) {}

  get httpRequestTotalCounter(): Counter<string> {
    return this._httpRequestTotalCounter;
  }

  get httpErrorsTotalCounter(): Counter<string> {
    return this.__httpErrorsTotalCounter;
  }

  get httpRequestDurationSecondsHistogram(): Histogram<string> {
    return this._httpRequestDurationSecondsHistogram;
  }

  get errorsTotalCounter(): Counter<string> {
    return this._errorsTotalCounter;
  }

  get activeConnectionStatusGauge(): Gauge<string> {
    return this._activeConnectionStatusGauge;
  }

  get eventsReceivedTotalCounter(): Counter<string> {
    return this._eventsReceivedTotalCounter;
  }

  get eventsSentTotalCounter(): Counter<string> {
    return this._eventsSentTotalCounter;
  }

  get socketConnectionDurationSecondsHistogram(): Histogram<string> {
    return this._socketConnectionDurationSecondsHistogram;
  }

  get messageProcessingDurationSecondsHistogram(): Histogram<string> {
    return this._messageProcessingDurationSecondsHistogram;
  }
}
