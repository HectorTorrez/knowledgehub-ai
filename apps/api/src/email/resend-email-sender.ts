import { Resend } from 'resend';
import {
  EmailDeliveryError,
  type EmailMessage,
  type EmailSender,
} from './email-sender.port.js';

type ResendEmails = Pick<Resend['emails'], 'send'>;

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly emails: ResendEmails,
    private readonly from: string,
  ) {}

  static create(apiKey: string, from: string): ResendEmailSender {
    return new ResendEmailSender(new Resend(apiKey).emails, from);
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text === undefined ? {} : { text: message.text }),
    });

    if (error) {
      throw new EmailDeliveryError(
        `Resend rejected the email: ${error.name}: ${error.message}`,
      );
    }
  }
}
