// 회원 탈퇴 — App Store 5.1.1(v) 앱 안 계정 삭제 (2026-10-01).
//
// 정책 (개인정보처리방침 제3조: 탈퇴 시 지체 없이 파기, 단 전자상거래법 5년 보관은 예외):
//  - 개인 콘텐츠(내가 만든 봇·자료·대화·단체방·연동·알림·프로필)는 지운다.
//  - 결제·크레딧·구독 기록(credit_transactions, payments, subscriptions)은 지우지 않고
//    user_id 를 비워 「누구인지」만 끊는다(deleted_user_ref = 되돌릴 수 없는 표식). 20261010 마이그레이션 필요.
//  - 결제가 계속 나가는 구독(active, past_due)이 있으면 막고 먼저 해지하라고 안내한다.
//    (자동 해지는 안 한다: 환불·기간 안내는 사람이 확인하고 해지하는 게 안전하다.)
//  - 순서: 활성 구독 확인 → 결제기록 분리(실패하면 여기서 중단) → 저장소 파일 → 하위 표 → 봇 → 크리에이터 프로필 → 로그인 계정.
//    다시 불러도 안전하다(지울 것이 없으면 그냥 지나간다).
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revokeAppleTokens, type RevokeResult } from './apple-revoke'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export const CONFIRM_WORD = '탈퇴'

export interface DeleteUser {
    id: string
    email?: string | null
    provider?: string | null
}

export type DeleteResult =
    | { ok: true }
    | { ok: false; code: 'ACTIVE_SUBSCRIPTION'; message: string }

export function isConfirmed(body: unknown): boolean {
    const c = (body as { confirm?: unknown } | null)?.confirm
    return typeof c === 'string' && c.trim() === CONFIRM_WORD
}

export function parseDeleteBody(body: unknown): { confirmed: boolean; appleAuthorizationCode: string | undefined } {
    const code = (body as { appleAuthorizationCode?: unknown } | null)?.appleAuthorizationCode
    return { confirmed: isConfirmed(body), appleAuthorizationCode: typeof code === 'string' && code ? code : undefined }
}

/** 보관하는 결제기록에 남기는 표식. 원래 id 로 되돌릴 수 없다 */
export function anonymousRef(userId: string): string {
    return createHash('sha256').update(`curi-ai-account:${userId}`).digest('hex').slice(0, 32)
}

export interface StorageTarget { bucket: string; folder: string; namePrefix?: string }

/** 지울 저장소 위치: 내 폴더들 + 내가 만든 봇의 학습자료 폴더 */
export function storagePlan(userId: string, ownedMentorIds: string[]): StorageTarget[] {
    return [
        { bucket: 'mentor-avatars', folder: userId },
        { bucket: 'chat-images', folder: userId },
        { bucket: 'tool-photos', folder: userId },
        { bucket: 'mentor-files', folder: `voice-samples/${userId}` },
        { bucket: 'avatars', folder: 'avatars', namePrefix: `${userId}.` },
        ...ownedMentorIds.map(id => ({ bucket: 'knowledge-files', folder: id })),
    ]
}

