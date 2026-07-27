import { NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/server-auth';
import { writeAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { profile } = await requireUser(request);

    await writeAudit({
      actorId: profile.id,
      actorEmail: profile.email,
      action: 'LOGIN',
      details: {
        userAgent: request.headers.get('user-agent') ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Error interno.';
    return NextResponse.json({ error: message }, { status });
  }
}
