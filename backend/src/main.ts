import { LogLevel, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';
import { SentryExceptionFilter } from './observability/sentry-exception.filter';
import { initSentry } from './observability/sentry';
import { AlertingService } from './modules/notifications/alerting.service';

const resolveLogLevels = (): LogLevel[] => {
  const allowed: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose'];
  const raw = process.env.LOG_LEVELS;
  if (!raw) return allowed;

  const normalized = raw
    .split(',')
    .map((level) => level.trim())
    .filter((level): level is LogLevel => allowed.includes(level as LogLevel));

  return normalized.length > 0 ? normalized : allowed;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: resolveLogLevels(),
  });
  const logger = new Logger('Bootstrap');

  initSentry(app);

  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  const httpAdapterHost = app.get(HttpAdapterHost);
  const alertingService = app.get(AlertingService);
  app.useGlobalFilters(
    new SentryExceptionFilter(httpAdapterHost, alertingService),
  );
  // Allow connections from the mobile app / other clients (CORS)
  const corsOrigin = process.env.CORS_ORIGIN;
  const origin = corsOrigin
    ? corsOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : true;
  app.enableCors({ origin });

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);

  logger.log(`Server listening on http://${host}:${port}`);
  logger.log(`Health endpoint: http://${host}:${port}/api/health`);
}
bootstrap();
