import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('http://localhost:3000/centops/clients', () => {
    return HttpResponse.json({
      response: [
        {
          id: process.env.MOCK_DMR_AGENT_A_ID,
          name: 'Police',
          authentication_certificate:
            process.env.MOCK_DMR_AGENT_A_PUBLIC_KEY || 'MOCK_DMR_AGENT_A_PUBLIC_KEY not set',
          created_at: '2025-06-10T12:34:56Z',
          updated_at: '2025-06-10T12:34:56Z',
        },
        {
          id: process.env.MOCK_DMR_AGENT_B_ID,
          name: 'Tax office',
          authentication_certificate:
            process.env.MOCK_DMR_AGENT_B_PUBLIC_KEY || 'MOCK_DMR_AGENT_B_PUBLIC_KEY not set',
          created_at: '2025-06-08T08:22:10Z',
          updated_at: '2025-06-09T09:13:44Z',
        },
      ],
    });
  }),
];
