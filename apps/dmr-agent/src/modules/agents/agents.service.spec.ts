import { IAgent, IAgentList } from '@dmr/shared';
import * as classTransformer from 'class-transformer';
import * as classValidator from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebsocketService } from '../websocket/websocket.service';
import { AgentsService } from './agents.service';

describe('AgentsService', () => {
  let service: AgentsService;
  let mockWebsocketService: WebsocketService;
  let mockCacheManager: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any, ttl?: number) => Promise<void>;
  };

  const agent1: IAgent = {
    id: '1',
    name: 'Agent 1',
    authenticationCertificate: 'cert1',
    createdAt: '2023-01-01',
    updatedAt: '2023-01-02',
  };

  const agent2: IAgent = {
    id: '2',
    name: 'Agent 2',
    authenticationCertificate: 'cert2',
    createdAt: '2023-01-03',
    updatedAt: '2023-01-04',
  };

  const deletedAgent: IAgent = {
    id: '3',
    name: 'Deleted Agent',
    authenticationCertificate: 'cert3',
    createdAt: '2023-01-05',
    updatedAt: '2023-01-06',
    deleted: true,
  };

  beforeEach(() => {
    mockWebsocketService = {
      isConnected: vi.fn(),
      getSocket: vi.fn(),
    } as any;

    mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
    };

    // Mock transform and validation globally
    vi.spyOn(classTransformer, 'plainToInstance').mockImplementation((_, obj) => obj as any);
    vi.spyOn(classValidator, 'validate').mockResolvedValue([]); // Assume always valid

    service = new AgentsService(mockCacheManager as any, mockWebsocketService);
  });

  it('should call setupSocketEventListeners on module init', () => {
    const setupSpy = vi.spyOn(service as any, 'setupSocketEventListeners');
    service.onModuleInit();
    expect(setupSpy).toHaveBeenCalled();
  });

  it('should store only valid agents from full list', async () => {
    const data: IAgentList = {
      response: [agent1, deletedAgent, { ...agent2, id: null } as any],
    };

    await (service as any).handleFullAgentListEvent(data);

    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'DMR_AGENTS_LIST',
      expect.arrayContaining([
        expect.objectContaining({ id: '1' }),
        expect.objectContaining({ id: '3' }),
      ]),
    );
    const cachedAgents = (mockCacheManager.set as any).mock.calls[0][1];
    expect(cachedAgents).toHaveLength(2);
  });

  it('should merge agents and delete marked ones on partial list event', async () => {
    mockCacheManager.get = vi.fn().mockResolvedValue([agent1]);

    const update: IAgentList = {
      response: [agent2, { ...agent1, deleted: true }],
    };

    await (service as any).handlePartialAgentListEvent(update);

    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'DMR_AGENTS_LIST',
      [expect.objectContaining({ id: '2' })],
      0,
    );
  });

  it('should retrieve agent by ID from cache', async () => {
    mockCacheManager.get = vi.fn().mockResolvedValue([agent1, agent2]);

    const result = await service.getAgentById('2');
    expect(result).toEqual(agent2);
  });

  it('should return null if agent ID is not found', async () => {
    mockCacheManager.get = vi.fn().mockResolvedValue([agent1]);

    const result = await service.getAgentById('not-found');
    expect(result).toBeNull();
  });

  it('should return null if getAgentById throws error', async () => {
    mockCacheManager.get = vi.fn().mockRejectedValue(new Error('Unexpected error'));

    const result = await service.getAgentById('1');
    expect(result).toBeNull();
  });
});
