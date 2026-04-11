import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
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
