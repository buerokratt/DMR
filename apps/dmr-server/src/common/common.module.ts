import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configs } from './config';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: configs,
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: ['.env'],
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
    }),
    HttpModule.register({ global: true }),
  ],
})
export class CommonModule {}

export const CommonModules = [
  ConfigModule.forRoot({
    load: configs,
    isGlobal: true,
    cache: true,
    expandVariables: true,
    envFilePath: ['.env'],
    validationOptions: {
      allowUnknown: true,
      abortEarly: true,
    },
  }),
  ScheduleModule.forRoot(),
  CacheModule.register({
    isGlobal: true,
  }),
  HttpModule.register({ global: true }),
];
