import { ConfigType, registerAs } from '@nestjs/config';

export const DMR_SERVER_CONFIG_TOKEN = Symbol('DMR_SERVER_CONFIG_TOKEN');

export const dmrServerConfig = registerAs(DMR_SERVER_CONFIG_TOKEN, () => ({
  webSocketURL: process.env.DMR_SERVER_WEBSOCKET_URL ?? '',
}));

export type DMRServerConfig = ConfigType<typeof dmrServerConfig>;
