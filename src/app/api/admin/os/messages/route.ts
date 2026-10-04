// GET  /api/admin/os/messages?days=1..30 → 유형 장부(켬/끔) + 보냄·막힘 기록(유형별·이유별 집계 + 최근 200줄)
// POST /api/admin/os/messages { type, enabled } → 유형 켜기/끄기 (message_types 에 한 줄, 누가 바꿨는지 남긴다)
// 🔒 관리자만 (requireAdminAPI). 받는 곳은 끝 4자만, 본문은 없다.
// 기록은 message_log_unified 보기(view) 하나로 읽는다 = message_log + 앱 푸시 기기별 줄(push_sends)을 묶음 번호로 이은 것.
import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { MESSAGE_TYPES, effectiveOn, getTypeDef } from '@/domains/messaging/registry'

export const dynamic = 'force-dynamic'

type LogRow = {
    id: string; created_at: string; user_id: string; channel: string; route: string | null; msg_type: string | null; category: string | null
    campaign_key: string | null; status: string; reason: string | null; to_hint: string | null; is_test: boolean | null
    devices_sent: number | null; opened_at: string | null
}

export async function GET(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const db = createAdminClient()
    const days = Math.min(30, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 1))
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    const sw = await db.from('message_types').select('type, enabled, updated_at, updated_by')
    const overrides = new Map<string, { enabled: boolean; updated_at: string; updated_by: string | null }>()
    for (const r of (sw.data ?? []) as { type: string; enabled: boolean; updated_at: string; updated_by: string | null }[]) overrides.set(r.type, r)

    // 집계는 지난 N일 최대 5,000줄로 센다(넘으면 truncated=true)
    const logs = await db.from('message_log_unified')
        .select('id, created_at, user_id, channel, route, msg_type, category, campaign_key, status, reason, to_hint, is_test, devices_sent, opened_at')
        .gte('created_at', since).order('created_at', { ascending: false }).limit(5000)
    const rows = (logs.data ?? []) as LogRow[]
    const byType: Record<string, { sent: number; blocked: number; failed: number; reasons: Record<string, number> }> = {}
    for (const r of rows) {
        const k = r.msg_type ?? '(옛 기록)'
        const b = byType[k] ??= { sent: 0, blocked: 0, failed: 0, reasons: {} }
        if (r.status === 'sent' || r.status === 'blocked' || r.status === 'failed') b[r.status]++
        if (r.status !== 'sent') { const why = (r.reason ?? '?').split(':')[0].slice(0, 40); b.reasons[why] = (b.reasons[why] ?? 0) + 1 }
    }

    return NextResponse.json({
        generatedAt: new Date().toISOString(),
        days,
        missing: [sw.error ? 'message_types' : null, logs.error ? 'message_log_unified' : null].filter(Boolean),
        types: MESSAGE_TYPES.map(t => {
            const o = overrides.get(t.type)
            return { ...t, on: effectiveOn(t, o?.enabled ?? null), override: o ?? null }
        }),
        byType,
        truncated: rows.length >= 5000,
        recent: rows.slice(0, 200).map(r => ({ ...r, user_id: r.user_id.slice(0, 8) })),
    })
}

export async function POST(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error ?? 'Forbidden' }, { status: auth.status || 403 })
    const b = await req.json().catch(() => ({})) as { type?: unknown; enabled?: unknown }
    const def = getTypeDef(typeof b.type === 'string' ? b.type : null)
    if (!def || typeof b.enabled !== 'boolean') return NextResponse.json({ error: 'type(장부에 있는 것), enabled(true/false) 가 필요해요' }, { status: 400 })
    if (!def.toggleable) return NextResponse.json({ error: '이 유형은 끌 수 없어요(끄면 가입이 막혀요)' }, { status: 400 })
    const { error } = await createAdminClient().from('message_types').upsert(
        { type: def.type, enabled: b.enabled, updated_at: new Date().toISOString(), updated_by: auth.user.id },
        { onConflict: 'type' },
    )
    if (error) {
        console.error('[admin/os/messages POST]', error.message)
        return NextResponse.json({ error: '바꾸지 못했어요' }, { status: 500 })
    }
    console.log(`[admin/os/messages] ${def.type} → ${b.enabled ? '켬' : '끔'} by ${auth.user.id.slice(0, 8)}`)
    return NextResponse.json({ ok: true, type: def.type, on: b.enabled })
}
