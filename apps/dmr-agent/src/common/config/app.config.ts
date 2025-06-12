import { ConfigType, registerAs } from '@nestjs/config';

export const APP_CONFIG_TOKEN = Symbol('APP_CONFIG_TOKEN');

export type Environment = 'development' | 'production';

export const appConfig = registerAs(APP_CONFIG_TOKEN, () => ({
  port: Number(process.env.PORT ?? 5000),
  environment: (process.env.ENVIRONMENT as Environment) || 'development',
}));

export type AppConfig = ConfigType<typeof appConfig>;
