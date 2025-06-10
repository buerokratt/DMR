import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('http://localhost:3000/centops/clients', () => {
    return HttpResponse.json({
      response: [
        {
          id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
          name: 'Police',
          authentication_certificate:
            '-----BEGIN CERTIFICATE-----\nMIID...==\n-----END CERTIFICATE-----',
          created_at: '2025-06-10T12:34:56Z',
          updated_at: '2025-06-10T12:34:56Z',
        },
        {
          id: 'a1e45678-12bc-4ef0-9876-def123456789',
          name: 'Tax office',
          authentication_certificate:
            '-----BEGIN CERTIFICATE-----\nABCD...==\n-----END CERTIFICATE-----',
          created_at: '2025-06-08T08:22:10Z',
          updated_at: '2025-06-09T09:13:44Z',
        },
      ],
    });
  }),
];
