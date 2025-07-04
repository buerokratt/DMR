import { AgentDto } from '@dmr/shared';

export interface CentOpsConfigurationDifference {
  added: AgentDto[];
  deleted: AgentDto[];
  certificateChanged: AgentDto[];
}
