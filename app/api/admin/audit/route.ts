import { NextResponse } from 'next/server';
import { AuthError, requireAdmin } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
      : 100;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('audit_log')
      .select('id,actor_id,actor_email,action,dashboard_id,details,created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
