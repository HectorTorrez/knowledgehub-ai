import type { EmailLocale, OrganizationRole } from '@knowledgehub/shared-types';
import type { EmailMessage } from './email-sender.port.js';

const PRODUCT_NAME = 'KnowledgeHub';

export interface WelcomeEmailInput {
  to: string;
  firstName: string;
  verifyUrl: string;
  expiresInHours: number;
  locale: EmailLocale;
}

export type VerificationEmailInput = WelcomeEmailInput;

export interface InvitationEmailInput {
  to: string;
  inviterName: string;
  organizationName: string;
  role: OrganizationRole;
  acceptUrl: string;
  expiresInDays: number;
  locale: EmailLocale;
}

const ROLE_NAMES: Record<EmailLocale, Record<OrganizationRole, string>> = {
  en: { OWNER: 'owner', ADMIN: 'admin', MEMBER: 'member', VIEWER: 'viewer' },
  es: {
    OWNER: 'propietario',
    ADMIN: 'administrador',
    MEMBER: 'miembro',
    VIEWER: 'lector',
  },
};

interface EmailCopy {
  subject: string;
  heading: string;
  paragraphs: string[];
  action: string;
  url: string;
  footnote: string;
}

export function welcomeEmail(input: WelcomeEmailInput): EmailMessage {
  const copy: EmailCopy =
    input.locale === 'es'
      ? {
          subject: `Te damos la bienvenida a ${PRODUCT_NAME}: confirma tu email`,
          heading: `Hola ${input.firstName}, ya tienes tu cuenta en ${PRODUCT_NAME}`,
          paragraphs: [
            'Tu cuenta está lista. Sube tus documentos y haz preguntas sobre ellos con respuestas que citan sus fuentes.',
            'Confirma tu dirección de email para poder unirte a organizaciones cuando te inviten.',
          ],
          action: 'Confirmar email',
          url: input.verifyUrl,
          footnote: `El enlace caduca en ${input.expiresInHours} horas. Si no creaste esta cuenta, ignora este mensaje.`,
        }
      : {
          subject: `Welcome to ${PRODUCT_NAME}: confirm your email`,
          heading: `Hi ${input.firstName}, welcome to ${PRODUCT_NAME}`,
          paragraphs: [
            'Your account is ready. Upload your documents and ask questions about them, with answers that cite their sources.',
            'Confirm your email address so you can join organizations when you are invited.',
          ],
          action: 'Confirm email',
          url: input.verifyUrl,
          footnote: `The link expires in ${input.expiresInHours} hours. If you did not create this account, you can ignore this message.`,
        };

  return render(input.to, copy);
}

export function verificationEmail(input: VerificationEmailInput): EmailMessage {
  const copy: EmailCopy =
    input.locale === 'es'
      ? {
          subject: `Confirma tu email en ${PRODUCT_NAME}`,
          heading: `Hola ${input.firstName}, confirma tu email`,
          paragraphs: [
            'Usa el botón de abajo para confirmar tu dirección de email.',
          ],
          action: 'Confirmar email',
          url: input.verifyUrl,
          footnote: `El enlace caduca en ${input.expiresInHours} horas y sustituye a los anteriores. Si no lo pediste, ignora este mensaje.`,
        }
      : {
          subject: `Confirm your ${PRODUCT_NAME} email`,
          heading: `Hi ${input.firstName}, confirm your email`,
          paragraphs: ['Use the button below to confirm your email address.'],
          action: 'Confirm email',
          url: input.verifyUrl,
          footnote: `The link expires in ${input.expiresInHours} hours and replaces any earlier one. If you did not ask for it, you can ignore this message.`,
        };

  return render(input.to, copy);
}

export function invitationEmail(input: InvitationEmailInput): EmailMessage {
  const role = ROLE_NAMES[input.locale][input.role];
  const copy: EmailCopy =
    input.locale === 'es'
      ? {
          subject: `${input.inviterName} te invitó a ${input.organizationName} en ${PRODUCT_NAME}`,
          heading: `Te invitaron a ${input.organizationName}`,
          paragraphs: [
            `${input.inviterName} te invitó a unirte a ${input.organizationName} en ${PRODUCT_NAME} como ${role}.`,
            `Inicia sesión o crea una cuenta con ${input.to} para aceptar la invitación.`,
          ],
          action: 'Aceptar invitación',
          url: input.acceptUrl,
          footnote: `La invitación caduca en ${input.expiresInDays} días. Si no la esperabas, ignora este mensaje.`,
        }
      : {
          subject: `${input.inviterName} invited you to ${input.organizationName} on ${PRODUCT_NAME}`,
          heading: `You're invited to ${input.organizationName}`,
          paragraphs: [
            `${input.inviterName} invited you to join ${input.organizationName} on ${PRODUCT_NAME} as ${role}.`,
            `Sign in or create an account with ${input.to} to accept the invitation.`,
          ],
          action: 'Accept invitation',
          url: input.acceptUrl,
          footnote: `The invitation expires in ${input.expiresInDays} days. If you were not expecting it, you can ignore this message.`,
        };

  return render(input.to, copy);
}

function render(to: string, copy: EmailCopy): EmailMessage {
  const url = escapeHtml(copy.url);
  const paragraphs = copy.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(paragraph)}</p>`,
    )
    .join('');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
      <tr>
        <td style="padding:32px">
          <p style="margin:0 0 24px;font-size:14px;font-weight:600;color:#0f172a">${PRODUCT_NAME}</p>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.4;color:#0f172a">${escapeHtml(copy.heading)}</h1>
          ${paragraphs}
          <p style="margin:24px 0">
            <a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0f172a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(copy.action)}</a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b">${escapeHtml(copy.footnote)}</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all">${url}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    copy.heading,
    '',
    ...copy.paragraphs,
    '',
    `${copy.action}: ${copy.url}`,
    '',
    copy.footnote,
  ].join('\n');

  return { to, subject: copy.subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
