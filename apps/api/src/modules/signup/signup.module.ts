import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ProductCategory } from '../tenants/entities/product-category.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { FullAuthModule } from '../auth/auth.module';
import { MailerService } from '../../common/mailer/mailer.service';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

@Module({
  imports: [
    FullAuthModule,
    TypeOrmModule.forFeature([User, Tenant, ProductCategory, Subscription]),
  ],
  controllers: [SignupController],
  providers: [SignupService, MailerService],
  exports: [SignupService],
})
export class SignupModule {}
