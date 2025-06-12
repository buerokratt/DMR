export * from './app.config';
export * from './cent-ops.config';
export * from './rabbitmq.config';

import { appConfig, APP_CONFIG_TOKEN, AppConfig } from './app.config';
import { centOpsConfig, CENT_OPS_CONFIG_TOKEN, CentOpsConfig } from './cent-ops.config';
import { rabbitMQConfig, RABBITMQ_CONFIG_TOKEN, RabbitMQConfig } from './rabbitmq.config';

export type GlobalConfig = {
  [APP_CONFIG_TOKEN]: AppConfig;
  [CENT_OPS_CONFIG_TOKEN]: CentOpsConfig;
  [RABBITMQ_CONFIG_TOKEN]: RabbitMQConfig;
};

export const configs = [appConfig, centOpsConfig, rabbitMQConfig];
