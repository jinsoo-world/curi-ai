// 봇 「내 SNS 연결 — 인스타그램」 DB 쪽. 서버 전용 (관리자 열쇠).
//
// 표 두 개 (supabase/migrations/20261024_instagram_connect.sql, RLS 켬 + 정책 0개 + service_role 만)
//   instagram_connections        봇 하나에 인스타그램 계정 하나. 잠근 60일 열쇠, 끝나는 시각, 아이디, 상태
//   instagram_deletion_requests  메타 「정보 삭제 요청」 접수 번호와 처리 상태
// 배우기는 이미 있는 SNS 칸 길(knowledge_feeds, sns_slot='instagram', kind='instagram')을 그대로 쓴다.
//
// 주인 확인(assertBotOwned)은 부르는 쪽(API)이 먼저 한다. 여기서는 항상 mentor_id 를 같이 건다.
// 🔐 열쇠는 igTokenKey(연결 자물쇠에서 갈라낸 열쇠)로 잠가 넣는다. 로그, 응답에 절대 안 나간다.

import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptSecret, decryptSecret } from '@/domains/connectors/crypto'
import { removeBotSource } from '@/domains/os/knowledge'
import { listFeeds, deleteFeed, MAX_FEEDS_PER_BOT } from '@/domains/os/feeds/store'
import type { FetchNewItems, KnowledgeFeed } from '@/domains/os/feeds/types'
import {
    igTokenKey, shouldRefresh, mediaToItems, INSTAGRAM_MAX_MEDIA, INSTAGRAM_RECONNECT_NOTE, INSTAGRAM_DISCONNECTED_NOTE,
    REFRESH_WINDOW_MS, type IgMedia,
} from './core'
import { fetchOwnMedia, refreshLongLivedToken, InstagramApiError, type InstagramLogin } from './api'

export const IG_TABLE = 'instagram_connections'
export const IG_DELETION_TABLE = 'instagram_deletion_requests'
/** 배운 자료 이름 앞에 붙는 말 (bot-sns 의 SNS_SLOT_LABEL 과 같다) */
export const IG_TITLE_PREFIX = '[인스타그램]'

export type IgStatus = 'connected' | 'needs_reconnect' | 'disconnected'

export class InstagramTableMissing extends Error {
    constructor() { super('인스타그램 연결 표가 아직 없다. supabase/migrations/20261024_instagram_connect.sql 을 실행해야 한다') }
}
export class InstagramTooManyFeeds extends Error {
    constructor() { super(`계정은 봇 하나당 ${MAX_FEEDS_PER_BOT}개까지 연결할 수 있어요. 안 쓰는 연결을 하나 빼 주세요`) }
}

const missing = (code?: string) => code === '42P01' || code === 'PGRST205' || code === '42703'
function fail(error: { code?: string; message?: string } | null): never {
    if (missing(error?.code)) throw new InstagramTableMissing()
    throw new Error(error?.message ?? '인스타그램 연결 표를 읽지 못했어요')
}

export interface IgConnectionView {
    mentorId: string
    userId: string
    username: string | null
    accountType: string | null
    status: IgStatus
    tokenExpiresAt: string | null
}

const VIEW_COLS = 'mentor_id, user_id, username, account_type, status, token_expires_at'

/** 이 봇의 인스타그램 연결 (열쇠 빼고). 없거나 표가 아직 없으면 null */
export async function readInstagramConnection(db: SupabaseClient, mentorId: string): Promise<IgConnectionView | null> {
    const { data, error } = await db.from(IG_TABLE).select(VIEW_COLS).eq('mentor_id', mentorId).maybeSingle()
    if (error) {
        if (missing(error.code)) return null
        throw new Error(error.message)
    }
    const r = data as Record<string, string | null> | null
    if (!r) return null
    return {
        mentorId: String(r.mentor_id), userId: String(r.user_id), username: r.username ?? null, accountType: r.account_type ?? null,
        status: (['connected', 'needs_reconnect', 'disconnected'].includes(String(r.status)) ? r.status : 'disconnected') as IgStatus,
        tokenExpiresAt: r.token_expires_at ?? null,
    }
}

