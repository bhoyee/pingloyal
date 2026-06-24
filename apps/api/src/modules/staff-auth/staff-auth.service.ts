import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import type { StaffJwtPayload } from '@pingloyal/types';
import { REDIS_CLIENT } from '../../common/redis/redis.constants';
import { Staff } from './entities/staff.entity';
import { StaffLoginDto } from './dto/staff-login.dto';
import { StaffRefreshDto } from './dto/staff-refresh.dto';

export interface StaffAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface StaffLoginResponse extends StaffAuthTokens {
  staff: { id: string; email: string; fullName: string };
}

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Staff) private readonly staffRepo: Repository<Staff>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async login(dto: StaffLoginDto): Promise<StaffLoginResponse> {
    const staff = await this.staffRepo.findOne({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (!staff) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      staff.hashedPassword,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(staff);
    return {
      ...tokens,
      staff: { id: staff.id, email: staff.email, fullName: staff.fullName },
    };
  }

  async refresh(dto: StaffRefreshDto): Promise<StaffAuthTokens> {
    let payload: StaffJwtPayload;
    try {
      const publicKey = Buffer.from(
        this.configService.getOrThrow<string>('JWT_PUBLIC_KEY'),
        'base64',
      ).toString('utf8');

      payload = this.jwtService.verify<StaffJwtPayload>(dto.refreshToken, {
        algorithms: ['RS256'],
        secret: publicKey,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const staffId = payload.sub;
    const storedHash = await this.redis.get(`refresh:staff:${staffId}`);
    if (!storedHash) {
      throw new UnauthorizedException('Session expired');
    }

    const incomingHash = crypto
      .createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');
    if (incomingHash !== storedHash) {
      await this.redis.del(`refresh:staff:${staffId}`);
      throw new UnauthorizedException('Session expired');
    }

    await this.redis.del(`refresh:staff:${staffId}`);

    const staff = await this.staffRepo.findOne({ where: { id: staffId } });
    if (!staff) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(staff);
  }

  async logout(staffId: string): Promise<{ message: string }> {
    await this.redis.del(`refresh:staff:${staffId}`);
    return { message: 'Logged out successfully' };
  }

  private async issueTokens(staff: Staff): Promise<StaffAuthTokens> {
    const privateKey = Buffer.from(
      this.configService.getOrThrow<string>('JWT_PRIVATE_KEY'),
      'base64',
    ).toString('utf8');

    const accessToken = this.jwtService.sign({ sub: staff.id, type: 'staff' }, {
      algorithm: 'RS256',
      privateKey,
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    } as Parameters<typeof this.jwtService.sign>[1]);

    const refreshToken = this.jwtService.sign(
      { sub: staff.id, type: 'staff' },
      {
        algorithm: 'RS256',
        privateKey,
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '30d',
        ),
      } as Parameters<typeof this.jwtService.sign>[1],
    );

    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const ttl = this.parseTtl(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    );
    await this.redis.setex(`refresh:staff:${staff.id}`, ttl, hash);

    return { accessToken, refreshToken };
  }

  private parseTtl(duration: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
    };
    const match = duration.match(/^(\d+)([smhdw])$/);
    if (!match) return 30 * 86400;
    return parseInt(match[1]) * units[match[2]];
  }
}
