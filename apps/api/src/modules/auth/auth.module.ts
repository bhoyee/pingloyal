import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // privateKey / publicKey and algorithm set per-call in AuthService
        // to work around ms.StringValue type constraint in JwtModuleOptions
        publicKey: Buffer.from(
          config.getOrThrow<string>('JWT_PUBLIC_KEY'),
          'base64',
        ).toString('utf8'),
      }),
    }),
    TypeOrmModule.forFeature([User, Tenant, ProductCategory, Subscription]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtModule, PassportModule],
})
export class FullAuthModule {}
