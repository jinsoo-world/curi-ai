// domains/os — 봇 공개 관문 (서버 전용). mentors.is_active=true 를 쓰는 곳은 이 파일 하나뿐이다(2차 리뷰 1001).
//
// 누가 부르나 = /os 봇 편집(team.ts), 옛 /creator 배포 토글, 옛 만들기 마지막 단계(publishMentor), 관리자 승인, 자료 넣은 뒤 다시 확인.
// 규칙
//   공개 요청 = AI 확인(moderation.reviewBot) → pass 면 「비공개였던 줄만」 조건부로 켠다 + 처음 공개만 셈
//   검사하는 칸(이름, 제목, 설명, 지시문, 인사말, 예시 질문)을 바꾸면 같은 저장에서 is_active=false 로 내리고,
//     공개 중이었거나 확인 대기 중이었으면 다시 확인한다 = 확인하는 동안 새 글이 마켓에 안 나간다
//   주인 비공개 = 내리고 os_bot_owner_unpublish 를 남긴다(열린 확인 대기도 닫힌다)
//   관리자 승인 = 열린 대기만, 그리고 검사한 내용 지문이 지금과 같을 때만 바로 공개. 다르면 AI 가 다시 본다
// 기록은 모두 app_events. 새 칸, 새 표 없음.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
    reviewBot, markPendingReview, openReviewOf, logReviewEvent, readBotForReview, contentHash, HOLD_EVENTS,
    type ModerationResult,
} from './moderation'
import { mentorName, notifyNative, p033Published, p034InReview, p035NeedsFix } from '@/domains/push'

/** 손님 시연용 봇 이름표 (공개 금지) */
const DEMO_SLUG_PREFIX = 'os-demo-'

/** AI 가 검사하는 mentors 칸. 이 중 하나라도 바뀌면 다시 확인 대상 (프로필 사진은 아직 안 본다) */
export const REVIEWED_FIELDS = ['name', 'title', 'description', 'system_prompt', 'greeting_message', 'sample_questions'] as const

/** 바뀐 것 비교용으로 다듬는다: 빈 값(null)은 빈 글, 글은 앞뒤 공백 무시, 목록은 칸마다 다듬고 빈 칸을 뺀다 */
function normalizeField(v: unknown): unknown {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v.trim()
    if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x.trim() : x)).filter(x => x !== '' && x !== null && x !== undefined)
    return v
}

/** 관리자 결정이 들어왔는데 열린 확인 대기가 없다(이미 결정됨, 주인이 내림, 새 판정이 남) = 409 */
export class ReviewNotPending extends Error {
    constructor() { super('이미 처리됐거나 확인 대기 중이 아니에요') }
}

/** 신고, 관리자 조치로 묶인 봇을 주인이 공개하려 했다 = 409 (관리자 승인, 유지로만 풀린다) */
export class BotHeld extends Error {
    constructor() { super('신고로 확인 중이라 지금은 공개할 수 없어요') }
}

/**
 * 묶여 있나 = 이 봇의 묶음/풀림 기록 중 가장 늦은 것이 묶음이면 묶임.
 * 조회가 실패하면 던진다(공개 쪽으로 실패하지 않는다).
 */
export async function isBotHeld(db: SupabaseClient, mentorId: string): Promise<boolean> {
    const { data, error } = await db.from('app_events').select('name, created_at, extra').in('name', [...HOLD_EVENTS])
        .eq('extra->>mentor_id', mentorId).order('created_at', { ascending: false }).limit(50)
    if (error) throw new Error(error.message)
    let last: { name: string; created_at: string; extra: Record<string, unknown> | null } | null = null
    for (const e of (data ?? []) as { name: string; created_at: string; extra: Record<string, unknown> | null }[]) {
        if (!last || e.created_at > last.created_at || (e.created_at === last.created_at && Number(e.extra?.seq ?? 0) > Number(last.extra?.seq ?? 0))) last = e
    }
    return last?.name === 'os_bot_admin_hold'
}

async function holdBot(db: SupabaseClient, actorUserId: string | null, mentorId: string, reason: 'reports' | 'admin'): Promise<void> {
    if (!(await logReviewEvent(db, 'os_bot_admin_hold', actorUserId, { mentor_id: mentorId, reason }))) throw new Error('묶음 기록을 남기지 못했어요')
}

