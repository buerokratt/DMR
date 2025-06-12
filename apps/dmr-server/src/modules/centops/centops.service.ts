import { HttpService } from '@nestjs/axios';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CronJob } from 'cron';
import { firstValueFrom } from 'rxjs';
import { CentOpsConfig, centOpsConfig } from '../../common/config';
import { ClientConfigDto, ICentOpsResponse } from '@dmr/shared';

@Injectable()
export class CentOpsService implements OnModuleInit {
  private readonly CENTOPS_CONFIG_CACHE_KEY = 'centops_configuration';
  private readonly CENTOPS_JOB_NAME = 'centops_config_fetch';
  private readonly logger = new Logger(CentOpsService.name);

  constructor(
    @Inject(centOpsConfig.KEY)
    private readonly centOpsConfig: CentOpsConfig,
    private readonly httpService: HttpService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  onModuleInit(): void {
    const job = new CronJob(this.centOpsConfig.cronTime, async (): Promise<void> => {
      this.logger.debug(
        `Executing cron job '${this.CENTOPS_JOB_NAME}' at ${new Date().toISOString()}`,
      );
      await this.handleCron();
    });

    this.schedulerRegistry.addCronJob(this.CENTOPS_JOB_NAME, job);
    job.start();
    this.logger.log(
      `Cron job '${this.CENTOPS_JOB_NAME}' scheduled for: ${this.centOpsConfig.cronTime}`,
    );
  }

  async getCentOpsConfigurationByClientId(clientId: string): Promise<ClientConfigDto> {
    const centOpsConfigs = await this.cacheManager.get<ClientConfigDto[]>(
      this.CENTOPS_CONFIG_CACHE_KEY,
    );

    const clientConfig = centOpsConfigs.find((config) => config.id === clientId);
    if (!clientConfig) {
      throw new BadRequestException('Client configuration not found');
    }

    return clientConfig;
  }

  async handleCron(): Promise<void> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<ICentOpsResponse>(this.centOpsConfig.url),
      );

      const newConfiguration: ClientConfigDto[] = [];
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

        newConfiguration.push(clientConfig);
      }

      await this.cacheManager.set(this.CENTOPS_CONFIG_CACHE_KEY, newConfiguration);
      this.logger.log('CentOps configuration updated and stored in memory.');
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `Error while get response from ${this.centOpsConfig.url}: ${error.message}`,
        );
      }
    }
  }
}
