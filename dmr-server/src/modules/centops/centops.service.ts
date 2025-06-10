import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CENT_OPS_CONFIG_TOKEN, CentOpsConfig } from '../../common/config/app.config';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { plainToInstance } from 'class-transformer';
import { CentOpsClientResponseDto, ClientConfigDto } from './dto/client-config.dto';
import { validate } from 'class-validator';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class CentopsService implements OnModuleInit {
  private readonly centOpsConfig: CentOpsConfig;
  private centOpsConfiguration: ClientConfigDto[] = [];
  private readonly CENTOPS_CONFIG_CACHE_KEY = 'centops_configuration';
  private readonly CENTOPS_JOB_NAME = 'centops_config_fetch';

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    private readonly httpService: HttpService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.centOpsConfig = this.configService.getOrThrow<CentOpsConfig>(CENT_OPS_CONFIG_TOKEN);
  }

  onModuleInit(): void {
    const job = new CronJob(this.centOpsConfig.cronTime, async () => {
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

  async handleCron() {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<CentOpsClientResponseDto>(this.centOpsConfig.url),
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

      this.centOpsConfiguration = newConfiguration;
      await this.cacheManager.set(this.CENTOPS_CONFIG_CACHE_KEY, this.centOpsConfiguration);
      this.logger.log('CentOps configuration updated and stored in memory.');
    } catch (error) {
      this.logger.error(
        `Error while get response from ${this.centOpsConfig.url}: ${error.message}`,
      );
    }
  }
}
