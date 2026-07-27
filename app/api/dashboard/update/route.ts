import { NextResponse } from 'next/server';
import { writeAudit } from '@/lib/audit';
import { callAppsScript } from '@/lib/apps-script';
import { AuthError, requireUser } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type UpdateBody = {
  dashboardId?: string;
  range?: string;
  values?: unknown[];
};

export async function POST(request: Request) {
  try {
    const { profile } = await requireUser(request);
    const body = (await request.json()) as UpdateBody;
    const dashboardId = body.dashboardId?.trim();
    const range = body.range?.trim();

    if (!dashboardId || !range || !Array.isArray(body.values)) {
      return NextResponse.json(
        { error: 'dashboardId, range y values son obligatorios.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: dashboard, error: dashboardError } = await supabase
      .from('dashboards')
      .select('id,active')
      .eq('id', dashboardId)
      .maybeSingle();

    if (dashboardError) throw new Error(dashboardError.message);
    if (!dashboard || dashboard.active !== true) {
      return NextResponse.json({ error: 'Dashboard no disponible.' }, { status: 404 });
    }

    let canWrite = profile.role === 'admin';

    if (!canWrite) {
      const { data: access, error: accessError } = await supabase
        .from('dashboard_access')
        .select('permission')
        .eq('user_id', profile.id)
        .eq('dashboard_id', dashboardId)
        .maybeSingle();

      if (accessError) throw new Error(accessError.message);
      canWrite = access?.permission === 'write';
    }

    if (!canWrite) {
      await writeAudit({
        actorId: profile.id,
        actorEmail: profile.email,
        action: 'DASHBOARD_ACCESS_DENIED',
        dashboardId,
        details: { reason: 'write_permission_required', range },
      });
      return NextResponse.json({ error: 'No tienes permisos de edición.' }, { status: 403 });
    }

    const appsScript = await callAppsScript({
      action: 'updateDashboard',
      dashboardId,
      range,
      values: body.values,
    });

    await writeAudit({
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'DASHBOARD_UPDATE',
      dashboardId,
      details: {
        range,
        oldValues: appsScript.oldValues ?? null,
        newValues: body.values,
      },
    });

    return NextResponse.json({ ok: true, data: appsScript.data ?? null });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
