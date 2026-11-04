import { describe, expect, it, vi } from 'vitest';
import { EmailDeliveryError } from './email-sender.port.js';
import { ResendEmailSender } from './resend-email-sender.js';

const message = {
  to: 'member@example.com',
  subject: 'Welcome',
  html: '<p>Hi</p>',
};

describe('ResendEmailSender', () => {
  it('sends from the configured address', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'id' }, error: null });
    const sender = new ResendEmailSender(
      { send },
      'KnowledgeHub <hub@example.com>',
    );

    await sender.send(message);

    expect(send).toHaveBeenCalledWith({
      from: 'KnowledgeHub <hub@example.com>',
      ...message,
    });
  });

  it('raises a delivery error when Resend returns an error', async () => {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `to` field' },
    });
    const sender = new ResendEmailSender({ send }, 'hub@example.com');

    await expect(sender.send(message)).rejects.toBeInstanceOf(
      EmailDeliveryError,
    );
  });
});