/** 묶음 풀기 (관리자 승인, 유지에서만 부른다). 묶여 있었으면 true */
export async function releaseHold(db: SupabaseClient, adminUserId: string, mentorId: string): Promise<boolean> {
    if (!(await isBotHeld(db, mentorId))) return false
    await logReviewEvent(db, 'os_bot_admin_release', adminUserId, { mentor_id: mentorId })
    return true
}

/** 묶인 봇의 확인 대기를 관리자 목록에 다시 올린다 (주인이 고쳐 옛 대기가 닫혔을 때). 지문 없음 = 승인하면 AI 가 다시 본다 */
async function requeueHeld(db: SupabaseClient, actorUserId: string, mentorId: string): Promise<void> {
    await markPendingReview(db, {
        mentorId, userId: actorUserId, ownerUserId: null,
        result: { verdict: 'review', reasons: ['신고로 확인 중에 주인이 내용을 고쳤어요'], categories: [REPORT_REVIEW_CATEGORY], hash: null },
    })
}

/** 누가, 어느 봇에. creatorId 가 null 이면 주인 없는 옛 기본 봇(관리자만 닿는다) */
export interface GateActor { mentorId: string; creatorId: string | null; actorUserId: string }

/** 주인 = 크리에이터 프로필의 사람 (처음 공개 기록, 확인 대기의 주인 칸, 흉내 판정의 주인 이름) */
async function ownerOf(db: SupabaseClient, creatorId: string | null): Promise<{ userId: string | null; displayName: string }> {
    if (!creatorId) return { userId: null, displayName: '' }
    const { data } = await db.from('creator_profiles').select('user_id, display_name').eq('id', creatorId).maybeSingle()
    const row = data as { user_id?: string | null; display_name?: string | null } | null
    return { userId: row?.user_id ?? null, displayName: row?.display_name ?? '' }
}

/**
 * 조건부 공개: 비공개였던 줄만 켠다 → 바뀐 줄이 있을 때만 「처음 공개」 셈 후보 (동시에 두 번 눌러도 한 번).
 * 처음 공개 = os_bot_published 기록이 없을 때. 조회가 실패하면 안 센다. 기록(사람 = 주인)을 먼저 쓰고, 쓰기 성공 때만 수를 올린다.
 */
async function publishAtomic(db: SupabaseClient, a: { mentorId: string; creatorId: string | null; ownerUserId: string | null }): Promise<boolean> {
    let q = db.from('mentors').update({ is_active: true, status: 'active', updated_at: new Date().toISOString() }).eq('id', a.mentorId)
    if (a.creatorId) q = q.eq('creator_id', a.creatorId)
    const { data: flipped, error } = await q.eq('is_active', false).select('id')
    if (error) throw new Error(error.message)
    if (!(flipped as unknown[] | null)?.length) return false   // 이미 공개 중 = 셀 것 없음
    if (!a.creatorId) return true

    try {
        const { data: seen, error: seenErr } = await db.from('app_events').select('id').eq('name', 'os_bot_published').eq('extra->>mentor_id', a.mentorId).limit(1)
        if (seenErr) { console.error('[os/publish] 공개 기록 조회 실패, 수는 안 올린다', seenErr.message); return true }
        if ((seen as unknown[] | null)?.length) return true   // 다시 공개 = 세지 않는다
        const { error: insErr } = await db.from('app_events').insert({
            name: 'os_bot_published', tool: 'os_publish', path: null, user_id: a.ownerUserId, anon_id: null,
            extra: { mentor_id: a.mentorId, user_id: a.ownerUserId },
        })
        if (insErr) { console.error('[os/publish] 공개 기록 쓰기 실패, 수는 안 올린다', insErr.message); return true }
        await db.rpc('increment_mentor_count', { p_creator_id: a.creatorId })
    } catch (e) {
        console.error('[os/publish] 공개 셈 실패', e instanceof Error ? e.message : e)
    }
    return true
}

