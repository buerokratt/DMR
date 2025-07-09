import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const WEB_SOCKET_CONFIG_TOKEN = Symbol('WEB_SOCKET_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    url: String(process.env.DMR_SERVER_WEBSOCKET_URL),
    namespace: String('/v1/dmr-agent-events'),
    reconnectionDelayMin: Number(process.env.WEBSOCKET_RECONNECTION_DELAY),
    reconnectionDelayMax: Number(process.env.WEBSOCKET_RECONNECTION_DELAY_MAX),
    ackTimeout: Number(process.env.MESSAGE_DELIVERY_TIMEOUT_MS),
  },
  {
    url: Joi.string().uri().required(),
    namespace: Joi.string().default('/v1/dmr-agent-events'),
    reconnectionDelayMin: Joi.number().default(1000),
    reconnectionDelayMax: Joi.number().default(5000),
    ackTimeout: Joi.number().default(2000),
  },
);

export const webSocketConfig = registerAs(WEB_SOCKET_CONFIG_TOKEN, () => variables);

export type WebSocketConfig = ConfigType<typeof webSocketConfig>;
