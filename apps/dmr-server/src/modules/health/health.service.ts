import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus(): { status: string; timestamp: number } {
    return {
      status: 'ok',
      timestamp: Date.now(),
    };
  }
}
