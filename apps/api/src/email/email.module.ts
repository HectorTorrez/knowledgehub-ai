import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER, type EmailSender } from './email-sender.port.js';
import { ResendEmailSender } from './resend-email-sender.js';
import { UnconfiguredEmailSender } from './unconfigured-email-sender.js';

@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailSender => {
        const apiKey = config.get<string>('RESEND_API_KEY');
        if (apiKey === undefined) return new UnconfiguredEmailSender();
        return ResendEmailSender.create(
          apiKey,
          config.getOrThrow<string>('EMAIL_FROM'),
        );
      },
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
