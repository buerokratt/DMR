import { HttpService } from '@nestjs/axios';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DmrServerEvent } from '@dmr/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { centOpsConfig } from '../../common/config';
import { RabbitMQService } from '../../libs/rabbitmq';
import { CentOpsService } from './centops.service';

describe('CentOpsService', () => {
  let service: CentOpsService;
  let httpService: HttpService;
  let cacheManager: Cache;
  let schedulerRegistry: SchedulerRegistry;
  let eventEmitter: EventEmitter2;

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
          provide: RabbitMQService,
          useValue: { setupQueue: vi.fn(), deleteQueue: vi.fn() },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { set: vi.fn(), get: vi.fn() },
        },
        {
          provide: SchedulerRegistry,
          useValue: { addCronJob: vi.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
      ],
    }).compile();

    cacheManager = module.get(CACHE_MANAGER);
    httpService = module.get<HttpService>(HttpService);
    service = module.get<CentOpsService>(CentOpsService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
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
    vi.spyOn(cacheManager, 'get').mockResolvedValue([]); // assume cache is initially empty
    vi.spyOn(cacheManager, 'set').mockResolvedValue(true);
    vi.spyOn(eventEmitter, 'emit');

    const response = await service.syncConfiguration();

    expect(response).toHaveLength(1);
    expect(httpService.get).toHaveBeenCalledWith('http://test-url');
    expect(cacheManager.get).toHaveBeenCalledWith('CENT_OPS_CONFIGURATION');
    expect(cacheManager.set).toHaveBeenCalledWith('CENT_OPS_CONFIGURATION', expect.any(Array));
    expect(eventEmitter.emit).toHaveBeenCalledWith(DmrServerEvent.UPDATED, expect.any(Object));
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
    vi.spyOn(cacheManager, 'get').mockResolvedValue([]);
    const loggerErrorSpy = vi.spyOn((service as any).logger, 'error');

    const response = await service.syncConfiguration();

    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(response).toHaveLength(0);
  });

  it('should log error on http failure', async () => {
    vi.spyOn(httpService, 'get').mockImplementationOnce(() => {
      throw new Error('Network error');
    });
    const loggerErrorSpy = vi.spyOn((service as any).logger, 'error');

    await service.syncConfiguration();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error while get response from'),
    );
  });

  it('should detect certificate changes and emit appropriate events', async () => {
    const cachedConfig = [
      {
        id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
        name: 'Police',
        authenticationCertificate: 'old-cert-1',
        createdAt: '2025-06-10T12:34:56Z',
        updatedAt: '2025-06-10T12:34:56Z',
      },
      {
        id: 'a1e45678-12bc-4ef0-9876-def123456789',
        name: 'Tax Office',
        authenticationCertificate: 'cert-2',
        createdAt: '2025-06-08T08:22:10Z',
        updatedAt: '2025-06-09T09:13:44Z',
      },
    ];

    const mockData = {
      response: [
        {
          id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
          name: 'Police',
          authentication_certificate: 'new-cert-1',
          created_at: '2025-06-10T12:34:56Z',
          updated_at: '2025-06-10T14:00:00Z',
        },
        {
          id: 'a1e45678-12bc-4ef0-9876-def123456789',
          name: 'Tax Office',
          authentication_certificate: 'cert-2',
          created_at: '2025-06-08T08:22:10Z',
          updated_at: '2025-06-09T09:13:44Z',
        },
        {
          id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          name: 'Fire Department',
          authentication_certificate: 'cert-3',
          created_at: '2025-06-11T10:00:00Z',
          updated_at: '2025-06-11T10:00:00Z',
        },
      ],
    };

    vi.spyOn(httpService, 'get').mockReturnValue(of({ data: mockData } as any));
    vi.spyOn(cacheManager, 'get').mockResolvedValue(cachedConfig);
    vi.spyOn(cacheManager, 'set').mockResolvedValue(true);
    vi.spyOn(eventEmitter, 'emit');
    const loggerWarnSpy = vi.spyOn((service as any).logger, 'warn');

    const response = await service.syncConfiguration();

    expect(response).toHaveLength(3);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      DmrServerEvent.UPDATED,
      expect.objectContaining({
        added: expect.arrayContaining([
          expect.objectContaining({ id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', deleted: false }),
        ]),
        deleted: [],
        certificateChanged: expect.arrayContaining([
          expect.objectContaining({
            id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
            authenticationCertificate: 'new-cert-1',
            deleted: false,
          }),
        ]),
      }),
    );

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Certificate changes detected for 1 agent(s): d3b07384-d9a0-4c3f-a4e2-123456789abc',
      ),
    );
  });

  it('should detect multiple certificate changes', async () => {
    const cachedConfig = [
      {
        id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
        name: 'Police',
        authenticationCertificate: 'old-cert-1',
        createdAt: '2025-06-10T12:34:56Z',
        updatedAt: '2025-06-10T12:34:56Z',
      },
      {
        id: 'a1e45678-12bc-4ef0-9876-def123456789',
        name: 'Tax Office',
        authenticationCertificate: 'old-cert-2',
        createdAt: '2025-06-08T08:22:10Z',
        updatedAt: '2025-06-09T09:13:44Z',
      },
    ];

    const mockData = {
      response: [
        {
          id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
          name: 'Police',
          authentication_certificate: 'new-cert-1',
          created_at: '2025-06-10T12:34:56Z',
          updated_at: '2025-06-10T14:00:00Z',
        },
        {
          id: 'a1e45678-12bc-4ef0-9876-def123456789',
          name: 'Tax Office',
          authentication_certificate: 'new-cert-2',
          created_at: '2025-06-08T08:22:10Z',
          updated_at: '2025-06-09T11:00:00Z',
        },
      ],
    };

    vi.spyOn(httpService, 'get').mockReturnValue(of({ data: mockData } as any));
    vi.spyOn(cacheManager, 'get').mockResolvedValue(cachedConfig);
    vi.spyOn(cacheManager, 'set').mockResolvedValue(true);
    vi.spyOn(eventEmitter, 'emit');
    const loggerWarnSpy = vi.spyOn((service as any).logger, 'warn');

    await service.syncConfiguration();

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      DmrServerEvent.UPDATED,
      expect.objectContaining({
        added: [],
        deleted: [],
        certificateChanged: expect.arrayContaining([
          expect.objectContaining({ id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc' }),
          expect.objectContaining({ id: 'a1e45678-12bc-4ef0-9876-def123456789' }),
        ]),
      }),
    );

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Certificate changes detected for 2 agent(s): d3b07384-d9a0-4c3f-a4e2-123456789abc, a1e45678-12bc-4ef0-9876-def123456789',
      ),
    );
  });

  it('should not detect certificate changes when certificates are the same', async () => {
    const cachedConfig = [
      {
        id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
        name: 'Police',
        authenticationCertificate: 'cert-1',
        createdAt: '2025-06-10T12:34:56Z',
        updatedAt: '2025-06-10T12:34:56Z',
      },
    ];

    const mockData = {
      response: [
        {
          id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
          name: 'Police',
          authentication_certificate: 'cert-1',
          created_at: '2025-06-10T12:34:56Z',
          updated_at: '2025-06-10T14:00:00Z',
        },
      ],
    };

    vi.spyOn(httpService, 'get').mockReturnValue(of({ data: mockData } as any));
    vi.spyOn(cacheManager, 'get').mockResolvedValue(cachedConfig);
    vi.spyOn(cacheManager, 'set').mockResolvedValue(true);
    vi.spyOn(eventEmitter, 'emit');
    const loggerWarnSpy = vi.spyOn((service as any).logger, 'warn');

    await service.syncConfiguration();

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      DmrServerEvent.UPDATED,
      expect.objectContaining({
        added: [],
        deleted: [],
        certificateChanged: [],
      }),
    );

    expect(loggerWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Certificate changes detected'),
    );
  });
});
