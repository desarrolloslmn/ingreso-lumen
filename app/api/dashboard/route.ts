import { NextResponse } from 'next/server';
import { writeAudit } from '@/lib/audit';
import { callAppsScript } from '@/lib/apps-script';
import { AuthError, requireUser } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let dashboardId: string | null = null;

  try {
    const { profile } = await requireUser(request);
    const url = new URL(request.url);
    dashboardId = url.searchParams.get('dashboardId');

    if (!dashboardId) {
      return NextResponse.json({ error: 'dashboardId es obligatorio.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: dashboard, error: dashboardError } = await supabase
      .from('dashboards')
      .select('id,name,description,active')
      .eq('id', dashboardId)
      .maybeSingle();

    if (dashboardError) throw new Error(dashboardError.message);

    if (!dashboard || dashboard.active !== true) {
      await writeAudit({
        actorId: profile.id,
        actorEmail: profile.email,
        action: 'DASHBOARD_ACCESS_DENIED',
        dashboardId,
        details: { reason: 'dashboard_not_found_or_inactive' },
      });
      return NextResponse.json({ error: 'Dashboard no disponible.' }, { status: 404 });
    }

    let permission: 'read' | 'write' | null = profile.role === 'admin' ? 'write' : null;

    if (profile.role !== 'admin') {
      const { data: access, error: accessError } = await supabase
        .from('dashboard_access')
        .select('permission')
        .eq('user_id', profile.id)
        .eq('dashboard_id', dashboardId)
        .maybeSingle();

      if (accessError) throw new Error(accessError.message);
      permission = (access?.permission as 'read' | 'write' | undefined) ?? null;
    }

    if (!permission) {
      await writeAudit({
        actorId: profile.id,
        actorEmail: profile.email,
        action: 'DASHBOARD_ACCESS_DENIED',
        dashboardId,
        details: { reason: 'missing_permission' },
      });
      return NextResponse.json({ error: 'No tienes acceso a este dashboard.' }, { status: 403 });
    }

    const appsScript = await callAppsScript({
      action: 'getDashboard',
      dashboardId,
    });

    await writeAudit({
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'DASHBOARD_VIEW',
      dashboardId,
      details: { permission },
    });

    return NextResponse.json({
      dashboard,
      permission,
      data: appsScript.data ?? null,
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
