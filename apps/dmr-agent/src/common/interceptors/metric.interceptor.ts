import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import { MetricService } from '../../libs/metrics';

@Injectable()
export class MetricInterceptor implements NestInterceptor {
  constructor(private readonly metricService: MetricService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const method = request.method;
    const route = (request.route as unknown as { path?: string })?.path || request.url;

    return next.handle().pipe(
      tap(() => {
        const status = response.statusCode.toString();

        this.metricService.httpRequestTotalCounter.inc({
          route,
          method,
          status,
        });
      }),
      catchError((error: Error) => {
        this.metricService.httpErrorsTotalCounter.inc({
          route,
          method,
        });
        return throwError(() => error);
      }),
    );
  }
}
