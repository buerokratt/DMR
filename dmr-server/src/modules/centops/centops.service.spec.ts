import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { centOpsConfig } from 'src/common/config';
import { CentOpsService } from './centops.service';

describe('CentOpsService', () => {
  let service: CentOpsService;
  let httpService: HttpService;
  let cacheManager: any;
  let schedulerRegistry: SchedulerRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CentOpsService,
        {
          provide: centOpsConfig.KEY,
          useValue: {
            url: 'http://test-url',
            cronTime: '* * * * *',
          },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn() },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { set: vi.fn(), get: vi.fn() },
        },
        {
          provide: SchedulerRegistry,
          useValue: { addCronJob: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<CentOpsService>(CentOpsService);
    httpService = module.get<HttpService>(HttpService);
    cacheManager = module.get(CACHE_MANAGER);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should schedule cron job on module init', () => {
    const addCronJobSpy = vi.spyOn(schedulerRegistry, 'addCronJob');
    service.onModuleInit();
    expect(addCronJobSpy).toHaveBeenCalled();
  });

  it('should fetch and cache valid configuration', async () => {
    const mockData = {
      response: [
        {
          id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
          name: 'Police',
          authentication_certificate:
            '-----BEGIN CERTIFICATE-----\nMIID...==\n-----END CERTIFICATE-----',
          created_at: '2025-06-10T12:34:56Z',
          updated_at: '2025-06-10T12:34:56Z',
        },
      ],
    };
    vi.spyOn(httpService, 'get').mockReturnValue(of({ data: mockData } as any));
    vi.spyOn(cacheManager, 'set').mockResolvedValue(true);

    await service.handleCron();

    expect(httpService.get).toHaveBeenCalledWith('http://test-url');
    expect(cacheManager.set).toHaveBeenCalledWith('centops_configuration', expect.any(Array));
    expect((service as any).centOpsConfiguration).toHaveLength(1);
  });

  it('should log error if validation fails', async () => {
    const mockData = {
      response: [
        {
          id: null,
          name: 'Org1',
          authentication_certificate: 'cert',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
    };
    vi.spyOn(httpService, 'get').mockReturnValueOnce(of({ data: mockData } as any));
    const loggerErrorSpy = vi.spyOn((service as any).logger, 'error');

    await service.handleCron();

    expect(loggerErrorSpy).toHaveBeenCalled();
    expect((service as any).centOpsConfiguration).toHaveLength(0);
  });

  it('should log error on http failure', async () => {
    vi.spyOn(httpService, 'get').mockImplementationOnce(() => {
      throw new Error('Network error');
    });
    const loggerErrorSpy = vi.spyOn((service as any).logger, 'error');

    await service.handleCron();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error while get response from'),
    );
  });
});
