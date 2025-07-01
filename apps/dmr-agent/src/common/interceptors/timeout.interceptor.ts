import {
  CallHandler,
  ExecutionContext,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AppConfig, appConfig } from '../config';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(@Inject(appConfig.KEY) private readonly agentConfig: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      timeout(this.agentConfig.messageDeliveryTimeoutMs),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(() => new GatewayTimeoutException());
        }
        return throwError(() => error);
      }),
    );
  }
}
