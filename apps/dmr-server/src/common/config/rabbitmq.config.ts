import { ConfigType, registerAs } from '@nestjs/config';

export const RABBITMQ_CONFIG_TOKEN = Symbol('RABBITMQ_CONFIG_TOKEN');

export const rabbitMQConfig = registerAs(RABBITMQ_CONFIG_TOKEN, () => ({
  username: process.env.RABBITMQ_DEFAULT_USER ?? '',
  password: process.env.RABBITMQ_DEFAULT_PASS ?? '',
  ttl: Number(process.env.RABBITMQ_DEFAULT_TTL ?? 300000),
  port: Number(process.env.RABBITMQ_DEFAULT_PORT ?? 5672),
  hostname: process.env.RABBITMQ_DEFAULT_HOST ?? 'localhost',
  dlqTTL: Number(process.env.RABBITMQ_DEFAULT_DLQ_TTL ?? 86400000),
  reconnectInterval: Number(process.env.RABBITMQ_DEFAULT_DEFAULT_RECONNECT_INTERVAL ?? 5000),
}));

export type RabbitMQConfig = ConfigType<typeof rabbitMQConfig>;
