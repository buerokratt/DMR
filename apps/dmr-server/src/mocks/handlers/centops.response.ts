import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('http://localhost:3000/centops/clients', () => {
    return HttpResponse.json({
      response: [
        {
          id: 'd3b07384-d9a0-4c3f-a4e2-123456789abc',
          name: 'Police',
          authentication_certificate:
            '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4G/fpkCPKtx8mtUxJ2iT FXAwj9/q6hdDg19eFmdks0ahGIoiiNCqPQRc/u1eJXO3DSxFjc8SnUHyldyVcHpY 3rXd4YMANo9khPDQkY20Xid0YzshRvcUsOZewLTLCLQuwZafCuYTTLqverOD+HJo xWYov+dW+V5S8SVLu3eTfVx+eG9smcn26SAzJ6EnxSkuaP+vxIz0fSi2uTnX1r1g r4qSp8U6KeOLR5Usx6/IQvOW8Rg2+1gdRpJZ0Br6h2ZtzUaLJ/AdOZw+00yuDmJZ UrjGTC0Pdxf3DfTzXZ4d9feJGg48bKWnlXtDeicWPuVxgUFkig+mtyBZa24xWvyc cwIDAQAB\n-----END PUBLIC KEY-----',
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
