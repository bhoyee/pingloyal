import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const HTTP_STATUS_GONE: number = HttpStatus.GONE;

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = Express.User>(
    err: Error | null,
    user: TUser | false,
  ): TUser {
    // Account-deletion signal from JwtStrategy.validate() — must surface as
    // 410 Gone (not a generic 401) so the frontend redirects to the landing
    // page instead of bouncing back to a login screen for a deleted account.
    if (err instanceof HttpException && err.getStatus() === HTTP_STATUS_GONE) {
      throw err;
    }
    if (err || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
