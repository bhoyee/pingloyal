import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const isProd = process.env.NODE_ENV === 'production';

    let statusCode: number;
    let message: string;
    let errorName: string;
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : (body as { message?: string }).message ?? exception.message;
      errorName = exception.name;
      stack = exception.stack;
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      // Never leak internal error details in production
      message = isProd ? 'Internal server error' : (exception as Error).message;
      errorName = isProd ? 'InternalServerError' : (exception as Error).name ?? 'Error';
      stack = (exception as Error).stack;
    }

    // Tenant isolation: standardise 404 messages — never reveal tenant scoping
    if (statusCode === 404) {
      message = 'Resource not found';
    }

    const requestId = request.id ?? 'unknown';
    const path = request.url;

    this.logger.error!(message, {
      context: 'GlobalExceptionFilter',
      statusCode,
      path,
      requestId,
      stack: stack ?? '',
    });

    if (process.env.SENTRY_DSN) {
      Sentry.captureException(exception);
    }

    const body: Record<string, unknown> = {
      statusCode,
      message,
      error: errorName,
      timestamp: new Date().toISOString(),
      path,
      requestId,
    };

    // Include stack trace only in development
    if (!isProd && stack) {
      body.stack = stack;
    }

    response.status(statusCode).json(body);
  }
}
