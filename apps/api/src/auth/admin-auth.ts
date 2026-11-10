import type { FastifyReply, FastifyRequest } from 'fastify';
import { supabaseAdmin, supabaseAuth } from '../config/supabase.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser: {
      id: string;
      email: string | undefined;
    } | null;
  }
}

export const authenticateAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';

  if (!token) {
    reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'A valid administrator access token is required.'
    });
    return;
  }

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !authData.user) {
    reply.code(401).send({
      error: 'INVALID_TOKEN',
      message: 'The access token is invalid or expired.'
    });
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('admin_profiles')
    .select('role')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    request.log.error({ err: profileError }, 'Administrator profile lookup failed');
    reply.code(503).send({
      error: 'AUTHORIZATION_UNAVAILABLE',
      message: 'Administrator authorization is temporarily unavailable.'
    });
    return;
  }

  if (!profile || profile.role !== 'admin') {
    reply.code(403).send({
      error: 'FORBIDDEN',
      message: 'Administrator access is required.'
    });
    return;
  }

  request.adminUser = {
    id: authData.user.id,
    email: authData.user.email
  };
};
