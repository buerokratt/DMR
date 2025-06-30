import { Utils } from '@dmr/shared';
import { LogLevel } from '@nestjs/common';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const APP_CONFIG_TOKEN = Symbol('APP_CONFIG_TOKEN');

export type Environment = 'development' | 'production';

const variables = Utils.validateObject(
  {
    port: Number(process.env.PORT),
    environment: process.env.ENVIRONMENT as Environment,
    incomingMessageRequestTimeoutMs: Number(process.env.INCOMING_MESSAGE_REQUEST_TIMEOUT_MS),
    loggerLogLevels: (process.env.LOGGER_LOG_LEVELS?.split(',') as LogLevel[]) || undefined,
    loggerColors: process.env.LOGGER_COLORS === 'true',
  },
  {
    port: Joi.number().default(5000),
    environment: Joi.string().valid('development', 'production').default('development'),
    incomingMessageRequestTimeoutMs: Joi.number().default(2000),
    loggerLogLevels: Joi.array()
      .items(Joi.string().valid('log', 'error', 'warn', 'debug', 'verbose'))
      .default(['error', 'warn', 'log']),
    loggerColors: Joi.boolean().default(false),
  },
);

export const appConfig = registerAs(APP_CONFIG_TOKEN, () => variables);

export type AppConfig = ConfigType<typeof appConfig>;
