import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import type { StaffJwtPayload, RequestStaff } from '@pingloyal/types';
import { Staff } from '../entities/staff.entity';

// Registered under a distinct strategy name ('jwt-staff', not the tenant
// auth's 'jwt') so AuthGuard('jwt-staff') and the tenant JwtAuthGuard never
// validate each other's tokens — structural isolation, not just payload
// shape. See packages/types/src/auth.ts for why StaffJwtPayload has no
// tenantId/role/planTier.
@Injectable()
export class StaffJwtStrategy extends PassportStrategy(Strategy, 'jwt-staff') {
  constructor(
    config: ConfigService,
    @InjectRepository(Staff) private readonly staffRepo: Repository<Staff>,
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

  async validate(payload: StaffJwtPayload): Promise<RequestStaff> {
    if (payload.type !== 'staff') {
      throw new UnauthorizedException('Invalid token');
    }

    const staff = await this.staffRepo.findOne({
      where: { id: payload.sub },
    });
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return {
      staffId: staff.id,
      fullName: staff.fullName,
      staffRole: staff.role,
    };
  }
}
