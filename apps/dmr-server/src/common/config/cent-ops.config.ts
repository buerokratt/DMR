import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const CENT_OPS_CONFIG_TOKEN = Symbol('CENT_OPS_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    url: String(process.env.CENTOPS_CONFIGURATION_URL),
    apiKey: String(process.env.CENTOPS_CONFIGURATION_API_KEY),
    cronTime: String(process.env.CENTOPS_CONFIGURATION_CRON_TIME),
    apiSecret: String(process.env.CENTOPS_CONFIGURATION_API_SECRET),
  },
  {
    url: Joi.string().uri().required(),
    apiKey: Joi.string().required(),
    cronTime: Joi.string().default('*/30 * * * *'),
    apiSecret: Joi.string().required(),
  },
);

export const centOpsConfig = registerAs(CENT_OPS_CONFIG_TOKEN, () => variables);

export type CentOpsConfig = ConfigType<typeof centOpsConfig>;
