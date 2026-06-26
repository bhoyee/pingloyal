import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Staff } from './entities/staff.entity';
import { StaffJwtStrategy } from './strategies/staff-jwt.strategy';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffManagementController } from './staff-management.controller';
import { StaffManagementService } from './staff-management.service';
import { StaffRolesGuard } from './guards/staff-roles.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt-staff' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        publicKey: Buffer.from(
          config.getOrThrow<string>('JWT_PUBLIC_KEY'),
          'base64',
        ).toString('utf8'),
      }),
    }),
    TypeOrmModule.forFeature([Staff]),
  ],
  controllers: [StaffAuthController, StaffManagementController],
  providers: [
    StaffAuthService,
    StaffJwtStrategy,
    StaffManagementService,
    StaffRolesGuard,
  ],
  exports: [StaffAuthService],
})
export class StaffAuthModule {}