/** 회원 한 명 기준으로 지우는 표 (자식 먼저). [표, 열쇠 열] */
const USER_DELETES: [string, string][] = [
    ['conversation_signals', 'user_id'], ['message_feedback', 'user_id'], ['message_log', 'user_id'],
    ['permission_requests', 'user_id'], ['next_steps', 'user_id'], ['checkins', 'user_id'], ['user_memories', 'user_id'],
    ['chat_sessions', 'user_id'],          // messages 는 연쇄 삭제
    ['channels', 'user_id'],               // channel_members·channel_messages 는 연쇄 삭제
    ['team_bots', 'user_id'], ['bot_routines', 'user_id'], ['bot_skills', 'user_id'], ['bot_links', 'user_id'],
    ['connectors', 'user_id'],             // 연동 토큰 포함
    ['push_subscriptions', 'user_id'], ['notification_prefs', 'user_id'], ['notifications', 'user_id'],
    ['knowledge_syncs', 'user_id'], ['knowledge_feeds', 'user_id'], ['bot_response_settings', 'user_id'],
    ['access_group_members', 'user_id'], ['access_groups', 'owner_user_id'], ['bot_audience', 'owner_user_id'],
    ['doc_page_usage', 'user_id'], ['user_sns_links', 'user_id'], ['sns_link_bonuses', 'user_id'],
    ['user_concerns', 'user_id'], ['tool_photos', 'user_id'], ['voice_usage', 'user_id'], ['ebook_logs', 'user_id'],
    ['mentor_match_logs', 'user_id'], ['analytics_events', 'user_id'], ['app_events', 'user_id'], ['visit_logs', 'user_id'],
    ['creator_payout_profiles', 'user_id'], ['conversation_credits', 'user_id'], ['user_plans', 'user_id'],
    ['user_onboarding', 'user_id'], ['signup_surveys', 'user_id'],
]

/** 내가 만든 봇에 딸린 표 (mentor_id 기준, 자식 먼저) — 마지막에 mentors 자체 */
const MENTOR_DELETES = [
    'knowledge_chunks', 'knowledge_sources', 'ontology_relations', 'ontology_entities', 'channel_members',
    'team_bots', 'bot_links', 'bot_audience', 'bot_access_groups', 'bot_response_settings', 'bot_routines',
    'knowledge_feeds', 'knowledge_syncs', 'mentor_monetization', 'mentor_link_counts',
]

/** 5년 보관하는 표: 지우지 않고 사람과의 연결만 끊는다 */
const RETAINED_TABLES = ['credit_transactions', 'payments', 'subscriptions']

/** 없는 표·없는 열이면 건너뛴다(환경마다 표 구성이 다르다) */
const SKIPPABLE = new Set(['42P01', '42703', 'PGRST205', 'PGRST204'])

type DbError = { code?: string; message?: string } | null

function fail(step: string, e: NonNullable<DbError>): never {
    throw new Error(`[account-delete] ${step} 실패: ${e.code ?? ''} ${e.message ?? ''}`.trim())
}

async function tolerant(step: string, p: PromiseLike<{ error: DbError }>) {
    const { error } = await p
    if (!error) return
    if (error.code && SKIPPABLE.has(error.code)) {
        console.log(`[account-delete] ${step} 건너뜀(표/열 없음)`)
        return
    }
    fail(step, error)
}

async function removeStorage(db: Db, t: StorageTarget) {
    const store = db.storage.from(t.bucket)
    const PAGE = 1000
    const paths: string[] = []
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await store.list(t.folder, { limit: PAGE, offset })
        if (error) {
            if (/not found/i.test(error.message ?? '')) return   // 버킷이 아직 없는 환경
            fail(`저장소 ${t.bucket}/${t.folder} 목록`, error)
        }
        const names = (data ?? []).map((o: { name: string }) => o.name).filter((n: string) => !t.namePrefix || n.startsWith(t.namePrefix))
        paths.push(...names.map((n: string) => `${t.folder}/${n}`))
        if ((data ?? []).length < PAGE) break
    }
    for (let i = 0; i < paths.length; i += 100) {
        const { error } = await store.remove(paths.slice(i, i + 100))
        if (error) fail(`저장소 ${t.bucket} 삭제`, error)
    }
}

