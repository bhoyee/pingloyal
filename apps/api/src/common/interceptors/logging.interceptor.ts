import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

// Inline phone masking — will be replaced by packages/utils maskPhone() in Prompt 14
function maskPhones(text: string): string {
  return text.replace(/\+?\d{7,15}/g, (m) => {
    if (m.length < 7) return m;
    return m.slice(0, 4) + '****' + m.slice(-2);
  });
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, path, id: requestId } = request;
    const tenantId = request.user?.tenantId ?? 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        const duration = Date.now() - start;
        this.logger.log!(
          maskPhones(
            `${method} ${path} ${response.statusCode} ${duration}ms tenant=${tenantId}`,
          ),
          { context: 'HTTP', requestId },
        );
      }),
      catchError((error: unknown) => {
        const duration = Date.now() - start;
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error!(
          maskPhones(
            `${method} ${path} ERROR ${duration}ms tenant=${tenantId} — ${msg}`,
          ),
          { context: 'HTTP', requestId },
        );
        throw error;
      }),
    );
  }
}
