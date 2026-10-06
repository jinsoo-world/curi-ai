// GET  /api/admin/os/campaigns → 캠페인 최근 50개 + 사람별 결과 수
// POST /api/admin/os/campaigns { action, ... }
//   create   { key, msgType, route, title, body, deeplink?, audience }  → 초안
//   edit     { id, ...초안 칸 }                                          → 고치면 초안으로 돌아간다(시험·승인 지워짐)
//   test     { id }            → 누른 승인권자 본인 기기·메일로만 1통(관문을 지난다. 광고 규칙·동의는 못 건너뛴다)
//   approve  { id }            → 대표 승인(3시간 동안만 산다)
//   schedule { id, sendAt }    → 예약 = 표 한 줄. 30명 넘으면 살아 있는 승인 필수, 보낼 시각도 승인 3시간 안
//   run_now  { id }            → 예약된 캠페인을 지금 보낸다(예약 작업과 같은 보내기)
//   cancel   { id }
// 🔒 관리자만. 시험·승인·지금 보내기는 승인권자(MSG_CAMPAIGN_APPROVERS, 기본 jin@mission-driven.kr)만.
// 멈춤 스위치 MSG_CAMPAIGNS_ENABLED=0/false/off 면 시험·예약·보내기가 멈춘다.
import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchWith } from '@/domains/messaging'
import { campaignsEnabled, decide, isApprover, runDueCampaigns, validateDraft, type CampaignAction } from '@/domains/messaging/campaign'
import {
    CAMPAIGN_COLUMNS, campaignDispatchInput, countAudience, createSupabaseCampaignStore, getCampaign, liveCampaignSender, rowToCampaign, updateCampaignIf,
} from '@/domains/messaging/campaign-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET() {
    const auth = await requireAdminAPI()
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const db = createAdminClient({ longRunning: true })
    const { data, error } = await db.from('message_campaigns').select(`${CAMPAIGN_COLUMNS}, created_at, sent_at, last_error`)
        .order('created_at', { ascending: false }).limit(50)
    if (error) return NextResponse.json({ campaigns: [], missing: true, enabled: campaignsEnabled() })
    const ids = (data ?? []).map((r: { id: string }) => r.id)
    const counts: Record<string, Record<string, number>> = {}
    if (ids.length) {
        const { data: sends } = await db.from('message_campaign_sends').select('campaign_id, status').in('campaign_id', ids).limit(20000)
        for (const s of (sends ?? []) as { campaign_id: string; status: string }[]) {
            const c = counts[s.campaign_id] ??= {}
            c[s.status] = (c[s.status] ?? 0) + 1
        }
    }
    return NextResponse.json({
        enabled: campaignsEnabled(),
        canApprove: isApprover(auth.user?.email),
        campaigns: (data ?? []).map((r: Record<string, unknown>) => ({
            ...rowToCampaign(r as never), createdAt: r.created_at, sentAt: r.sent_at, lastError: r.last_error, results: counts[r.id as string] ?? {},
        })),
    })
}

export async function POST(req: Request) {
    const auth = await requireAdminAPI()
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error ?? 'Forbidden' }, { status: auth.status || 403 })
    const user = auth.user
    const db = createAdminClient({ longRunning: true })
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = String(b.action ?? '')
    const now = new Date()

    try {
        if (action === 'create') {
            const v = validateDraft(b as never)
            if (!v.ok) return bad(v.error)
            const { data, error } = await db.from('message_campaigns').insert({
                key: v.value.key, msg_type: v.value.msgType, route: v.value.route, title: v.value.title, body: v.value.body,
                deeplink: v.value.deeplink, audience: v.value.audience, status: 'draft', created_by: user.id,
            }).select('id').single()
            if (error) return bad(error.code === '23505' ? '같은 캠페인 열쇠가 이미 있어요' : '만들지 못했어요', error.code === '23505' ? 409 : 500)
            return NextResponse.json({ ok: true, id: (data as { id: string }).id })
        }

        const id = typeof b.id === 'string' && UUID_RE.test(b.id) ? b.id : null
        if (!id) return bad('id 가 필요해요')
        const c = await getCampaign(db, id)
        if (!c) return bad('그 캠페인을 찾지 못했어요', 404)
        const approver = isApprover(user.email)

        const apply = async (a: CampaignAction, extra: Record<string, unknown> = {}) => {
            const d = decide(c, a, now)
            if (!d.ok) return bad(d.error, 409)
            const changed = await updateCampaignIf(db, id, c.status, { ...d.patch, ...extra })
            if (!changed) return bad('다른 곳에서 먼저 바뀌었어요. 새로 고침 해 주세요', 409)
            return NextResponse.json({ ok: true, status: d.patch.status ?? c.status })
        }

        switch (action) {
            case 'edit': {
                const v = validateDraft({ ...b, key: c.key } as never)
                if (!v.ok) return bad(v.error)
                const { msgType, route, title, body, deeplink, audience } = v.value
                return apply({ action: 'edit' }, { msgType, route, title, body, deeplink, audience })
            }
            case 'test': {
                if (!approver) return bad('시험은 승인권자 본인 기기로만 보내요', 403)
                const d = decide(c, { action: 'test_sent' }, now)
                if (!d.ok) return bad(d.error, 409)
                const outcome = await dispatchWith(db, campaignDispatchInput(c, { userId: user.id, email: user.email ?? null }, true))
                if (outcome.status !== 'sent') {
                    return NextResponse.json({ ok: false, error: `시험이 나가지 않았어요: ${outcome.message}`, outcome }, { status: 409 })
                }
                const changed = await updateCampaignIf(db, id, c.status, d.patch)
                return NextResponse.json({ ok: changed, status: d.patch.status, outcome })
            }
            case 'approve':
                if (!approver) return bad('승인은 승인권자만 눌러요', 403)
                return apply({ action: 'approve', by: user.id })
            case 'schedule': {
                const sendAt = new Date(typeof b.sendAt === 'string' ? b.sendAt : NaN)
                const recipientCount = await countAudience(db, c)
                return apply({ action: 'schedule', sendAt, recipientCount })
            }
            case 'cancel':
                return apply({ action: 'cancel' })
            case 'run_now': {
                if (!approver) return bad('지금 보내기는 승인권자만 눌러요', 403)
                if (c.status !== 'scheduled' && c.status !== 'sending') return bad('예약된 캠페인만 보낼 수 있어요', 409)
                if (c.status === 'scheduled' && c.sendAt && new Date(c.sendAt) > now) {
                    // 예약 시각을 지금으로 당긴다(늦추는 것은 안 된다 = 승인 3시간 판정이 그대로)
                    await updateCampaignIf(db, id, 'scheduled', { sendAt: now.toISOString() })
                }
                const result = await runDueCampaigns({
                    store: createSupabaseCampaignStore(db), send: liveCampaignSender(db), onlyId: id, deadline: Date.now() + 240_000,
                })
                return NextResponse.json({ ok: true, result })
            }
            default:
                return bad('action 이 틀려요')
        }
    } catch (e) {
        console.error('[admin/os/campaigns]', e instanceof Error ? e.message : e)
        return bad('처리하지 못했어요', 500)
    }
}
