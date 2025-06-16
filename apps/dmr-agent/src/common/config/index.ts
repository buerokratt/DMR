export * from './agent.config';
export * from './app.config';
export * from './dmr-server.config';
export * from './web-socket.config';

import { AGENT_CONFIG_TOKEN, agentConfig, AgentConfig } from './agent.config';
import { APP_CONFIG_TOKEN, appConfig, AppConfig } from './app.config';
import { DMR_SERVER_CONFIG_TOKEN, dmrServerConfig, DMRServerConfig } from './dmr-server.config';
import { WEB_SOCKET_CONFIG_TOKEN, webSocketConfig, WebSocketConfig } from './web-socket.config';

export type GlobalConfig = {
  [APP_CONFIG_TOKEN]: AppConfig;
  [AGENT_CONFIG_TOKEN]: AgentConfig;
  [DMR_SERVER_CONFIG_TOKEN]: DMRServerConfig;
  [WEB_SOCKET_CONFIG_TOKEN]: WebSocketConfig;
};

export const configs = [appConfig, agentConfig, dmrServerConfig, webSocketConfig];
