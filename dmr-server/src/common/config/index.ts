export * from './app.config';
export * from './cent-ops.config';
export * from './rabbitmq.config';

import { APP_CONFIG_TOKEN, AppConfig } from './app.config';
import { CENT_OPS_CONFIG_TOKEN, CentOpsConfig } from './cent-ops.config';
import { RABBITMQ_CONFIG_TOKEN, RabbitMQConfig } from './rabbitmq.config';

export type GlobalConfig = {
  [APP_CONFIG_TOKEN]: AppConfig;
  [CENT_OPS_CONFIG_TOKEN]: CentOpsConfig;
  [RABBITMQ_CONFIG_TOKEN]: RabbitMQConfig;
};
