import { Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { Metrics } from '../../common/metrics';
import { RabbitMQModule } from '../../libs/rabbitmq';
import { AuthModule } from '../auth/auth.module';
import { CentOpsModule } from '../centops/centops.module';
import { AgentGateway } from './agent.gateway';

@Module({
  imports: [AuthModule, CentOpsModule, RabbitMQModule],
  providers: [
    AgentGateway,
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
      buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200],
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketErrorsTotal,
      help: Metrics.dmrSocketErrorsTotalHelp,
    }),
    makeCounterProvider({
      name: Metrics.dmrSocketEventsReceivedTotal,
      help: Metrics.dmrSocketEventsReceivedTotalHelp,
    }),
  ],
})
export class GatewayModule {}
