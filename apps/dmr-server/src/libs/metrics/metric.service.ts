import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';
import { Metrics } from './metrics';

@Injectable()
export class MetricService {
  constructor(
    @InjectMetric(Metrics.dmrSocketErrorsTotal)
    private readonly _errorsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionsActive)
    private readonly _activeConnectionGauge: Gauge<string>,
    @InjectMetric(Metrics.dmrSocketConnectionsTotal)
    private readonly _connectionsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketDisconnectionsTotal)
    private readonly _disconnectionsTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketEventsReceivedTotal)
    private readonly _eventsReceivedTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketEventsSentTotal)
    private readonly _eventsSentTotalCounter: Counter<string>,
    @InjectMetric(Metrics.dmrSocketConnectionDurationSeconds)
    private readonly _socketConnectionDurationSecondsHistogram: Histogram<string>,
    @InjectMetric(Metrics.dmrMessageProcessingDurationSeconds)
    private readonly _messageProcessingDurationSecondsHistogram: Histogram<string>,
  ) {}

  get errorsTotalCounter(): Counter<string> {
    return this._errorsTotalCounter;
  }

  get activeConnectionGauge(): Gauge<string> {
    return this._activeConnectionGauge;
  }

  get connectionsTotalCounter(): Counter<string> {
    return this._connectionsTotalCounter;
  }

  get disconnectionsTotalCounter(): Counter<string> {
    return this._disconnectionsTotalCounter;
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