export function instagramProfileUrl(username: string): string {
    return `https://www.instagram.com/${username}/`
}

/**
 * 연결 저장 (콜백, 앱 마무리). 열쇠를 잠가 넣고, SNS 인스타그램 칸 연결 줄을 만들거나 다시 켠다.
 * 다른 계정으로 바꿔 연결하면 이어서 멈춤 기준(sync_cursor)을 비운다(새 계정 글을 처음부터).
 */
export async function saveInstagramConnection(
    db: SupabaseClient, master: Buffer, a: { userId: string; mentorId: string; login: InstagramLogin }, nowMs = Date.now(),
): Promise<void> {
    const feeds = await listFeeds(db, a.mentorId)
    const mine = feeds.find(f => f.snsSlot === 'instagram')
    if (!mine && feeds.length >= MAX_FEEDS_PER_BOT) throw new InstagramTooManyFeeds()

    const now = new Date(nowMs).toISOString()
    // 다른 계정으로 바꿔 연결하면 옛 계정 번호를 남긴다 = 옛 계정 주인의 메타 「정보 삭제 요청」도 이 봇을 찾는다 (보안 검토 PR #57)
    const { data: prevRow, error: pErr } = await db.from(IG_TABLE).select('ig_user_id, ig_scoped_id, previous_ig_ids').eq('mentor_id', a.mentorId).maybeSingle()
    if (pErr) fail(pErr)
    const prev = prevRow as { ig_user_id?: string | null; ig_scoped_id?: string | null; previous_ig_ids?: string[] | null } | null
    const currentIds = new Set([a.login.igUserId, a.login.igScopedId])
    const previous = [...new Set([...(prev?.previous_ig_ids ?? []), prev?.ig_user_id, prev?.ig_scoped_id])]
        .filter((v): v is string => !!v && !currentIds.has(v)).slice(-20)
    const { error } = await db.from(IG_TABLE).upsert({
        mentor_id: a.mentorId, user_id: a.userId,
        ig_user_id: a.login.igUserId, ig_scoped_id: a.login.igScopedId, previous_ig_ids: previous,
        username: a.login.username, account_type: a.login.accountType,
        token_encrypted: encryptSecret(a.login.accessToken, igTokenKey(master)),
        token_expires_at: a.login.expiresAt, token_refreshed_at: now,
        status: 'connected', updated_at: now,
    }, { onConflict: 'mentor_id' })
    if (error) fail(error)

    const handle = instagramProfileUrl(a.login.username)
    const changed = !mine || mine.handleOrUrl.toLowerCase() !== handle.toLowerCase()
    const { error: fErr } = await db.from('knowledge_feeds').upsert({
        user_id: a.userId, mentor_id: a.mentorId, sns_slot: 'instagram', kind: 'instagram', handle_or_url: handle,
        status: 'connected', last_error: null,
        ...(changed ? { last_synced_at: null, sync_cursor: null } : {}),
    }, { onConflict: 'mentor_id,sns_slot' })
    if (fErr) fail(fErr)
}

async function setFeed(db: SupabaseClient, mentorId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await db.from('knowledge_feeds').update(patch).eq('mentor_id', mentorId).eq('sns_slot', 'instagram')
    if (error && !missing(error.code)) console.error('[os/instagram] 연결 줄 고치기 실패', { mentorId, message: error.message })
}

/** 열쇠가 끝났거나 취소됨 → 「다시 연결 필요」 */
export async function markInstagramNeedsReconnect(db: SupabaseClient, mentorId: string): Promise<void> {
    const { error } = await db.from(IG_TABLE).update({ status: 'needs_reconnect', updated_at: new Date().toISOString() }).eq('mentor_id', mentorId)
    if (error && !missing(error.code)) console.error('[os/instagram] 다시 연결 표시 실패', { mentorId, message: error.message })
    await setFeed(db, mentorId, { status: 'error', last_error: INSTAGRAM_RECONNECT_NOTE })
}

