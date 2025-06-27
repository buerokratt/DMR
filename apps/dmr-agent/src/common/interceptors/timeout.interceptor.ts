import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
  Inject,
} from '@nestjs/common';
import { throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AppConfig, appConfig } from '../config';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(@Inject(appConfig.KEY) private readonly agentConfig: AppConfig) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      timeout(this.agentConfig.incomingMessageRequestTimeoutMs),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => error);
      }),
    );
  }
}
