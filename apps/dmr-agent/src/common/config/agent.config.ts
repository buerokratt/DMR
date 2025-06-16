import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const AGENT_CONFIG_TOKEN = Symbol('AGENT_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    uuid: process.env.AGENT_ID,
    privateKey: process.env.AGENT_PRIVATE_KEY,
  },
  {
    uuid: Joi.string().uuid().required(),
    privateKey: Joi.string().required(),
  },
);

export const agentConfig = registerAs(AGENT_CONFIG_TOKEN, () => variables);

export type AgentConfig = ConfigType<typeof agentConfig>;
