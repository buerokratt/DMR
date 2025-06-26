import { Utils } from '@dmr/shared';
import { ConfigType, registerAs } from '@nestjs/config';
import Joi from 'joi';

export const RABBITMQ_CONFIG_TOKEN = Symbol('RABBITMQ_CONFIG_TOKEN');

const variables = Utils.validateObject(
  {
    username: String(process.env.RABBITMQ_DEFAULT_USER),
    password: String(process.env.RABBITMQ_DEFAULT_PASS),
    ttl: Number(process.env.RABBITMQ_DEFAULT_TTL),
    port: Number(process.env.RABBITMQ_DEFAULT_PORT),
    hostname: String(process.env.RABBITMQ_DEFAULT_HOST),
    managementUIUri: String(process.env.RABBITMQ_DEFAULT_MANAGEMENT_UI_URI),
    dlqTTL: Number(process.env.RABBITMQ_DEFAULT_DLQ_TTL),
    validationFailuresTTL: Number(process.env.RABBITMQ_VALIDATION_FAILURES_TTL),
    reconnectInterval: Number(process.env.RABBITMQ_DEFAULT_DEFAULT_RECONNECT_INTERVAL),
  },
  {
    port: Joi.number().required(),
    username: Joi.string().required(),
    password: Joi.string().required(),
    ttl: Joi.number().default(300000),
    dlqTTL: Joi.number().default(86400000),
    validationFailuresTTL: Joi.number().default(86400000),
    hostname: Joi.string().hostname().required(),
    reconnectInterval: Joi.number().default(5000),
    managementUIUri: Joi.string().uri().required(),
  },
);

export const rabbitMQConfig = registerAs(RABBITMQ_CONFIG_TOKEN, () => variables);

export type RabbitMQConfig = ConfigType<typeof rabbitMQConfig>;
