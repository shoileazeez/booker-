import { INestApplication, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import { ProfilingIntegration } from '@sentry/profiling-node';

export type SentryRuntimeConfig = {
  enabled: boolean;
  dsn?: string;
  environment?: string;
  release?: string;
  tracesSampleRate: number;
  profilesSampleRate: number;
};

const logger = new Logger('Sentry');

const parseSampleRate = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0 || parsed > 1) return fallback;
  return parsed;
};

export const getSentryConfig = (): SentryRuntimeConfig => {
  const enabled =
    String(process.env.SENTRY_ENABLED ?? 'true').toLowerCase() !== 'false';
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV;
  const release = process.env.SENTRY_RELEASE;

  return {
    enabled,
    dsn,
    environment,
    release,
    tracesSampleRate: parseSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE,
      0.1,
    ),
    profilesSampleRate: parseSampleRate(
      process.env.SENTRY_PROFILES_SAMPLE_RATE,
      0.1,
    ),
  };
};

export const isSentryEnabled = () => {
  const config = getSentryConfig();
  return Boolean(config.enabled && config.dsn);
};

export const initSentry = (app: INestApplication): SentryRuntimeConfig => {
  const config = getSentryConfig();

  if (!config.enabled) {
    logger.log('Sentry disabled via SENTRY_ENABLED=false');
    return config;
  }

  if (!config.dsn) {
    logger.warn('SENTRY_DSN not set. Skipping Sentry initialization.');
    return { ...config, enabled: false };
  }

  const httpAdapter = app.getHttpAdapter().getInstance();
  const integrations = [
    new Sentry.Integrations.Http({ tracing: true }),
    new Tracing.Integrations.Express({ app: httpAdapter }),
  ];

  if (config.profilesSampleRate > 0) {
    integrations.push(new ProfilingIntegration());
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    profilesSampleRate: config.profilesSampleRate,
    integrations,
  });

  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());

  logger.log('Sentry initialized');

  return config;
};
