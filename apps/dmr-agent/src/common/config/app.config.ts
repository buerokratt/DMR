import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const APP_CONFIG_TOKEN = Symbol('APP_CONFIG_TOKEN');

export type Environment = 'development' | 'production';

const variables = Utils.validateObject(
  {
    port: Number(process.env.PORT),
    environment: process.env.ENVIRONMENT as Environment,
  },
  {
    port: Joi.number().default(5000),
    environment: Joi.string().valid('development', 'production').default('development'),
  },
);

export const appConfig = registerAs(APP_CONFIG_TOKEN, () => variables);

export type AppConfig = ConfigType<typeof appConfig>;
