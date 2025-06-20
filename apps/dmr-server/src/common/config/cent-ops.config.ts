import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const CENT_OPS_CONFIG_TOKEN = Symbol('CENT_OPS_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    url: String(process.env.CENTOPS_CONFIGURATION_URL),
    cronTime: String(process.env.CENTOPS_CONFIGURATION_CRON_TIME),
  },
  {
    url: Joi.string().uri().required(),
    cronTime: Joi.string().default('*/30 * * * *'),
  },
);

export const centOpsConfig = registerAs(CENT_OPS_CONFIG_TOKEN, () => variables);

export type CentOpsConfig = ConfigType<typeof centOpsConfig>;
