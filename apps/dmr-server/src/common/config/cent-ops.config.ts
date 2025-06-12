import { ConfigType, registerAs } from '@nestjs/config';

export const CENT_OPS_CONFIG_TOKEN = Symbol('CENT_OPS_CONFIG_TOKEN');

export const centOpsConfig = registerAs(CENT_OPS_CONFIG_TOKEN, () => ({
  url: process.env.CENTOPS_CONFIGURATION_URL || null,
  cronTime: process.env.CENTOPS_CONFIGURATION_CRON_TIME || '*/30 * * * *',
}));

export type CentOpsConfig = ConfigType<typeof centOpsConfig>;
