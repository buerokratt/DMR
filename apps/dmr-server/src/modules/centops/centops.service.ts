import {
  AgentDto,
  ClientConfigDto,
  DmrServerEvent,
  IGetAgentConfigListResponse,
} from '@dmr/shared';
import { HttpService } from '@nestjs/axios';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CronJob } from 'cron';
import { firstValueFrom } from 'rxjs';
import { CentOpsConfig, centOpsConfig } from '../../common/config';
import { RabbitMQService } from '../../libs/rabbitmq';
import { CentOpsConfigurationDifference } from './interfaces/cent-ops-configuration-difference.interface';

@Injectable()
export class CentOpsService implements OnModuleInit {
  private readonly CENT_OPS_CONFIG_CACHE_KEY = 'CENT_OPS_CONFIGURATION';
  private readonly CENT_OPS_JOB_NAME = 'CENT_OPS_CONFIG_FETCH';
  private readonly logger = new Logger(CentOpsService.name);

  constructor(
    @Inject(centOpsConfig.KEY)
    private readonly centOpsConfig: CentOpsConfig,
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => RabbitMQService))
    private readonly rabbitMQService: RabbitMQService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly eventEmitter: EventEmitter2,
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

    this.syncConfiguration().catch((error) => {
      this.logger.error('Failed to perform initial configuration sync:', error);
    });
  }

  async getCentOpsConfigurations(): Promise<ClientConfigDto[]> {
    return (await this.cacheManager.get<ClientConfigDto[]>(this.CENT_OPS_CONFIG_CACHE_KEY)) || [];
  }

  async getCentOpsConfigurationByClientId(clientId: string): Promise<ClientConfigDto> {
    const centOpsConfigs =
      (await this.cacheManager.get<ClientConfigDto[]>(this.CENT_OPS_CONFIG_CACHE_KEY)) || [];

    if (centOpsConfigs.length === 0) {
      this.logger.warn('CentOps configuration is empty, attempting to sync configuration...');

      const syncedConfigs = await this.syncConfiguration();

      if (syncedConfigs && syncedConfigs.length > 0) {
        this.logger.log('Configuration synced successfully, retrying client lookup');
        const clientConfig = syncedConfigs.find((config) => config.id === clientId);
        if (clientConfig) {
          return clientConfig;
        }
      }

      this.logger.error('CentOps configuration is empty after sync attempt');
      throw new BadRequestException('CentOps configuration is empty');
    }

    const clientConfig = centOpsConfigs.find((config) => config.id === clientId);
    if (!clientConfig) {
      this.logger.error(`Client configuration not found by ${clientId}`);

      throw new BadRequestException('Client configuration not found');
    }

    return clientConfig;
  }

  async syncConfiguration(): Promise<ClientConfigDto[] | undefined> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<IGetAgentConfigListResponse>(this.centOpsConfig.url),
      );

      const configurations =
        (await this.cacheManager.get<ClientConfigDto[]>(this.CENT_OPS_CONFIG_CACHE_KEY)) ?? [];

      const newConfigurations: ClientConfigDto[] = [];

      for (const item of data.response) {
        const clientConfig = plainToInstance(ClientConfigDto, {
          id: item.id,
          name: item.name,
          authenticationCertificate: item.authentication_certificate.replace(/\\n/g, '\n'),
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

        newConfigurations.push(clientConfig);
      }

      const difference = this.getDifference(configurations, newConfigurations);

      // Setup queues for new agents with graceful error handling
      const queueSetupPromises = difference.added.map(async (addedConfiguration) => {
        try {
          const success = await this.rabbitMQService.setupQueue(addedConfiguration.id);
          if (!success) {
            this.logger.warn(
              `Failed to setup queue for agent ${addedConfiguration.id}, will retry later`,
            );
          }
        } catch (error) {
          this.logger.error(`Error setting up queue for agent ${addedConfiguration.id}:`, error);
        }
      });

      // Delete queues for removed agents
      const queueDeletionPromises = difference.deleted.map(async (deletedConfiguration) => {
        try {
          await this.rabbitMQService.deleteQueue(deletedConfiguration.id);
        } catch (error) {
          this.logger.error(`Error deleting queue for agent ${deletedConfiguration.id}:`, error);
        }
      });

      // Wait for all queue operations to complete (but don't block on failures)
      await Promise.allSettled([...queueSetupPromises, ...queueDeletionPromises]);

      await this.cacheManager.set(this.CENT_OPS_CONFIG_CACHE_KEY, newConfigurations);
      this.eventEmitter.emit(DmrServerEvent.UPDATED, difference);

      if (difference.certificateChanged.length > 0) {
        this.logger.warn(
          `Certificate changes detected for ${difference.certificateChanged.length} agent(s): ${difference.certificateChanged.map((agent) => agent.id).join(', ')}`,
        );
      }

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

  private getDifference(
    cacheData: ClientConfigDto[],
    centOpsData: ClientConfigDto[],
  ): CentOpsConfigurationDifference {
    const oldIds = new Set(cacheData.map((item) => item.id));
    const newIds = new Set(centOpsData.map((item) => item.id));

    const added: AgentDto[] = [];
    const deleted: AgentDto[] = [];
    const certificateChanged: AgentDto[] = [];

    const oldConfigMap = new Map(cacheData.map((item) => [item.id, item]));

    for (const newItem of centOpsData) {
      if (!oldIds.has(newItem.id)) {
        added.push({ ...newItem, deleted: false });
      } else {
        const oldItem = oldConfigMap.get(newItem.id);
        if (oldItem && oldItem.authenticationCertificate !== newItem.authenticationCertificate) {
          certificateChanged.push({ ...newItem, deleted: false });
        }
      }
    }

    for (const oldItem of cacheData) {
      if (!newIds.has(oldItem.id)) {
        deleted.push({ ...oldItem, deleted: true });
      }
    }

    return {
      added: added,
      deleted: deleted,
      certificateChanged: certificateChanged,
    };
  }
}
