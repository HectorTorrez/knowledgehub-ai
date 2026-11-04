import { EmailDeliveryError, type EmailSender } from './email-sender.port.js';

export class UnconfiguredEmailSender implements EmailSender {
  send(): Promise<void> {
    return Promise.reject(
      new EmailDeliveryError(
        'Email delivery is not configured: set RESEND_API_KEY',
      ),
    );
  }
}
