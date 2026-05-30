import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AlertingService } from '../modules/notifications/alerting.service';
import { isSentryEnabled } from './sentry';

type RequestUser = {
  sub?: string;
  email?: string;
};

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);
  private readonly alertingService: AlertingService;

  constructor(
    httpAdapterHost: HttpAdapterHost,
    alertingService: AlertingService,
  ) {
    super(httpAdapterHost.httpAdapter);
    this.alertingService = alertingService;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let eventId: string | undefined;
    if (isSentryEnabled()) {
      eventId = Sentry.withScope((scope) => {
        const method = request?.method;
        const url = request?.originalUrl || request?.url;
        const user = request?.user as RequestUser | undefined;

        scope.setTag('http.method', method);
        scope.setTag('http.status_code', String(status));
        if (url) scope.setTag('http.url', url);

        if (user?.sub || user?.email) {
          scope.setUser({
            id: user.sub,
            email: user.email,
          });
        }

        scope.setContext('request', {
          method,
          url,
          ip: request?.ip,
          userAgent: request?.headers?.['user-agent'],
        });

        return Sentry.captureException(exception);
      });
    }

    this.alertingService
      .notifyException({
        exception,
        status,
        eventId,
        request: {
          method: request?.method,
          url: request?.originalUrl || request?.url,
          ip: request?.ip,
          userAgent: request?.headers?.['user-agent'],
          userId: request?.user?.sub,
          userEmail: request?.user?.email,
        },
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : String(error ?? 'Error');
        this.logger.error(`Alerting failed: ${message}`);
      });

    super.catch(exception, host);
  }
}
