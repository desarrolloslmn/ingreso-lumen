import { NextResponse } from 'next/server';
import { writeAudit } from '@/lib/audit';
import { AuthError, requireAdmin } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type Permission = 'none' | 'read' | 'write';

type InviteBody = {
  name?: string;
  email?: string;
  permissions?: Record<string, Permission>;
};

export async function POST(request: Request) {
  try {
    const { profile: admin } = await requireAdmin(request);
    const body = (await request.json()) as InviteBody;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!name || !email) {
      return NextResponse.json({ error: 'Nombre y correo son obligatorios.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const origin = new URL(request.url).origin;

    const { data: invitation, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: `${origin}/set-password`,
    });

    if (inviteError || !invitation.user) {
      return NextResponse.json(
        { error: inviteError?.message || 'No fue posible crear la invitación.' },
        { status: 400 },
      );
    }

    const userId = invitation.user.id;

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          email,
          name,
          role: 'user',
          active: true,
        },
        { onConflict: 'id' },
      );

    if (profileError) throw new Error(profileError.message);

    const permissionEntries = Object.entries(body.permissions ?? {}).filter(
      ([, permission]) => permission === 'read' || permission === 'write',
    );

    if (permissionEntries.length > 0) {
      const dashboardIds = permissionEntries.map(([dashboardId]) => dashboardId);
      const { data: validDashboards, error: dashboardError } = await supabase
        .from('dashboards')
        .select('id')
        .in('id', dashboardIds)
        .eq('active', true);

      if (dashboardError) throw new Error(dashboardError.message);

      const validIds = new Set(((validDashboards ?? []) as Array<{ id: string }>).map((dashboard) => dashboard.id));
      const rows = permissionEntries
        .filter(([dashboardId]) => validIds.has(dashboardId))
        .map(([dashboardId, permission]) => ({
          user_id: userId,
          dashboard_id: dashboardId,
          permission,
        }));

      if (rows.length > 0) {
        const { error: accessError } = await supabase
          .from('dashboard_access')
          .upsert(rows, { onConflict: 'user_id,dashboard_id' });

        if (accessError) throw new Error(accessError.message);
      }
    }

    await writeAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'USER_INVITED',
      details: {
        userId,
        email,
        name,
        permissions: body.permissions ?? {},
      },
    });

    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
