import { ConfigType, registerAs } from '@nestjs/config';

export const AGENT_CONFIG_TOKEN = Symbol('AGENT_CONFIG_TOKEN');

export const agentConfig = registerAs(AGENT_CONFIG_TOKEN, () => ({
  uuid: process.env.AGENT_ID ?? '',
  privateKey: process.env.AGENT_PRIVATE_KEY || '',
}));

export type AgentConfig = ConfigType<typeof agentConfig>;
