import { NextResponse } from 'next/server';
import { writeAudit } from '@/lib/audit';
import { AuthError, requireAdmin } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const supabase = getSupabaseAdmin();

    const [{ data: users, error: usersError }, { data: dashboards, error: dashboardsError }, { data: access, error: accessError }] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('id,email,name,role,active,created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('dashboards')
          .select('id,name,description,active,created_at')
          .order('name'),
        supabase
          .from('dashboard_access')
          .select('user_id,dashboard_id,permission,created_at'),
      ]);

    if (usersError) throw new Error(usersError.message);
    if (dashboardsError) throw new Error(dashboardsError.message);
    if (accessError) throw new Error(accessError.message);

    return NextResponse.json({ users: users ?? [], dashboards: dashboards ?? [], access: access ?? [] });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}

type PatchBody = {
  userId?: string;
  active?: boolean;
};

export async function PATCH(request: Request) {
  try {
    const { profile: admin } = await requireAdmin(request);
    const body = (await request.json()) as PatchBody;

    if (!body.userId || typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'userId y active son obligatorios.' }, { status: 400 });
    }

    if (body.userId === admin.id && body.active === false) {
      return NextResponse.json(
        { error: 'No puedes desactivar accidentalmente tu propia cuenta.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('id,email,active')
      .eq('id', body.userId)
      .maybeSingle();

    if (targetError) throw new Error(targetError.message);
    if (!target) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });

    if (target.active === body.active) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ active: body.active })
      .eq('id', body.userId);

    if (updateError) throw new Error(updateError.message);

    await writeAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: body.active ? 'USER_ENABLED' : 'USER_DISABLED',
      details: {
        userId: target.id,
        userEmail: target.email,
        previousActive: target.active,
        active: body.active,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