/** 공개 요청 = AI 확인 → pass 면 공개, review 면 확인 대기, block 이면 그대로 */
export async function requestPublish(db: SupabaseClient, a: GateActor, opts: { bypassHold?: boolean } = {}): Promise<ModerationResult> {
    // 신고, 관리자 조치로 묶인 봇은 AI 를 부르지 않고 거절한다 (관리자 승인 길만 bypassHold)
    if (!opts.bypassHold && await isBotHeld(db, a.mentorId)) throw new BotHeld()
    const owner = await ownerOf(db, a.creatorId)
    const r = await reviewBot(db, { mentorId: a.mentorId, userId: a.actorUserId, ownerName: owner.displayName })
    let published = false
    if (r.verdict === 'pass') published = await publishAtomic(db, { mentorId: a.mentorId, creatorId: a.creatorId, ownerUserId: owner.userId })
    else if (r.verdict === 'review') await markPendingReview(db, { mentorId: a.mentorId, userId: a.actorUserId, ownerUserId: owner.userId, result: r })
    // 앱 알림 ④ (주인에게). 통과 = 이번에 실제로 공개됐을 때만, 확인 대기, 고칠 곳
    if (owner.userId) {
        const u = owner.userId
        await notifyNative(db, async () => {
            const botName = await mentorName(db, a.mentorId)
            if (r.verdict === 'pass') return published ? p033Published({ userId: u, mentorId: a.mentorId, botName }) : null
            if (r.verdict === 'review') return p034InReview({ userId: u, mentorId: a.mentorId, botName })
            return p035NeedsFix({ userId: u, mentorId: a.mentorId, botName, categories: r.categories, checkKey: r.hash ?? 'block' })
        })
    }
    return { verdict: r.verdict, reasons: r.reasons, categories: r.categories }
}

/** 주인 비공개. 열린 확인 대기도 이 기록으로 닫힌다 */
export async function unpublishByOwner(db: SupabaseClient, a: GateActor): Promise<void> {
    let q = db.from('mentors').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', a.mentorId)
    if (a.creatorId) q = q.eq('creator_id', a.creatorId)
    const { error } = await q
    if (error) throw new Error(error.message)
    await logReviewEvent(db, 'os_bot_owner_unpublish', a.actorUserId, { mentor_id: a.mentorId })
}

/**
 * 봇 몸(mentors) 고치기 + 공개 의사. 주인 확인은 부르는 쪽이 먼저 한다(creatorId 로 한 번 더 묶는다).
 * wantPublic: true = 공개 요청, false = 비공개, undefined = 공개 의사 그대로.
 * 돌려주는 moderation 은 AI 확인을 했을 때만 있다.
 */
export async function applyBotEdit(
    db: SupabaseClient, a: GateActor & { fields: Record<string, unknown>; wantPublic?: boolean },
): Promise<{ moderation?: ModerationResult }> {
    let pq = db.from('mentors').select(`is_active, slug, ${REVIEWED_FIELDS.join(', ')}`).eq('id', a.mentorId)
    if (a.creatorId) pq = pq.eq('creator_id', a.creatorId)
    const { data: p, error: pErr } = await pq.maybeSingle()
    if (pErr) throw new Error(pErr.message)
    if (!p) throw new Error('봇을 못 찾았다')
    const prior = p as unknown as Record<string, unknown> & { is_active: boolean | null; slug: string | null }
    const held = await isBotHeld(db, a.mentorId)
    // 묶인 봇 공개 요청 = 아무것도 쓰기 전에 거절 (409)
    if (held && a.wantPublic === true) throw new BotHeld()

    const changed = REVIEWED_FIELDS.some(k => k in a.fields && JSON.stringify(normalizeField(a.fields[k])) !== JSON.stringify(normalizeField(prior[k])))
    const open = changed && !prior.is_active ? await openReviewOf(db, a.mentorId) : null

    // 검사하는 칸이 바뀌면 같은 저장에서 내린다 = 확인 전 새 글이 공개되지 않는다
    const write = { ...a.fields, ...(changed ? { is_active: false } : {}) }
    if (Object.keys(write).length > 0) {
        let uq = db.from('mentors').update(write).eq('id', a.mentorId)
        if (a.creatorId) uq = uq.eq('creator_id', a.creatorId)
        const { error } = await uq
        if (error) throw new Error(error.message)
    }
    // 확인 대기 중에 고쳤다 = 옛 대기는 다른 글을 본 것이니 닫는다
    if (changed && open) await logReviewEvent(db, 'os_bot_publish_closed', a.actorUserId, { mentor_id: a.mentorId, reason: 'edited' })

    // 묶인 동안 = 공개 시도 없이 글만 저장. 고쳐서 닫힌 대기는 관리자 목록에 다시 올린다. 주인 비공개도 대기를 닫지 않는다
    if (held) {
        if (changed && open) await requeueHeld(db, a.actorUserId, a.mentorId)
        return {}
    }

    if (a.wantPublic === false) {
        // 이미 비공개면 할 일 없다(옛 편집 저장은 늘 배포 칸을 보낸다). 열린 대기도 건드리지 않는다
        if (prior.is_active) await unpublishByOwner(db, a)
        return {}
    }
    if (a.wantPublic === true && (prior.slug ?? '').startsWith(DEMO_SLUG_PREFIX)) throw new Error('시연용 봇은 공개할 수 없어요')
    const shouldReview = a.wantPublic === true
        ? (!prior.is_active || changed)                 // 비공개 → 공개 요청, 또는 공개 중인데 글이 바뀜
        : (changed && (!!prior.is_active || !!open))    // 공개 의사 그대로: 공개 중이었거나 대기 중이었을 때만
    if (!shouldReview) return {}
    return { moderation: await requestPublish(db, a) }
}

