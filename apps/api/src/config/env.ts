import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(10000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  PUBLIC_API_URL: z.string().url(),
  ADMIN_APP_URL: z.string().url(),
  PLAYER_APP_URL: z.string().url()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid API environment configuration: ${details}`);
}

export const env = Object.freeze({
  ...parsed.data,
  corsAllowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
});

if (env.corsAllowedOrigins.length === 0) {
  throw new Error('CORS_ALLOWED_ORIGINS must contain at least one origin.');
}
