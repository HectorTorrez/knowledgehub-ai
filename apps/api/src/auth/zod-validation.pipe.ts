import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates a handler argument against a Zod schema, returning the parsed and
 * typed value. Rejections become `400 Bad Request` with a per-field message
 * list, matching Nest's built-in validation error shape.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const messages = result.error.issues.map((issue) =>
        issue.path.length > 0
          ? `${issue.path.join('.')}: ${issue.message}`
          : issue.message,
      );
      throw new BadRequestException(messages);
    }

    return result.data;
  }
}
