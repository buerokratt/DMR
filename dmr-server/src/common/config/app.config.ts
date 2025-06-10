import * as process from 'node:process';
import { registerAs } from '@nestjs/config';

export const CENT_OPS_CONFIG_TOKEN = 'CENT_OPS_CONFIG_TOKEN';

export const centOpsConfig = registerAs(
  CENT_OPS_CONFIG_TOKEN,
  (): CentOpsConfig => ({
    url: process.env.CENTOPS_CONFIGURATION_URL || '',
    cronTime: process.env.CENTOPS_CONFIGURATION_CRON_TIME || '*/30 * * * *',
  }),
);

export type CentOpsConfig = {
  cronTime: string;
  url: string;
};
