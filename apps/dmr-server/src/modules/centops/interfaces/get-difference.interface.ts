import { AgentDto } from '@dmr/shared';

export interface GetDifference {
  added: AgentDto[];
  removed: AgentDto[];
}
