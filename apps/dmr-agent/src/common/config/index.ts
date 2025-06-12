export * from './app.config';

import { appConfig, APP_CONFIG_TOKEN, AppConfig } from './app.config';

export type GlobalConfig = {
  [APP_CONFIG_TOKEN]: AppConfig;
};

export const configs = [appConfig];
