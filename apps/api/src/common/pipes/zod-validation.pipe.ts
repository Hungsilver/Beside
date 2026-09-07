import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { AppError } from '../errors/app-error';

/**
 * Validate body/query bằng chính schema Zod dùng chung với web
 * (packages/shared) — một nguồn sự thật, không viết luật hai lần.
 *
 * Dùng:  @Body(new ZodBody(registerSchema)) dto: RegisterInput
 */
export class ZodBody<TOut> implements PipeTransform<unknown, TOut> {
  constructor(private readonly schema: ZodSchema<TOut>) {}

  transform(value: unknown): TOut {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join('.') : '_';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw AppError.validation(fieldErrors);
  }
}
