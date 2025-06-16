import { HttpService } from '@nestjs/axios';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { firstValueFrom } from 'rxjs';

import { ClientConfigDto, IGetAgentConfigListResponse, Utils } from '@dmr/shared';
import { CronJob } from 'cron';
import { CentOpsConfig, centOpsConfig } from '../../common/config';
import { RabbitMQService } from '../../libs/rabbitmq';

@Injectable()
export class CentOpsService implements OnModuleInit {
  private readonly CENT_OPS_CONFIG_CACHE_KEY = 'CENT_OPS_CONFIGURATION';
  private readonly CENT_OPS_JOB_NAME = 'CENT_OPS_CONFIG_FETCH';
  private readonly logger = new Logger(CentOpsService.name);

  constructor(
    @Inject(centOpsConfig.KEY)
    private readonly centOpsConfig: CentOpsConfig,
    private readonly httpService: HttpService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  onModuleInit(): void {
    const onTick = async (): Promise<void> => {
      this.logger.debug(
        `Executing cron job '${this.CENT_OPS_JOB_NAME}' at ${new Date().toISOString()}`,
      );

      await this.syncConfiguration();
    };

    const job = new CronJob(this.centOpsConfig.cronTime, onTick);

    this.schedulerRegistry.addCronJob(this.CENT_OPS_JOB_NAME, job);

    job.start();

    this.logger.log(
      `Cron job '${this.CENT_OPS_JOB_NAME}' scheduled for: ${this.centOpsConfig.cronTime}`,
    );
  }

  async syncConfiguration(): Promise<ClientConfigDto[] | undefined> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<IGetAgentConfigListResponse>(this.centOpsConfig.url),
      );

      const configurations =
        (await this.cacheManager.get<ClientConfigDto[]>(this.CENT_OPS_CONFIG_CACHE_KEY)) ?? [];

      const configurationsMap = Utils.mapFromArray(configurations, (item) => item.id);

      const newConfigurations: ClientConfigDto[] = [];

      for (const item of data.response) {
        const clientConfig = plainToInstance(ClientConfigDto, {
          id: item.id,
          name: item.name,
          authenticationCertificate: item.authentication_certificate,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        });

        const errors = await validate(clientConfig);

        if (errors.length > 0) {
          this.logger.error(
            `Validation failed for client configuration: ${JSON.stringify(errors)}`,
          );

          continue;
        }

        const synchronized = !!configurationsMap[item.id];

        if (synchronized) {
          delete configurationsMap[item.id];
        } else {
          await this.rabbitMQService.setupQueue(item.id);
        }

        newConfigurations.push(clientConfig);
      }

      for (const deletedConfiguration of configurations.values()) {
        await this.rabbitMQService.deleteQueue(deletedConfiguration.id);
      }

      await this.cacheManager.set(this.CENT_OPS_CONFIG_CACHE_KEY, newConfigurations);

      this.logger.log('CentOps configuration updated and stored in memory.');

      return newConfigurations;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `Error while get response from ${this.centOpsConfig.url}: ${error.message}`,
        );
      }
    }
  }
}
