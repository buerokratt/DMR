import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const DMR_SERVER_CONFIG_TOKEN = Symbol('DMR_SERVER_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    webSocketURL: String(process.env.DMR_SERVER_WEBSOCKET_URL),
  },
  {
    webSocketURL: Joi.string().uri().required(),
  },
);

export const dmrServerConfig = registerAs(DMR_SERVER_CONFIG_TOKEN, () => variables);

export type DMRServerConfig = ConfigType<typeof dmrServerConfig>;