/**
 * 연결 끊기 = 열쇠만 지운다. 이미 배운 글(자료)은 그대로 둔다(지우려면 자료 목록에서 따로).
 * 연결 줄은 멈춤(paused)으로 남긴다 = 매일 크론이 건너뛰고, 다시 연결하면 같은 줄을 다시 켠다.
 * 아이디 번호는 남긴다(나중에 메타 「정보 삭제 요청」이 오면 어느 봇 자료인지 찾으려고).
 */
export async function disconnectInstagram(db: SupabaseClient, mentorId: string): Promise<boolean> {
    const { data, error } = await db.from(IG_TABLE)
        .update({ token_encrypted: null, token_expires_at: null, status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('mentor_id', mentorId).select('mentor_id')
    if (error) fail(error)
    await setFeed(db, mentorId, { status: 'paused', last_error: INSTAGRAM_DISCONNECTED_NOTE })
    return Array.isArray(data) ? data.length > 0 : !!data
}

/** 잠긴 열쇠를 푼다. 연결 중이 아니면 상태만 */
export async function loadInstagramToken(
    db: SupabaseClient, master: Buffer, mentorId: string,
): Promise<{ token: string } | { status: 'needs_reconnect' | 'disconnected' | 'none' }> {
    const { data, error } = await db.from(IG_TABLE).select('status, token_encrypted, token_expires_at').eq('mentor_id', mentorId).maybeSingle()
    if (error) {
        if (missing(error.code)) return { status: 'none' }
        throw new Error(error.message)
    }
    const r = data as { status?: string; token_encrypted?: string | null; token_expires_at?: string | null } | null
    if (!r) return { status: 'none' }
    if (r.status === 'needs_reconnect') return { status: 'needs_reconnect' }
    if (r.status !== 'connected' || !r.token_encrypted) return { status: 'disconnected' }
    const exp = Date.parse(String(r.token_expires_at ?? ''))
    if (Number.isFinite(exp) && exp <= Date.now()) return { status: 'needs_reconnect' }
    try {
        return { token: decryptSecret(r.token_encrypted, igTokenKey(master)) }
    } catch {
        return { status: 'needs_reconnect' }    // 열쇠가 바뀌었거나 깨졌다 = 다시 연결
    }
}

/* ─────────────────────────── 배우기 ─────────────────────────── */

function mediaMs(m: IgMedia): number {
    return Date.parse(String(m.timestamp ?? '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'))
}

/**
 * 인스타그램 가져오기: 내 최근 게시물(최대 INSTAGRAM_MAX_MEDIA개)의 글만. 이미 배운 게시물은 건너뛴다(주소 = 게시물마다 하나).
 * 이어서 멈춤 기준 = 가장 최신 게시물 시각. 끝까지(또는 지난 기준까지) 다 봤고 한도에 안 걸렸을 때만 옮긴다.
 */
export function instagramFetcher(token: string, deps: { fetchImpl?: typeof fetch } = {}): FetchNewItems {
    return async (_feed, _since, opts = {}) => {
        const cursorMs = Date.parse(String(opts.cursor ?? ''))
        const { media, complete } = await fetchOwnMedia(token, {
            max: INSTAGRAM_MAX_MEDIA, deadline: opts.deadline, fetchImpl: deps.fetchImpl,
            ...(Number.isFinite(cursorMs) ? { stopAt: (m: IgMedia) => Number.isFinite(mediaMs(m)) && mediaMs(m) <= cursorMs } : {}),
        })
        const newest = media.map(mediaMs).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), -Infinity)
        const { items: all, short } = mediaToItems(media)
        const fresh = all.filter(i => !opts.isKnown?.(i.url))
        const max = opts.maxItems ?? Infinity
        const items = fresh.slice(0, Math.max(0, max))
        const capped = fresh.length > items.length
        const notes = [
            short ? `글이 없거나 짧은 게시물 ${short}개는 건너뛰었어요` : '',
            !complete && opts.deadline && Date.now() > opts.deadline - 2_000 ? '시간이 모자라 나머지 게시물은 다음에 배워요' : '',
        ].filter(Boolean)
        const cursor = complete && !capped && Number.isFinite(newest) ? new Date(newest).toISOString() : undefined
        return { items, ...(notes.length ? { note: notes.join('. ') } : {}), ...(cursor ? { cursor } : {}) }
    }
}

