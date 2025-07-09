import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import { MetricService } from '../../libs/metrics';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricService: MetricService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const method = request.method;
    const route = (request.route as unknown as { path?: string })?.path || request.url;

    this.metricService.httpRequestTotalCounter.inc({
      route,
      method,
    });

    const stopTimer = this.metricService.httpRequestDurationSecondsHistogram.startTimer({
      route,
      method,
    });

    return next.handle().pipe(
      tap(() => {
        const status = response.statusCode.toString();

        this.metricService.httpSuccessTotalCounter.inc({
          route,
          method,
          status,
        });

        stopTimer({ status });
      }),
      catchError((error: Error) => {
        const status = error instanceof HttpException ? error.getStatus().toString() : '500';

        this.metricService.httpErrorsTotalCounter.inc({
          route,
          method,
          status,
        });

        stopTimer({ status });
        return throwError(() => error);
      }),
    );
  }
}