export async function deleteAccount(
    db: Db,
    user: DeleteUser,
    opts: { appleAuthorizationCode?: string; revokeApple?: (code?: string) => Promise<RevokeResult> } = {},
): Promise<DeleteResult> {
    const uid = user.id

    // 1) 결제가 계속 나가는 구독이 있으면 막는다
    const { data: subs, error: subErr } = await db
        .from('subscriptions').select('id, status').eq('user_id', uid).in('status', ['active', 'past_due']).limit(1)
    if (subErr && !(subErr.code && SKIPPABLE.has(subErr.code))) fail('구독 확인', subErr)
    if (subs && subs.length > 0) {
        return { ok: false, code: 'ACTIVE_SUBSCRIPTION', message: '이용 중인 구독이 있어요. 구독을 먼저 해지한 뒤 탈퇴해 주세요.' }
    }

    // 2) 내가 만든 봇 찾기 (봇 주인 = mentors.creator_id → creator_profiles.user_id)
    const { data: cp, error: cpErr } = await db.from('creator_profiles').select('id').eq('user_id', uid).maybeSingle()
    if (cpErr && !(cpErr.code && SKIPPABLE.has(cpErr.code))) fail('크리에이터 프로필 조회', cpErr)
    let mentorIds: string[] = []
    if (cp?.id) {
        const { data: ms, error: mErr } = await db.from('mentors').select('id').eq('creator_id', cp.id)
        if (mErr) fail('내 봇 조회', mErr)
        mentorIds = (ms ?? []).map((m: { id: string }) => m.id)
    }

    // 3) 결제·크레딧·구독 기록은 보관하되 사람과 분리. 실패하면(마이그레이션 전) 여기서 멈춰 아무것도 안 지운다
    const ref = anonymousRef(uid)
    for (const table of RETAINED_TABLES) {
        const { error } = await db.from(table).update({ user_id: null, deleted_user_ref: ref }).eq('user_id', uid)
        if (error && error.code !== '42P01') fail(`${table} 분리`, error)
    }
    // 보관하는 구독 줄에서 자동결제 열쇠는 쓸 일이 없으니 비운다(열이 다르면 건너뜀)
    await tolerant('구독 결제수단 비우기', db.from('subscriptions').update({ billing_key: '' }).eq('deleted_user_ref', ref))
    // 사용량 기록(비용 집계용)은 사람만 떼고 남긴다
    await tolerant('llm_usage 익명화', db.from('llm_usage').update({ user_id: null }).eq('user_id', uid))

    // 4) 저장소 파일
    for (const t of storagePlan(uid, mentorIds)) await removeStorage(db, t)

    // 5) 하위 표 → 내 봇 → 크리에이터 프로필
    for (const [table, col] of USER_DELETES) {
        await tolerant(`${table} 삭제`, db.from(table).delete().eq(col, uid))
    }
    if (user.email) {
        await tolerant('그룹 이메일 초대 삭제', db.from('access_group_members').delete().eq('email', user.email))
    }
    if (mentorIds.length > 0) {
        for (const table of MENTOR_DELETES) {
            await tolerant(`내 봇 ${table} 삭제`, db.from(table).delete().in('mentor_id', mentorIds))
        }
        await tolerant('내 봇 삭제', db.from('mentors').delete().in('id', mentorIds))
    }
    await tolerant('creator_profiles 삭제', db.from('creator_profiles').delete().eq('user_id', uid))

    // 6) 애플 연결 끊기 (실패해도 탈퇴는 계속한다)
    if (user.provider === 'apple') {
        try {
            const r = await (opts.revokeApple ?? revokeAppleTokens)(opts.appleAuthorizationCode)
            if (!r.revoked) console.log(`[account-delete] 애플 토큰 취소 건너뜀/실패: ${r.reason}`)
        } catch (e) {
            console.warn('[account-delete] 애플 토큰 취소 오류', e instanceof Error ? e.message : e)
        }
    }

    // 7) 로그인 계정 (users 와 남은 연쇄 표가 같이 지워진다). 이미 없으면 성공으로 본다
    const { error: authErr } = await db.auth.admin.deleteUser(uid)
    if (authErr && !(authErr.status === 404 || /not found/i.test(authErr.message))) {
        throw new Error(`[account-delete] 계정 삭제 실패: ${authErr.message}`)
    }

    // 개인정보 없는 감사 기록: 표식·개수만
    console.log(`[account-delete] 완료 ref=${ref} provider=${user.provider ?? 'unknown'} bots=${mentorIds.length}`)
    return { ok: true }
}