/**
 * 배우기 준비: 열쇠를 풀어 가져오기를 만든다. 열쇠가 없거나 끝났으면 멈출 이유를 돌려준다(밖에 나가지 않는다).
 * 가져오는 중에 190(열쇠 무효)이 오면 「다시 연결 필요」로 표시하고 그 말로 던진다(syncFeed 가 연결 줄에 적는다).
 */
export async function prepareInstagramSync(
    db: SupabaseClient, master: Buffer | null, feed: KnowledgeFeed, deps: { fetchImpl?: typeof fetch } = {},
): Promise<{ fetcher: FetchNewItems } | { stop: { status: 'error' | 'paused'; note: string } }> {
    if (!master) return { stop: { status: 'paused', note: '인스타그램 연결은 준비 중이에요' } }
    const t = await loadInstagramToken(db, master, feed.mentorId)
    if (!('token' in t)) {
        if (t.status === 'needs_reconnect') {
            await markInstagramNeedsReconnect(db, feed.mentorId)
            return { stop: { status: 'error', note: INSTAGRAM_RECONNECT_NOTE } }
        }
        await setFeed(db, feed.mentorId, { status: 'paused', last_error: INSTAGRAM_DISCONNECTED_NOTE })
        return { stop: { status: 'paused', note: INSTAGRAM_DISCONNECTED_NOTE } }
    }
    const inner = instagramFetcher(t.token, deps)
    const fetcher: FetchNewItems = async (f, since, opts) => {
        try {
            return await inner(f, since, opts)
        } catch (e) {
            if (e instanceof InstagramApiError && e.tokenInvalid) {
                await markInstagramNeedsReconnect(db, feed.mentorId)
                throw new Error(INSTAGRAM_RECONNECT_NOTE)
            }
            throw new Error('인스타그램 게시물을 지금 못 읽었어요. 내일 다시 해 볼게요')
        }
    }
    return { fetcher }
}

/* ─────────────────────────── 열쇠 연장 (매일 크론) ─────────────────────────── */

export interface RefreshSummary { checked: number; refreshed: number; reconnect: number; failed: number }

/**
 * 60일 열쇠 연장. 연결 중이고 15일 안에 끝나는 줄만 읽어, 마지막 연장 뒤 24시간 지난 것만 연장한다.
 * 이미 끝난 열쇠, 190 이 온 열쇠는 「다시 연결 필요」. 그 밖의 고장은 다음 날 다시.
 */
export async function refreshInstagramTokens(
    db: SupabaseClient, master: Buffer,
    o: { nowMs?: number; limit?: number; deadline?: number; fetchImpl?: typeof fetch } = {},
): Promise<RefreshSummary> {
    const now = o.nowMs ?? Date.now()
    const out: RefreshSummary = { checked: 0, refreshed: 0, reconnect: 0, failed: 0 }
    const { data, error } = await db.from(IG_TABLE)
        .select('mentor_id, status, token_encrypted, token_expires_at, token_refreshed_at')
        .eq('status', 'connected').lt('token_expires_at', new Date(now + REFRESH_WINDOW_MS).toISOString())
        .order('token_expires_at', { ascending: true }).limit(o.limit ?? 50)
    if (error) {
        if (missing(error.code)) return out
        throw new Error(error.message)
    }
    const key = igTokenKey(master)
    for (const r of (data ?? []) as { mentor_id: string; status: string; token_encrypted: string | null; token_expires_at: string | null; token_refreshed_at: string | null }[]) {
        if (o.deadline && Date.now() > o.deadline) break
        out.checked++
        const exp = Date.parse(String(r.token_expires_at ?? ''))
        if (!r.token_encrypted || !Number.isFinite(exp) || exp <= now) {
            await markInstagramNeedsReconnect(db, r.mentor_id); out.reconnect++; continue
        }
        if (!shouldRefresh(r, now)) continue
        let token: string
        try { token = decryptSecret(r.token_encrypted, key) } catch { await markInstagramNeedsReconnect(db, r.mentor_id); out.reconnect++; continue }
        try {
            const n = await refreshLongLivedToken(token, { fetchImpl: o.fetchImpl, nowMs: now })
            const { error: uErr } = await db.from(IG_TABLE).update({
                token_encrypted: encryptSecret(n.accessToken, key), token_expires_at: n.expiresAt,
                token_refreshed_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
            }).eq('mentor_id', r.mentor_id).eq('status', 'connected')
            if (uErr) throw new Error(uErr.message)
            out.refreshed++
        } catch (e) {
            if (e instanceof InstagramApiError && e.tokenInvalid) { await markInstagramNeedsReconnect(db, r.mentor_id); out.reconnect++; continue }
            out.failed++
            console.error('[os/instagram] 열쇠 연장 실패', { mentorId: r.mentor_id, why: e instanceof Error ? e.message : 'unknown' })
        }
    }
    return out
}

