import { NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

type DashboardRecord = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
};

type AccessRecord = {
  dashboard_id: string;
  permission: 'read' | 'write';
};

export async function GET(request: Request) {
  try {
    const { profile } = await requireUser(request);
    const supabase = getSupabaseAdmin();

    const { data: dashboards, error: dashboardsError } = await supabase
      .from('dashboards')
      .select('id,name,description,active,created_at')
      .eq('active', true)
      .order('name');

    if (dashboardsError) {
      throw new Error(dashboardsError.message);
    }

    const dashboardRows = (dashboards ?? []) as DashboardRecord[];

    if (profile.role === 'admin') {
      return NextResponse.json({
        profile,
        dashboards: dashboardRows.map((dashboard) => ({
          ...dashboard,
          permission: 'write' as const,
        })),
      });
    }

    const { data: access, error: accessError } = await supabase
      .from('dashboard_access')
      .select('dashboard_id,permission')
      .eq('user_id', profile.id);

    if (accessError) {
      throw new Error(accessError.message);
    }

    const accessRows = (access ?? []) as AccessRecord[];
    const permissionByDashboard = new Map<string, 'read' | 'write'>(
      accessRows.map((item) => [item.dashboard_id, item.permission]),
    );

    const authorizedDashboards = dashboardRows
      .filter((dashboard) => permissionByDashboard.has(dashboard.id))
      .map((dashboard) => ({
        ...dashboard,
        permission: permissionByDashboard.get(dashboard.id)!,
      }));

    return NextResponse.json({ profile, dashboards: authorizedDashboards });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
