import { ConfigType, registerAs } from '@nestjs/config';

export const WEB_SOCKET_CONFIG_TOKEN = Symbol('WEB_SOCKET_CONFIG_TOKEN');

export const webSocketConfig = registerAs(WEB_SOCKET_CONFIG_TOKEN, () => ({
  reconnectionDelay: {
    min: Number(process.env.WEBSOCKET_RECONNECTION_DELAY ?? 1000),
    max: Number(process.env.WEBSOCKET_RECONNECTION_DELAY_MAX ?? 5000),
  },
}));

export type WebSocketConfig = ConfigType<typeof webSocketConfig>;
