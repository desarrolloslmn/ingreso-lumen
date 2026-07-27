import 'server-only';

import { getSupabaseAdmin } from './supabase-admin';

type AuditInput = {
  actorId: string;
  actorEmail: string;
  action: string;
  dashboardId?: string | null;
  details?: Record<string, unknown>;
};

export async function writeAudit(input: AuditInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('audit_log').insert({
    actor_id: input.actorId,
    actor_email: input.actorEmail,
    action: input.action,
    dashboard_id: input.dashboardId ?? null,
    details: input.details ?? {},
  });

  if (error) {
    console.error('No fue posible registrar auditoría:', error.message);
  }
}
