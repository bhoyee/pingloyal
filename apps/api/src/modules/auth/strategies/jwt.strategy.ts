// RS256 JWT strategy — verifies tokens signed with the RSA private key.
//
// Key generation (run once, store results in .env):
//   openssl genrsa -out private.pem 2048
//   openssl rsa -in private.pem -pubout -out public.pem
//   base64 -w 0 private.pem   → JWT_PRIVATE_KEY
//   base64 -w 0 public.pem    → JWT_PUBLIC_KEY
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import type { JwtPayload, RequestUser } from '@pingloyal/types';
import { User } from '../../auth/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    const publicKey = Buffer.from(
      config.getOrThrow<string>('JWT_PUBLIC_KEY'),
      'base64',
    ).toString('utf8');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.userRepo.findOne({
      where: { id: payload.sub, tenantId: payload.tenantId },
      select: ['id', 'tenantId', 'role', 'isActive'],
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      planTier: payload.planTier,
    };
  }
}
