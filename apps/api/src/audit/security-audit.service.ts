import { Injectable, Logger } from '@nestjs/common';

export type SecurityEvent =
  | 'auth.login.succeeded'
  | 'auth.login.failed'
  | 'auth.register.succeeded'
  | 'auth.register.rejected'
  | 'auth.logout'
  | 'auth.refresh.replay_detected'
  | 'csrf.rejected'
  | 'rate_limit.exceeded';

export type SecurityEventFields = Record<string, unknown>;

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger('SecurityAudit');

  record(event: SecurityEvent, fields: SecurityEventFields = {}): void {
    this.logger.log(
      JSON.stringify({
        securityEvent: event,
        timestamp: new Date().toISOString(),
        ...fields,
      }),
    );
  }
}