/**
 * 자료를 넣은 뒤(응답 뒤 after 에서 부른다): 공개 중이면 내리고 다시 확인, 확인 대기 중이면 옛 대기를 닫고 다시 확인.
 * 둘 다 아니면 아무것도 안 한다. 실패는 던지지 않는다.
 */
export async function recheckAfterKnowledge(db: SupabaseClient, a: { mentorId: string; actorUserId: string }): Promise<void> {
    try {
        const { data } = await db.from('mentors').select('is_active, creator_id').eq('id', a.mentorId).maybeSingle()
        const m = data as { is_active: boolean | null; creator_id: string | null } | null
        if (!m) return
        if (await isBotHeld(db, a.mentorId)) return   // 묶인 봇 = 관리자만 연다
        const open = !m.is_active ? await openReviewOf(db, a.mentorId) : null
        if (!m.is_active && !open) return
        if (m.is_active) {
            const { error } = await db.from('mentors').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', a.mentorId).eq('is_active', true)
            if (error) throw new Error(error.message)
        } else {
            await logReviewEvent(db, 'os_bot_publish_closed', a.actorUserId, { mentor_id: a.mentorId, reason: 'knowledge' })
        }
        await requestPublish(db, { mentorId: a.mentorId, creatorId: m.creator_id, actorUserId: a.actorUserId })
    } catch (e) {
        console.error('[os/publish] 자료 뒤 다시 확인 실패', e instanceof Error ? e.message : e)
    }
}

/**
 * 관리자 결정 (/admin/os/bot-reviews). 열린 확인 대기만 받는다(아니면 ReviewNotPending = 409).
 *   reject  = 결정만 남긴다 (공개 안 함)
 *   approve = 검사한 내용 지문이 지금과 같으면 공개, 다르면(대기 중 바뀜) 바로 공개하지 않고 AI 가 다시 본다 → rereviewed
 */
