import { NextResponse } from 'next/server';
import { writeAudit } from '@/lib/audit';
import { AuthError, requireAdmin } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type PermissionBody = {
  userId?: string;
  dashboardId?: string;
  permission?: 'read' | 'write' | null;
};

export async function PATCH(request: Request) {
  try {
    const { profile: admin } = await requireAdmin(request);
    const body = (await request.json()) as PermissionBody;

    if (
      !body.userId ||
      !body.dashboardId ||
      !Object.prototype.hasOwnProperty.call(body, 'permission') ||
      !['read', 'write', null].includes(body.permission ?? null)
    ) {
      return NextResponse.json(
        { error: 'userId, dashboardId y permission válida son obligatorios.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const [{ data: targetUser, error: userError }, { data: dashboard, error: dashboardError }, { data: existing, error: existingError }] =
      await Promise.all([
        supabase.from('profiles').select('id,email').eq('id', body.userId).maybeSingle(),
        supabase.from('dashboards').select('id,name,active').eq('id', body.dashboardId).maybeSingle(),
        supabase
          .from('dashboard_access')
          .select('permission')
          .eq('user_id', body.userId)
          .eq('dashboard_id', body.dashboardId)
          .maybeSingle(),
      ]);

    if (userError) throw new Error(userError.message);
    if (dashboardError) throw new Error(dashboardError.message);
    if (existingError) throw new Error(existingError.message);
    if (!targetUser) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
    if (!dashboard || dashboard.active !== true) {
      return NextResponse.json({ error: 'Dashboard no encontrado o inactivo.' }, { status: 404 });
    }

    const previousPermission = (existing?.permission as 'read' | 'write' | undefined) ?? null;
    const nextPermission = body.permission ?? null;

    if (nextPermission === null) {
      const { error } = await supabase
        .from('dashboard_access')
        .delete()
        .eq('user_id', body.userId)
        .eq('dashboard_id', body.dashboardId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('dashboard_access').upsert(
        {
          user_id: body.userId,
          dashboard_id: body.dashboardId,
          permission: nextPermission,
        },
        { onConflict: 'user_id,dashboard_id' },
      );
      if (error) throw new Error(error.message);
    }

    if (previousPermission !== nextPermission) {
      await writeAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: 'PERMISSION_CHANGED',
        dashboardId: body.dashboardId,
        details: {
          userId: targetUser.id,
          userEmail: targetUser.email,
          previousPermission,
          permission: nextPermission,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
