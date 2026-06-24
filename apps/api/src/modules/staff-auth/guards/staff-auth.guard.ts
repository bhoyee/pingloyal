import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class StaffAuthGuard extends AuthGuard('jwt-staff') {
  handleRequest<TUser = Express.User>(
    err: Error | null,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
