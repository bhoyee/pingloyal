import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env early so Winston config can read LOG_LEVEL / NODE_ENV before NestJS init
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import helmet from 'helmet';
import compression from 'compression';
import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { createWinstonConfig } from './common/logger/winston.config';

function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
    res.status(401).send('Authentication required');
    return;
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const colonIdx = decoded.indexOf(':');
  const username = decoded.slice(0, colonIdx);
  const password = decoded.slice(colonIdx + 1);
  if (
    username === process.env.ADMIN_QUEUE_USER &&
    password === process.env.ADMIN_QUEUE_PASS
  ) {
    next();
    return;
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
  res.status(401).send('Invalid credentials');
}

async function bootstrap(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const logLevel = process.env.LOG_LEVEL ?? 'info';

  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: nodeEnv });
  }

  // rawBody: true captures req.rawBody (Buffer) alongside parsed body —
  // needed for HMAC signature verification on webhook routes
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(createWinstonConfig(nodeEnv, logLevel)),
    rawBody: true,
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy:
        nodeEnv === 'development'
          ? false
          : {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: [
                  "'self'",
                  'data:',
                  '*.r2.cloudflarestorage.com',
                  '*.r2.dev',
                  process.env.FRONTEND_URL ?? 'http://localhost:3001',
                ],
                connectSrc: [
                  "'self'",
                  process.env.FRONTEND_URL ?? 'http://localhost:3001',
                ],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
              },
            },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      permittedCrossDomainPolicies: false,
    }),
  );

  // Gzip compression
  app.use(compression());

  // CORS — FRONTEND_URL supports comma-separated origins for LAN dev access
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Global route prefix — exclude /admin so Bull Board is reachable without prefix
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'admin/(.*)', method: RequestMethod.ALL }],
  });

  // Basic auth guard for queue dashboard
  app.use('/admin', basicAuth);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger — development only
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PingLoyal API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  console.log(
    `PingLoyal API running on port ${port} in ${nodeEnv} environment`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