/* ─────────────────────────── 메타 콜백: 연결 해제, 정보 삭제 ─────────────────────────── */

/** 메타가 보낸 사용자 번호(앱 범위 번호 또는 계정 번호)로 이 계정이 지금 연결된 봇들 (withPrevious = 예전에 연결했던 봇까지) */
async function mentorsOfIgUser(db: SupabaseClient, igId: string, withPrevious = false): Promise<string[]> {
    const out = new Set<string>()
    for (const col of ['ig_scoped_id', 'ig_user_id']) {
        const { data, error } = await db.from(IG_TABLE).select('mentor_id').eq(col, igId)
        if (error) fail(error)
        for (const r of (data ?? []) as { mentor_id: string }[]) out.add(r.mentor_id)
    }
    if (withPrevious) {
        const { data, error } = await db.from(IG_TABLE).select('mentor_id').contains('previous_ig_ids', [igId])
        if (error && !missing(error.code)) fail(error)
        for (const r of (data ?? []) as { mentor_id: string }[]) out.add(r.mentor_id)
    }
    return [...out]
}

/** 지금 그 계정이 연결된 봇인가 (예전 계정 번호로만 찾은 봇은 지금 연결을 지우면 안 된다) */
async function isCurrentlyIgUser(db: SupabaseClient, mentorId: string, igId: string): Promise<boolean> {
    const { data, error } = await db.from(IG_TABLE).select('ig_user_id, ig_scoped_id').eq('mentor_id', mentorId).maybeSingle()
    if (error) fail(error)
    const r = data as { ig_user_id?: string | null; ig_scoped_id?: string | null } | null
    return !!r && (r.ig_user_id === igId || r.ig_scoped_id === igId)
}

/** 사용자가 인스타그램에서 우리 앱 연결을 해제했다 → 그 계정의 열쇠를 전부 지운다 */
export async function deauthorizeInstagramUser(db: SupabaseClient, igId: string): Promise<number> {
    const mentors = await mentorsOfIgUser(db, igId)
    for (const m of mentors) await disconnectInstagram(db, m)
    return mentors.length
}

/**
 * 메타 「정보 삭제 요청」 접수. 바로 열쇠와 연결 줄(아이디 포함)을 지우고, 배운 인스타그램 자료는 삭제 대기로 적어 둔다.
 * 자료 지우기는 시간이 걸려 매일 크론(processInstagramDeletions)이 기존 자료 빼기(removeBotSource)로 처리한다.
 * 돌려주는 접수 번호로 상태 화면을 본다.
 */