export async function decideReview(
    db: SupabaseClient, adminUserId: string, mentorId: string, decision: 'approve' | 'reject',
): Promise<{ status: 'approved' | 'rejected' | 'rereviewed'; moderation?: ModerationResult }> {
    const open = await openReviewOf(db, mentorId)
    if (!open) throw new ReviewNotPending()
    const { data } = await db.from('mentors').select('id, creator_id, slug').eq('id', mentorId).maybeSingle()
    const m = data as { id: string; creator_id: string | null; slug: string | null } | null
    if (!m) throw new Error('봇을 못 찾았어요')

    if (decision === 'reject') {
        await logReviewEvent(db, 'os_bot_publish_decision', adminUserId, { mentor_id: mentorId, decision: 'reject' })
        // 앱 알림 P035 (관리자 거절). 거절 이유 글은 기록에 없어 분류로 쉬운 말을 만든다
        const ownerId = (await ownerOf(db, m.creator_id)).userId
        if (ownerId) {
            await notifyNative(db, async () => p035NeedsFix({
                userId: ownerId, mentorId, botName: await mentorName(db, mentorId), categories: open.categories ?? [], checkKey: `reject:${open.contentHash ?? 'none'}`,
            }))
        }
        return { status: 'rejected' }
    }
    if ((m.slug ?? '').startsWith(DEMO_SLUG_PREFIX)) throw new Error('시연용 봇은 공개할 수 없어요')

    const owner = await ownerOf(db, m.creator_id)
    const now = contentHash(await readBotForReview(db, mentorId, owner.displayName))
    if (!open.contentHash || now !== open.contentHash) {
        // 대기 뒤에 내용이 바뀌었다 = 관리자가 본 것과 다르다. 옛 대기를 닫고 AI 가 지금 내용을 다시 본다
        await logReviewEvent(db, 'os_bot_publish_decision', adminUserId, { mentor_id: mentorId, decision: 'stale' })
        const moderation = await requestPublish(db, { mentorId, creatorId: m.creator_id, actorUserId: adminUserId }, { bypassHold: true })
        if (moderation.verdict === 'pass') await releaseHold(db, adminUserId, mentorId)   // 통과해야만 묶음이 풀린다
        return { status: 'rereviewed', moderation }
    }
    await releaseHold(db, adminUserId, mentorId)
    const published = await publishAtomic(db, { mentorId, creatorId: m.creator_id, ownerUserId: owner.userId })
    await logReviewEvent(db, 'os_bot_publish_decision', adminUserId, { mentor_id: mentorId, decision: 'approve' })
    // 앱 알림 P033 (관리자 승인으로 공개)
    if (published && owner.userId) {
        const u = owner.userId
        await notifyNative(db, async () => p033Published({ userId: u, mentorId, botName: await mentorName(db, mentorId) }))
    }
    return { status: 'approved' }
}

/** 신고로 자동으로 내렸을 때 확인 대기에 남는 분류 (관리자 목록이 이걸로 「신고로 내림」을 안다) */
export const REPORT_REVIEW_CATEGORY = 'user_reports'

/**
 * 신고가 쌓여 자동으로 내린다(reports.ts 가 부른다). 공개 중인 줄만 내리고, 내렸을 때만 확인 대기를 연다.
 * 지우지 않는다. 관리자가 /admin/os/bot-reviews 에서 승인하면 다시 공개된다.
 * 돌려주는 값 = 이번에 실제로 내렸나 (이미 비공개면 false)
 */
export async function unpublishForReports(db: SupabaseClient, mentorId: string, reporterCount: number): Promise<boolean> {
    const { data: flipped, error } = await db.from('mentors')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', mentorId).eq('is_active', true).select('id')
    if (error) throw new Error(error.message)
    if (!(flipped as unknown[] | null)?.length) return false
    const { data: m } = await db.from('mentors').select('creator_id').eq('id', mentorId).maybeSingle()
    const owner = await ownerOf(db, (m as { creator_id?: string | null } | null)?.creator_id ?? null)
    let hash: string | null = null
    try { hash = contentHash(await readBotForReview(db, mentorId, owner.displayName)) } catch { hash = null }
    await holdBot(db, null, mentorId, 'reports')
    await markPendingReview(db, {
        mentorId, userId: null, ownerUserId: owner.userId,
        result: { verdict: 'review', reasons: [`로그인한 회원 ${reporterCount}명이 7일 안에 신고해 자동으로 내렸어요`], categories: [REPORT_REVIEW_CATEGORY], hash },
    })
    return true
}

/**
 * 관리자가 신고를 보고 내린다 + 묶는다(주인이 다시 공개 못 함). 열린 확인 대기도 이 기록으로 닫힌다.
 * 풀기 = releaseHold (관리자 신고 화면의 「유지」)
 */
export async function unpublishByAdmin(db: SupabaseClient, adminUserId: string, mentorId: string): Promise<void> {
    const { error } = await db.from('mentors').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', mentorId)
    if (error) throw new Error(error.message)
    await holdBot(db, adminUserId, mentorId, 'admin')
    await logReviewEvent(db, 'os_bot_admin_unpublish', adminUserId, { mentor_id: mentorId })
}
