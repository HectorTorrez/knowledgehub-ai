import { Global, Module } from '@nestjs/common';
import { SecurityAuditService } from './security-audit.service.js';

@Global()
@Module({
  providers: [SecurityAuditService],
  exports: [SecurityAuditService],
})
export class SecurityAuditModule {}
