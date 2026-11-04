import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthConfig } from './auth.config.js';
import { EmailModule } from '../email/email.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PersonalDataService } from './personal-data.service.js';
import { PasswordService } from './password.service.js';
import { SessionGuard } from './session.guard.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [JwtModule.register({}), EmailModule],
  controllers: [AuthController],
  providers: [
    AuthConfig,
    AuthService,
    EmailVerificationService,
    PersonalDataService,
    PasswordService,
    TokenService,
    SessionGuard,
    CsrfGuard,
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AuthConfig, AuthService, TokenService, SessionGuard],
})
export class AuthModule {}