export async function requestInstagramDataDeletion(db: SupabaseClient, igId: string, nowMs = Date.now()): Promise<string> {
    // 같은 계정의 처리 전 요청이 있으면 그 번호를 그대로 준다(메타 재전송, 같은 요청 여러 번)
    const { data: open, error: oErr } = await db.from(IG_DELETION_TABLE).select('confirmation_code').eq('ig_user_id', igId).eq('status', 'pending').limit(1)
    if (oErr) fail(oErr)
    const openCode = ((open ?? []) as { confirmation_code: string }[])[0]?.confirmation_code
    if (openCode) return openCode
    const mentors = await mentorsOfIgUser(db, igId, true)
    const code = randomBytes(12).toString('hex')
    const { error } = await db.from(IG_DELETION_TABLE).insert({
        confirmation_code: code, ig_user_id: igId, mentor_ids: mentors, status: 'pending', requested_at: new Date(nowMs).toISOString(),
    })
    if (error) fail(error)
    for (const m of mentors) {
        // 지금 다른 계정이 연결된 봇(예전 번호로만 찾음)은 지금 연결을 지우지 않는다. 배운 옛 글은 크론이 지운다
        if (!(await isCurrentlyIgUser(db, m, igId))) continue
        await setFeed(db, m, { status: 'paused', last_error: '인스타그램 정보 삭제 요청으로 연결을 지웠어요' })
        const { error: dErr } = await db.from(IG_TABLE).delete().eq('mentor_id', m)
        if (dErr) fail(dErr)
    }
    return code
}

/** 그 봇이 인스타그램에서 배운 자료 번호 (SNS 칸 연결 줄의 자료 + 연결 줄 없이 남은 [인스타그램] 자료) */
async function instagramSourceIds(db: SupabaseClient, mentorId: string): Promise<string[]> {
    const { data, error } = await db.from('knowledge_sources').select('id, title, original_url').eq('mentor_id', mentorId)
    if (error) throw new Error(error.message)
    return ((data ?? []) as { id: string; title?: string | null; original_url?: string | null }[])
        .filter(r => String(r.original_url ?? '').startsWith('https://www.instagram.com/') && String(r.title ?? '').startsWith(IG_TITLE_PREFIX))
        .map(r => r.id)
}

/** 삭제 대기 요청 처리 (매일 크론). 시간이 모자라면 남은 건 다음 날 이어서 */
export async function processInstagramDeletions(db: SupabaseClient, o: { limit?: number; deadline?: number } = {}): Promise<{ done: number; removed: number }> {
    const { data, error } = await db.from(IG_DELETION_TABLE).select('confirmation_code, mentor_ids, removed_sources')
        .eq('status', 'pending').order('requested_at', { ascending: true }).limit(o.limit ?? 10)
    if (error) {
        if (missing(error.code)) return { done: 0, removed: 0 }
        throw new Error(error.message)
    }
    let done = 0, removed = 0
    for (const req of (data ?? []) as { confirmation_code: string; mentor_ids: string[] | null; removed_sources: number | null }[]) {
        let cut = false, count = req.removed_sources ?? 0
        for (const m of req.mentor_ids ?? []) {
            const feed = (await listFeeds(db, m)).find(f => f.snsSlot === 'instagram')
            if (feed) {
                const r = await deleteFeed(db, m, feed.id, true)
                count += r.removedSources; removed += r.removedSources
            }
            for (const id of await instagramSourceIds(db, m)) {
                if (o.deadline && Date.now() > o.deadline) { cut = true; break }
                await removeBotSource(db, m, id)
                count++; removed++
            }
            if (cut) break
        }
        const patch = cut ? { removed_sources: count } : { removed_sources: count, status: 'done', done_at: new Date().toISOString() }
        const { error: uErr } = await db.from(IG_DELETION_TABLE).update(patch).eq('confirmation_code', req.confirmation_code)
        if (uErr) throw new Error(uErr.message)
        if (cut) break
        done++
    }
    return { done, removed }
}

/** 상태 화면용 */
export async function readInstagramDeletion(db: SupabaseClient, code: string): Promise<{ status: 'pending' | 'done'; requestedAt: string; doneAt: string | null } | null> {
    if (!/^[0-9a-f]{24}$/.test(code)) return null
    const { data, error } = await db.from(IG_DELETION_TABLE).select('status, requested_at, done_at').eq('confirmation_code', code).maybeSingle()
    if (error) {
        if (missing(error.code)) return null
        throw new Error(error.message)
    }
    const r = data as { status: string; requested_at: string; done_at: string | null } | null
    return r ? { status: r.status === 'done' ? 'done' : 'pending', requestedAt: r.requested_at, doneAt: r.done_at ?? null } : null
}
