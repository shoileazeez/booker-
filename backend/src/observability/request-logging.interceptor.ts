import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const response = httpContext.getResponse();
    if (!request || !response) {
      return next.handle();
    }
    const method = request?.method;
    const url = request?.originalUrl || request?.url;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const status = response?.statusCode ?? 200;
        const durationMs = Date.now() - start;
        this.logger.log(`${method} ${url} ${status} +${durationMs}ms`);
      }),
      catchError((error) => {
        const status = response?.statusCode ?? 500;
        const durationMs = Date.now() - start;
        const stack = error instanceof Error ? error.stack : undefined;
        const message =
          error instanceof Error ? error.message : String(error ?? 'Error');
        this.logger.error(
          `${method} ${url} ${status} +${durationMs}ms - ${message}`,
          stack,
        );
        return throwError(() => error);
      }),
    );
  }
}
