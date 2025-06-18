import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const WEB_SOCKET_CONFIG_TOKEN = Symbol('WEB_SOCKET_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    reconnectionDelayMin: Number(process.env.WEBSOCKET_RECONNECTION_DELAY),
    reconnectionDelayMax: Number(process.env.WEBSOCKET_RECONNECTION_DELAY_MAX),
  },
  {
    reconnectionDelayMin: Joi.number().default(1000),
    reconnectionDelayMax: Joi.number().default(5000),
  },
);

export const webSocketConfig = registerAs(WEB_SOCKET_CONFIG_TOKEN, () => variables);

export type WebSocketConfig = ConfigType<typeof webSocketConfig>;
