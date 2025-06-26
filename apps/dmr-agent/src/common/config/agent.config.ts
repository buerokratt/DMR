import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const AGENT_CONFIG_TOKEN = Symbol('AGENT_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    id: String(process.env.AGENT_ID),
    privateKey: String(process.env.AGENT_PRIVATE_KEY),
    outgoingMessageEndpoint: String(process.env.OUTGOING_MESSAGE_ENDPOINT || ''),
  },
  {
    id: Joi.string().uuid().required(),
    privateKey: Joi.string().required(),
    outgoingMessageEndpoint: Joi.string().allow(''),
  },
);

export const agentConfig = registerAs(AGENT_CONFIG_TOKEN, () => variables);

export type AgentConfig = ConfigType<typeof agentConfig>;
