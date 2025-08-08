import { http, HttpResponse } from 'msw';

// Mocked per https://github.com/buerokratt/CentOps/issues/263
export const handlers = [
  http.get(process.env.CENTOPS_CONFIGURATION_URL as string, () => {
    return HttpResponse.json({
      response: {
        items: [
          {
            clientId: process.env.MOCK_DMR_AGENT_A_ID,
            name: 'Police',
            authenticationCertificate:
              process.env.MOCK_DMR_AGENT_A_PUBLIC_KEY || 'MOCK_DMR_AGENT_A_PUBLIC_KEY not set',
            createdAt: '2025-06-10T12:34:56Z',
            updatedAt: '2025-06-10T12:34:56Z',
          },
          {
            clientId: process.env.MOCK_DMR_AGENT_B_ID,
            name: 'Tax office',
            authenticationCertificate:
              process.env.MOCK_DMR_AGENT_B_PUBLIC_KEY || 'MOCK_DMR_AGENT_B_PUBLIC_KEY not set',
            createdAt: '2025-06-08T08:22:10Z',
            updatedAt: '2025-06-09T09:13:44Z',
          },
        ],
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
    });
  }),
];
