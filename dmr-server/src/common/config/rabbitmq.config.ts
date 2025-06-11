import { ConfigType, registerAs } from '@nestjs/config';

export const RABBITMQ_CONFIG_TOKEN = Symbol('RABBITMQ_CONFIG_TOKEN');

export const rabbitMQConfig = registerAs(RABBITMQ_CONFIG_TOKEN, () => ({
  ttl: Number(process.env.RABBITMQ_DEFAULT_TTL ?? 86400),
  port: Number(process.env.RABBITMQ_DEFAULT_PORT ?? 5672),
  hostname: process.env.RABBITMQ_DEFAULT_HOST ?? 'localhost',
  username: process.env.RABBITMQ_DEFAULT_USER ?? '',
  password: process.env.RABBITMQ_DEFAULT_PASS ?? '',
}));

export type RabbitMQConfig = ConfigType<typeof rabbitMQConfig>;
