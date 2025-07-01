import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
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

    const stopTimer = this.metricService.httpRequestDurationSecondsHistogram.startTimer({
      route,
      method,
    });

    return next.handle().pipe(
      tap(() => {
        const status = response.statusCode.toString();

        this.metricService.httpRequestTotalCounter.inc({
          route,
          method,
          status,
        });

        stopTimer({ status });
      }),
      catchError((error: Error) => {
        const status = response.statusCode.toString();

        this.metricService.httpErrorsTotalCounter.inc({
          route,
          method,
        });

        stopTimer({ status });
        return throwError(() => error);
      }),
    );
  }
}
