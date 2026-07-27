import 'server-only';

import type { User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase-admin';

export type UserRole = 'admin' | 'user';

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new AuthError('Falta el token de autenticación.', 401);
  }

  return match[1];
}

export async function requireUser(request: Request): Promise<{
  user: User;
  profile: Profile;
  token: string;
}> {
  const token = readBearerToken(request);
  const supabase = getSupabaseAdmin();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    throw new AuthError('Token inválido o expirado.', 401);
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,name,role,active,created_at')
    .eq('id', userData.user.id)
    .maybeSingle();

  const profile = profileData as Profile | null;

  if (profileError) {
    throw new AuthError('No fue posible validar el perfil.', 500);
  }

  if (!profile) {
    throw new AuthError('El usuario no existe en profiles.', 403);
  }

  if (profile.active !== true) {
    throw new AuthError('La cuenta está desactivada.', 403);
  }

  return { user: userData.user, profile, token };
}

export async function requireAdmin(request: Request) {
  const session = await requireUser(request);

  if (session.profile.role !== 'admin') {
    throw new AuthError('Se requieren permisos de administrador.', 403);
  }

  return session;
}
