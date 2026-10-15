import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthConfig } from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionGuard } from './session.guard.js';
import { TokenService } from './token.service.js';

/**
 * Authentication feature module.
 *
 * For now it exposes registration plus the reusable token/password/session
 * building blocks that future authentication flows (login, refresh, logout)
 * will share. JWT secrets are read from configuration, not registered here.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthConfig,
    AuthService,
    PasswordService,
    TokenService,
    SessionGuard,
  ],
  exports: [AuthConfig, AuthService, TokenService, SessionGuard],
})
export class AuthModule {}
