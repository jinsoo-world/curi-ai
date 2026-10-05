// domains/os — 「이 봇이 읽은 자료」. 봇 주인만 자기 봇의 자료를 보고 넣고 뺀다.
//
// 왜 따로 두나 = 기존 크리에이터용 창구(/api/creator/knowledge/*)는 「크리에이터 프로필」로 주인을 가른다.
// 봇 팀(team_bots)은 「user_id」로 가른다. 여기서 team_bots 로 주인을 확인한 뒤
// 기존 자료 도메인 함수(addKnowledgeSource 등)를 그대로 부른다. 우회로를 새로 만들지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedKind } from './feeds/types'
import { isBotBlocked } from './blocks'
import { addKnowledgeSource } from '@/domains/knowledge'
import { failReasonLine, FAIL_REASON_COL, LEGACY_FAIL_REASON_COL } from '@/domains/knowledge/actions'
import { failureMessage, FAILURE_REASONS } from '@/domains/knowledge/failure-reasons'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from '@/domains/os/readers'
import { markInjectionPatterns } from '@/domains/chat/injection'
import { saveSocialPosts } from './social-store'
import { draftLinkKind, draftSourceKind, postUrlOf } from '@/domains/os/twin-draft-shared'
import { TOO_SHORT_LINE, FULL_LINE, accountKeyOf, enoughText, failCodeOfReason, isLinkFailCode, type UnreadLink } from '@/domains/os/link-rules'

/** 표가 아직 DB 에 없을 때 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다
/** 표에 아직 없는 칸을 적어 넣었을 때 나는 Postgres 오류 번호 (컬럼 없음) */
const COLUMN_MISSING = '42703'

/**
 * 봇 하나의 자료 칸 수 (기존 크리에이터 창구와 같은 값).
 * 칸은 「출처」 단위로 센다: 파일 하나, 링크 하나, 글 하나가 칸 하나이고,
 * 블로그, 채널 한 곳에서 가져온 글은 몇 편이든 칸 하나다(1005).
 */
export const MAX_SOURCES_PER_BOT = 10
/** 한 곳(블로그, 채널)에서 자료로 가져오는 글 수 상한. 칸은 하나만 쓴다 */
export const MAX_ITEMS_PER_ACCOUNT = 30
/** 링크, 글로 넣을 때 본문 최대 길이 (너무 긴 글은 잘라 넣는다) */
export const MAX_TEXT_CHARS = 100_000

/** 링크를 못 읽었을 때. code 는 link-rules.ts LinkFailCode (화면이 「다시 시도」, 붙여넣기를 가른다) */
export class LinkReadError extends Error {
    constructor(message: string, public code?: string) { super(message) }
}

export class BotNotMine extends Error {
    constructor() { super('내 팀의 봇이 아니다') }
}

/**
 * 이 봇이 내 팀에 있는지만 확인한다 (마켓에서 데려온 봇 포함). 대화, 봇끼리 전달처럼 「쓰기만」 하는 창구용.
 * 자료, 설정을 바꾸는 창구는 assertBotOwned(만든 사람 확인)를 쓴다.
 */
export async function assertBotInTeam(db: SupabaseClient, userId: string, mentorId: string): Promise<void> {
    if (!userId || !mentorId) throw new BotNotMine()
    const { data, error } = await db
        .from('team_bots')
        .select('id')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
        .maybeSingle()
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new BotNotMine()
        throw new Error(error.message)
    }
    if (!data) throw new BotNotMine()
    // 🚫 차단한 봇 = 팀에 있어도 「내 팀 봇 아님」 (전달, 멘션, 초안, 자료 창구가 다 여기를 지난다. 애플 심사 지침 1.2)
    if (await isBotBlocked(db, userId, mentorId)) throw new BotNotMine()
}

/**
 * 이 봇을 내가 만들었는지 확인한다(봇 주인 = mentors.creator_id 의 creator_profiles.user_id). 아니면 던진다.
 * 예전에는 team_bots.user_id 만 봐서, 마켓에서 데려온 봇(linked_from_market)의 자료도 넣고 고칠 수 있었다(0929 보안 수정).
 * DB 보호 규칙(RLS)과 같은 기준이다. 표가 아직 없으면 역시 「내 봇 아님」 = 기본 거절.
 */
export async function assertBotOwned(db: SupabaseClient, userId: string, mentorId: string): Promise<void> {
    if (!userId || !mentorId) throw new BotNotMine()
    const { data: m, error } = await db
        .from('mentors')
        .select('creator_id')
        .eq('id', mentorId)
        .maybeSingle()
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new BotNotMine()
        throw new Error(error.message)
    }
    const creatorId = (m as { creator_id: string | null } | null)?.creator_id
    if (!creatorId) throw new BotNotMine()
    const { data: c, error: cErr } = await db
        .from('creator_profiles')
        .select('id')
        .eq('id', creatorId)
        .eq('user_id', userId)
        .maybeSingle()
    if (cErr) {
        if ((cErr.code === TABLE_MISSING || cErr.code === TABLE_MISSING_REST)) throw new BotNotMine()
        throw new Error(cErr.message)
    }
    if (!c) throw new BotNotMine()
}

export type BotSourceType = 'pdf' | 'url' | 'youtube' | 'text'

export interface BotSource {
    id: string
    title: string
    sourceType: BotSourceType
    status: 'pending' | 'processing' | 'completed' | 'failed'
    chunkCount: number
    createdAt: string
    /** 이 자료가 무엇인지 한 줄 설명 (메타 칸, 마이그레이션 전이면 undefined) */
    context?: string
    /** 내(봇 주인)가 직접 쓴 글인가 */
    authorIsMe?: boolean
    /** 넣은 방식 세부: file/url/youtube/text/qa/note/csv/fix */
    sourceKind?: string
    /** 인용·출처 주소 */
    citationUrl?: string
    /** 못 읽었을 때 이유 한 줄 (모르면 비어 있다) */
    failReason?: string
}

const BASE_COLS = 'id, title, source_type, processing_status, chunk_count, created_at'
const META_COLS = `${BASE_COLS}, context, author_is_me, source_kind, citation_url, ${FAIL_REASON_COL}, ${LEGACY_FAIL_REASON_COL}`

type SourceRow = {
    id: string; title: string; source_type: BotSourceType
    processing_status: BotSource['status']; chunk_count: number | null; created_at: string
    context?: string | null; author_is_me?: boolean | null; source_kind?: string | null; citation_url?: string | null
    failure_reason?: string | null
    summary?: string | null
}

/** 못 읽은 자료 = 처리 실패, 또는 다 끝났는데 조각이 0개 (봇이 한 글자도 못 읽는다) */
export function isUnusableSource(status: string, chunkCount: number | null | undefined): boolean {
    return status === 'failed' || (status === 'completed' && (chunkCount ?? 0) === 0)
}

export const EMPTY_SOURCE_REASON = FAILURE_REASONS.empty_content

/** 실패 이유 한 줄: 코드 칸(failure_reason) 먼저, 없으면 예전에 summary 칸에 적은 글 */
export function failReasonOf(r: { failure_reason?: string | null; summary?: string | null }): string | undefined {
    return failureMessage(r.failure_reason) ?? ((r.summary ?? '').trim() || undefined)
}

function toBotSource(r: SourceRow): BotSource {
    const bad = isUnusableSource(r.processing_status, r.chunk_count)
    return {
        id: r.id, title: r.title, sourceType: r.source_type,
        status: bad ? 'failed' : r.processing_status, chunkCount: r.chunk_count ?? 0, createdAt: r.created_at,
        context: r.context ?? undefined, authorIsMe: r.author_is_me ?? undefined,
        sourceKind: r.source_kind ?? undefined, citationUrl: r.citation_url ?? undefined,
        // summary 칸은 실패한 자료에서만 이유로 읽는다 (다 읽은 자료의 summary 는 요약이다)
        failReason: bad ? (r.processing_status === 'failed' ? failReasonOf(r) : EMPTY_SOURCE_REASON) : undefined,
    }
}

/** 이 봇이 읽은 자료 목록 (주인 확인은 부르는 쪽에서 먼저 한다) */
export async function listBotSources(db: SupabaseClient, mentorId: string): Promise<BotSource[]> {
    const metaRes = await db.from('knowledge_sources').select(META_COLS).eq('mentor_id', mentorId).order('created_at', { ascending: false })
    if (!metaRes.error) return ((metaRes.data ?? []) as unknown as SourceRow[]).map(toBotSource)
    // 메타 칸이 아직 없으면(마이그레이션 전) 옛 칸만으로 한 번 더 — 목록 자체가 안 나오는 사고를 막는다
    if (metaRes.error.code !== COLUMN_MISSING) throw new Error(metaRes.error.message)
    const baseRes = await db.from('knowledge_sources').select(BASE_COLS).eq('mentor_id', mentorId).order('created_at', { ascending: false })
    if (baseRes.error) throw new Error(baseRes.error.message)
    return ((baseRes.data ?? []) as unknown as SourceRow[]).map(toBotSource)
}

/** 유튜브 주소인가 */
export function isYoutubeUrl(url: string): boolean {
    try {
        const u = new URL(url)
        const host = u.hostname.replace(/^www\./, '').toLowerCase()
        return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be'
    } catch { return false }
}

/**
 * 밖에서 가져와도 되는 주소인가 (SSRF 막기).
 * 우리 서버가 남이 적어준 주소를 그대로 열면, 사내망, 클라우드 메타데이터 주소를 대신 읽어 줄 수 있다.
 * http/https 만, 그리고 사설, 루프백 주소는 막는다.
 */
export function isSafeExternalUrl(raw: string): boolean {
    let u: URL
    try { u = new URL(raw) } catch { return false }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
    if (host === '[::1]' || host === '::1') return false
    // 숫자 주소는 사설 대역을 막는다
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (m) {
        const [a, b] = [Number(m[1]), Number(m[2])]
        if (a === 0 || a === 10 || a === 127) return false
        if (a === 169 && b === 254) return false            // 클라우드 메타데이터
        if (a === 172 && b >= 16 && b <= 31) return false
        if (a === 192 && b === 168) return false
        if (a >= 224) return false
    }
    return true
}

/** 웹페이지 HTML 에서 읽을 글만 뽑는다 (태그, 스크립트 제거) */
export function htmlToText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/** HTML 의 <title> 을 제목으로 쓴다. 없으면 주소를 쓴다 */
export function pickTitle(html: string, fallback: string): string {
    const m = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i)
    const t = m ? htmlToText(m[1]).trim() : ''
    return (t || fallback).slice(0, 120)
}

/**
 * 자리 셈에 넣는 자료 = 쓸 수 있는 자료만.
 * 처리 실패(failed)나 다 끝났는데 조각이 0개인 자료는 봇이 못 읽으니 자리를 차지하지 않는다.
 * 처리 중(pending, processing)인 자료는 곧 쓸 자료라 센다 = 한꺼번에 올려서 10개를 넘기는 걸 막는다.
 */
export const USABLE_SOURCE_FILTER = 'processing_status.in.(pending,processing),and(processing_status.eq.completed,chunk_count.gt.0)'

/** 자료 한 줄이 어느 칸에 들어가는지 (같은 블로그, 채널의 글은 같은 칸) */
export function slotKeyOf(r: { id: string; feed_id?: string | null; original_url?: string | null }): string {
    return accountKeyOf(r.original_url) ?? (r.feed_id ? `feed:${r.feed_id}` : `row:${r.id}`)
}

/** 쓸 수 있는 자료가 차지한 칸 수와 칸마다 글 수 */
export async function loadSlotUsage(db: SupabaseClient, mentorId: string): Promise<{ slots: number; perKey: Map<string, number> }> {
    let res = await db.from('knowledge_sources').select('id, feed_id, original_url').eq('mentor_id', mentorId).or(USABLE_SOURCE_FILTER).limit(2000)
    if (res.error?.code === COLUMN_MISSING) res = (await db.from('knowledge_sources').select('id, original_url').eq('mentor_id', mentorId).or(USABLE_SOURCE_FILTER).limit(2000)) as unknown as typeof res
    if (res.error) throw new Error(res.error.message)
    const perKey = new Map<string, number>()
    for (const r of (res.data ?? []) as { id: string; feed_id?: string | null; original_url?: string | null }[]) {
        const k = slotKeyOf(r)
        perKey.set(k, (perKey.get(k) ?? 0) + 1)
    }
    return { slots: perKey.size, perKey }
}

/**
 * 자료 하나를 넣을 자리가 남았는지 (실패했거나 빈 자료는 세지 않는다).
 * 같은 블로그, 채널의 글이면(url 이나 feedId 를 주면) 칸이 다 차도 그 곳에 더 넣을 수 있다.
 */
export async function assertRoomForMore(db: SupabaseClient, mentorId: string, opts: { url?: string | null; feedId?: string | null } = {}): Promise<void> {
    const { count, error } = await db
        .from('knowledge_sources')
        .select('id', { count: 'exact', head: true })
        .eq('mentor_id', mentorId)
        .or(USABLE_SOURCE_FILTER)
    if (error) throw new Error(error.message)
    // 자료 줄 수가 칸 수보다 적으면 칸은 반드시 남는다
    if ((count ?? 0) < MAX_SOURCES_PER_BOT) return
    const usage = await loadSlotUsage(db, mentorId)
    if (usage.slots < MAX_SOURCES_PER_BOT) return
    const key = opts.feedId ? `feed:${opts.feedId}` : accountKeyOf(opts.url)
    if (key && (usage.perKey.get(key) ?? 0) > 0 && (usage.perKey.get(key) ?? 0) < MAX_ITEMS_PER_ACCOUNT) return
    throw new Error(FULL_LINE)
}

/**
 * 글(붙여넣기 / 짧은 메모)을 자료로 넣는다.
 * sourceKind 로 「길게 붙여넣은 글(text)」과 「짧은 메모(note)」를 자료 목록에서 구분한다(검색 방식은 같다).
 */
export async function addTextSource(db: SupabaseClient, mentorId: string, title: string, text: string, sourceKind: string = 'text') {
    const body = (text ?? '').trim().slice(0, MAX_TEXT_CHARS)
    // 짧은 메모(note)만 짧아도 된다. 붙여넣은 글, 캡처 글은 어느 입구든 같은 최소 길이(link-rules.ts)
    if (sourceKind === 'note' ? body.length < 10 : !enoughText(body)) throw new Error(sourceKind === 'note' ? '메모가 너무 짧아요. 조금 더 적어 주세요' : TOO_SHORT_LINE)
    // 🛡 글 속 「이전 지시 무시」류 문장에는 표식을 붙여 저장한다(지우지 않는다). 울타리가 이 표식을 설명한다.
    const { text: marked, marked: count } = markInjectionPatterns(body)
    if (count > 0) console.warn('[os/knowledge] 자료 속 명령문 표식', { mentorId, kind: 'text', count })
    return addKnowledgeSource(db, mentorId, (title || '붙여넣은 글').slice(0, 120), marked, 'text', undefined, {
        meta: { sourceKind, fetchedAt: new Date().toISOString() },
    })
}

/**
 * Q&A 한 쌍(질문+답)을 자료로 넣는다. 직접 쓰기 / CSV 올리기가 이 함수를 쓴다.
 * 청크는 쪼개지 않고 질문+답 그대로 하나 — 그래야 비슷한 질문이 왔을 때 「질문 그대로 검색」(matchKnowledge 가산점)이 통한다.
 */
export async function addQaSource(
    db: SupabaseClient, mentorId: string, question: string, answer: string,
    meta?: { context?: string; authorIsMe?: boolean; sourceKind?: string },
) {
    const q = (question ?? '').trim().slice(0, 500)
    const a = (answer ?? '').trim().slice(0, MAX_TEXT_CHARS)
    if (q.length < 2) throw new Error('질문을 적어 주세요')
    if (a.length < 1) throw new Error('답을 적어 주세요')
    // 🛡 답 속 「이전 지시 무시」류 문장에도 표식을 붙인다
    const { text: markedAnswer, marked } = markInjectionPatterns(a)
    if (marked > 0) console.warn('[os/knowledge] 자료 속 명령문 표식', { mentorId, kind: 'qa', count: marked })
    const content = `질문: ${q}\n답: ${markedAnswer}`
    return addKnowledgeSource(db, mentorId, q.slice(0, 120), content, 'text', undefined, {
        singleChunk: true,
        meta: {
            context: meta?.context,
            authorIsMe: meta?.authorIsMe ?? true,
            sourceKind: meta?.sourceKind ?? 'qa',
            fetchedAt: new Date().toISOString(),
        },
    })
}

/** 자료의 메타(무엇인지 한 줄, 내가 쓴 글인지)를 고친다. 주인 확인은 부르는 쪽에서 먼저 한다 */
export async function updateBotSourceMeta(
    db: SupabaseClient, mentorId: string, sourceId: string,
    patch: { context?: string; authorIsMe?: boolean },
): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.context !== undefined) row.context = patch.context.slice(0, 300)
    if (patch.authorIsMe !== undefined) row.author_is_me = patch.authorIsMe
    if (Object.keys(row).length === 0) return
    const { error } = await db.from('knowledge_sources').update(row).eq('id', sourceId).eq('mentor_id', mentorId)
    if (error) {
        if (error.code === COLUMN_MISSING) throw new Error('아직 이 기능을 쓸 수 없어요. 잠시 뒤 다시 해 주세요')
        throw new Error(error.message)
    }
}

/** 블로그, 채널 한 곳의 최근 글을 읽어 오는 종류 */
const FEED_PLATFORMS = new Set(['youtube', 'naver_blog', 'tistory', 'substack', 'rss', 'medium', 'brunch', 'wordpress'])
/** 글 모아 읽기 한 번에 넣는 글 수 (블로그 / 그 밖 = 영상처럼 칸을 하나씩 쓰는 곳) */
const ACCOUNT_BATCH_BLOG = 10
const ACCOUNT_BATCH_OTHER = 5

type AccountTarget = { platform: string; feed: { kind: FeedKind; handleOrUrl: string } }

/** 이 주소가 블로그, 채널 한 곳(글 하나가 아닌)이면 그 읽는 법을 돌려준다. 아니면 null */
async function accountTargetOf(rawUrl: string): Promise<AccountTarget | null> {
    // sns-link, feeds 는 이 파일을 거꾸로 불러서(순환) 쓸 때 불러온다
    const { classifySnsLink } = await import('./sns-link')
    let t: ReturnType<typeof classifySnsLink>
    try { t = classifySnsLink(rawUrl) } catch { return null }
    if (!t.feed || t.single || !FEED_PLATFORMS.has(t.platform) || postUrlOf(rawUrl)) return null
    return { platform: t.platform, feed: t.feed }
}

export interface AccountAddResult {
    sources: { id: string; title: string; url: string; chars: number; deduped?: boolean }[]
    failed: number
    /** 하나도 못 넣었을 때 사람에게 보일 이유 */
    reason?: string
    code?: string
    /** 새 글이 없고 이 계정의 글이 이미 들어 있다 (실패가 아니다). 이미 있는 자료 하나의 번호 */
    already?: { id: string }
}

/**
 * 블로그, 채널의 최근 글을 글마다 전체 본문으로 자료에 넣는다 (한 곳은 칸 하나).
 * 이미 있는 주소는 읽지도 않고, 같은 글(해시)은 두 번 넣지 않는다. 하나가 실패해도 나머지는 넣고 던지지 않는다.
 */
export async function addAccountSources(
    db: SupabaseClient, mentorId: string, target: AccountTarget, url: string,
    input: { userId?: string; deadline?: number; max?: number } = {},
): Promise<AccountAddResult> {
    const out: AccountAddResult = { sources: [], failed: 0 }
    const { FETCHERS } = await import('./feeds')
    const deadline = input.deadline ?? Date.now() + 100_000
    const { data } = await db.from('knowledge_sources').select('id, original_url').eq('mentor_id', mentorId)
    const rows = ((data ?? []) as { id?: string; original_url: string | null }[])
    const known = new Set(rows.map(r => r.original_url).filter(Boolean) as string[])
    const key = accountKeyOf(url) ?? accountKeyOf(target.feed.handleOrUrl)
    const ownRow = key ? rows.find(r => accountKeyOf(r.original_url) === key && r.id) : undefined
    let own = 0
    try {
        const usage = await loadSlotUsage(db, mentorId)
        own = key ? (usage.perKey.get(key) ?? 0) : 0
        if (key && own === 0 && usage.slots >= MAX_SOURCES_PER_BOT) { out.reason = FULL_LINE; out.code = 'full'; return out }
    } catch { /* 칸 셈이 안 되면 하나씩 넣을 때 다시 확인한다 */ }
    const batch = key ? ACCOUNT_BATCH_BLOG : ACCOUNT_BATCH_OTHER
    const max = Math.max(0, Math.min(input.max ?? batch, key ? MAX_ITEMS_PER_ACCOUNT - own : batch))
    if (max === 0) { out.reason = '이 계정의 글은 이미 충분히 들어 있어요'; out.code = 'empty'; return out }

    const feed = { id: 'draft', mentorId, userId: input.userId ?? '', kind: target.feed.kind, handleOrUrl: target.feed.handleOrUrl, status: 'connected' as const, lastSyncedAt: null, lastError: null, itemCount: 0, createdAt: '' }
    let fetched
    try {
        fetched = await FETCHERS[target.feed.kind](feed, null, { maxItems: max, deadline, isKnown: u => known.has(u) })
    } catch (e) {
        console.warn('[os/knowledge] 계정 글 가져오기 실패', { mentorId, url, reason: e instanceof Error ? e.message : e })
        out.reason = e instanceof Error ? e.message : '글을 가져오지 못했어요'
        out.code = 'blocked'
        return out
    }
    for (const it of fetched.items) {
        const body = String(it.text ?? '').trim()
        if (known.has(it.url) || !enoughText(body)) continue
        try {
            await assertRoomForMore(db, mentorId, { url: it.url })
            const { text } = markInjectionPatterns(body)
            const kind = draftSourceKind(it.url)
            const src = await addKnowledgeSource(db, mentorId, (it.title || it.url).slice(0, 120), text, target.feed.kind === 'youtube' ? 'youtube' : 'url', it.url, {
                meta: { sourceKind: kind, citationUrl: it.url, authorIsMe: true, fetchedAt: new Date().toISOString() },
                ingest: { dedupe: true, ...(it.publishedAt ? { publishedAt: it.publishedAt } : {}) },
            }) as { id: string; deduped?: boolean }
            out.sources.push({ id: src.id, title: (it.title || it.url).slice(0, 120), url: it.url, chars: text.length, deduped: src.deduped })
            known.add(it.url)
        } catch (e) {
            out.failed++
            out.reason ??= e instanceof Error ? e.message : '자료로 넣지 못했어요'
            if (e instanceof Error && e.message === FULL_LINE) { out.code = 'full'; break }
        }
    }
    if (out.sources.length === 0 && !out.reason) {
        // 새 글이 없는데 이 계정의 글이 이미 들어 있으면 실패가 아니다 (같은 주소를 다시 넣었을 때)
        if (ownRow?.id && out.failed === 0 && fetched.items.every(it => known.has(it.url))) { out.already = { id: ownRow.id }; return out }
        out.reason = fetched.note || '새로 읽을 글이 없었어요'; out.code = 'empty'
    }
    return out
}

/**
 * 링크(웹페이지, 유튜브)를 자료로 넣는다.
 * 읽는 일은 readers/readUrl 하나가 한다(대화 중 링크 읽기와 같은 함수 = 연동성).
 *   웹 = 본문 추출(readability). 유튜브 = 자막(한국어 우선) + 제목 + 채널. 없으면 제목과 설명만.
 * 못 읽으면 이유를 사람 말로 던진다(지어내지 않는다). 20MB, 45초를 넘으면 중단한다.
 */
export async function addLinkSource(db: SupabaseClient, mentorId: string, rawUrl: string, opts: { userId?: string } = {}) {
    const url = (rawUrl ?? '').trim()
    if (!isSafeExternalUrl(url)) throw new Error('열 수 없는 주소예요. http 나 https 로 시작하는 공개 주소만 넣을 수 있어요')

    // 블로그, 채널 주소(계정)는 글을 편마다 전체로 넣는다. 첫 화면 목록(글마다 앞 200자)만 저장하지 않는다 (1005)
    const account = await accountTargetOf(url)
    if (account) {
        const r = await addAccountSources(db, mentorId, account, url, { userId: opts.userId })
        if (r.already) return { id: r.already.id, deduped: true, accountCount: 0 }     // 이미 다 들어 있음 = 실패 아님
        if (r.sources.length === 0) throw new LinkReadError(r.reason || '그 주소에서 읽을 글을 못 찾았어요', r.code)
        return { ...r.sources[r.sources.length - 1], accountCount: r.sources.length }
    }

    // 유튜브 자막이 막히면 Gemini 정리 (넣은 사람 하루 한도로 센다, 35초까지 기다린다)
    const read = await readUrl(url, { ...KNOWLEDGE_READ_OPTIONS, maxChars: MAX_TEXT_CHARS, gemini: opts.userId ? { userId: opts.userId, waitMs: 35_000 } : undefined })
    if (!read.ok) throw new LinkReadError(read.reason, read.code)

    // 🛡 링크 글 속 명령문에도 표식을 붙인다
    const { text, marked } = markInjectionPatterns(read.text)
    if (marked > 0) console.warn('[os/knowledge] 자료 속 명령문 표식', { mentorId, kind: read.kind, count: marked })

    if (read.kind !== 'youtube' && !enoughText(text)) {
        throw new Error('그 주소에서 읽을 글을 못 찾았어요. 다른 주소를 넣거나 글을 붙여 넣어 주세요')
    }
    console.log('[os/knowledge] 링크 읽음', { kind: read.kind, method: read.method, chars: text.length })
    const saved = await addKnowledgeSource(db, mentorId, read.title, text, read.kind === 'youtube' ? 'youtube' : 'url', read.url, {
        meta: { sourceKind: read.kind === 'youtube' ? 'youtube' : 'url', fetchedAt: new Date().toISOString() },
        ingest: { dedupe: true },
    }) as { id?: string; deduped?: boolean }
    if (read.social && !saved.deduped) await saveSocialPosts(db, mentorId, saved.id, read.social)
    return saved
}

/**
 * 못 읽은 링크를 「못 읽은 자료」 한 줄로 남긴다 (조용히 버리지 않는다, 1005).
 * 자료 목록에 이유와 함께 보이고 「다시 시도」로 다시 읽을 수 있다. 칸은 차지하지 않는다. 같은 주소가 이미 있으면 새로 만들지 않는다.
 */
export async function recordFailedLink(db: SupabaseClient, mentorId: string, url: string, reason: string): Promise<void> {
    try {
        const { data } = await db.from('knowledge_sources').select('id').eq('mentor_id', mentorId).eq('original_url', url).limit(1)
        if ((data ?? []).length > 0) return
        const { snsLabelOf } = await import('./sns-capture')
        const { error } = await db.from('knowledge_sources').insert({
            mentor_id: mentorId, source_type: 'url', title: `${snsLabelOf(url)} 링크`.slice(0, 120), original_url: url,
            processing_status: 'failed', chunk_count: 0, summary: reason.slice(0, 200),
        })
        if (error) console.warn('[os/knowledge] 못 읽은 링크 남기기 실패', { mentorId, message: error.message })
    } catch (e) {
        console.warn('[os/knowledge] 못 읽은 링크 남기기 실패', { mentorId, reason: e instanceof Error ? e.message : e })
    }
}

/**
 * 「내 링크로 만들기」로 만든 봇에 초안이 읽은 링크와 붙여넣은 글을 자료로 넣는다(1001, 1003, 1005 보강).
 *   블로그(네이버 RSS, 티스토리), 유튜브 채널, Substack, RSS = 최근 글을 편마다 **전체 본문**으로 (제목, 주소, 날짜). 한 곳은 칸 하나
 *   블로그 글 하나 주소 = 그 글 / 인스타그램, 스레드 = 계정은 최근 글 묶음, 글 주소는 그 글
 *   그 밖의 웹 글, 유튜브 영상 하나 = addLinkSource
 * 같은 글은 두 번 넣지 않는다(dedupe = 글 해시, 가져오기 = 이미 있는 주소). 하나가 실패해도 나머지는 넣고 던지지 않는다.
 * 못 읽은 링크는 이유와 함께 failures 로 돌려주고, 못 읽은 자료 한 줄로도 남긴다(조용히 버리지 않는다).
 */
export async function addDraftSources(
    db: SupabaseClient, mentorId: string,
    input: { links: string[]; pastes: string[]; userId?: string; deadline?: number },
): Promise<{ added: number; failed: number; failures: UnreadLink[] }> {
    let added = 0, failed = 0
    const failures: UnreadLink[] = []
    const deadline = input.deadline ?? Date.now() + 100_000
    const fail = async (url: string, reason: string, code?: string) => {
        failed++
        failures.push({ url, reason, code: isLinkFailCode(code) ? code : failCodeOfReason(reason) })
        await recordFailedLink(db, mentorId, url, reason)
    }
    const tryAdd = async (what: string, add: () => Promise<unknown>, url?: string) => {
        try {
            await assertRoomForMore(db, mentorId, { url })
            await add()
            added++
        } catch (e) {
            failed++
            console.warn('[os/knowledge] 초안 자료 넣기 실패', { mentorId, what, reason: e instanceof Error ? e.message : e })
            if (url && what !== 'paste') failures.push({ url, reason: e instanceof Error ? e.message : '자료로 넣지 못했어요', code: failCodeOfReason(e instanceof Error ? e.message : '') })
        }
    }
    const urls = input.links
        .map(l => l.trim())
        .filter(l => draftLinkKind(l) === 'read' || ['instagram', 'threads'].includes(draftSourceKind(/^https?:\/\//i.test(l) ? l : `https://${l}`)))
        .map(l => /^https?:\/\//i.test(l) ? l : `https://${l}`)
        .filter(isSafeExternalUrl)
    // sns-link 는 이 파일을 거꾸로 불러서(순환) 쓸 때 불러온다
    const { classifySnsLink } = await import('./sns-link')

    const oneLink = async (url: string) => {
        let target: ReturnType<typeof classifySnsLink> | null = null
        try { target = classifySnsLink(url) } catch { target = null }   // 잘못된 모양
        const post = postUrlOf(url)

        // 인스타그램, 스레드 = 읽은 글 묶음 한 자료. 못 읽으면 이유를 남긴다
        if (target && (target.platform === 'instagram' || target.platform === 'threads')) {
            const read = await readUrl(url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: 15_000 })
            if (!read.ok) { await fail(url, read.reason, read.code); return }
            if (!enoughText(read.text)) { await fail(url, '읽을 글이 너무 짧았어요', 'empty'); return }
            const { text } = markInjectionPatterns(read.text)
            await tryAdd(target.platform, async () => {
                const saved = await addKnowledgeSource(db, mentorId, `내 ${target.platform === 'instagram' ? '인스타그램' : '스레드'} 글`, `출처: ${url}\n\n${text}`, 'url', url, {
                    meta: { sourceKind: target.platform, citationUrl: url, authorIsMe: true, fetchedAt: new Date().toISOString() },
                    ingest: { dedupe: true },
                }) as { id?: string; deduped?: boolean }
                if (read.social && !saved.deduped) await saveSocialPosts(db, mentorId, saved.id, read.social)
            }, url)
            return
        }

        // 블로그, 채널 = 최근 글을 편마다 전체 본문으로
        if (target?.feed && FEED_PLATFORMS.has(target.platform) && !post) {
            const r = await addAccountSources(db, mentorId, { platform: target.platform, feed: target.feed }, url, { userId: input.userId, deadline })
            added += r.sources.length
            if (r.sources.length === 0 && r.already) return          // 이미 넣어 둔 계정 = 실패로 세지 않는다
            if (r.sources.length === 0) await fail(url, r.reason || '읽을 글을 못 찾았어요', r.code)
            else if (r.failed > 0) failed += r.failed
            return
        }

        // 그 밖 = 글 하나 (블로그 글 하나 주소면 그 글)
        try {
            await assertRoomForMore(db, mentorId, { url: post ?? url })
            await addLinkSource(db, mentorId, post ?? url, { userId: input.userId })
            added++
        } catch (e) {
            await fail(url, e instanceof Error ? e.message : '읽지 못했어요', e instanceof LinkReadError ? e.code : undefined)
        }
    }

    // 느린 링크 읽기를 먼저 띄우고, 그동안 붙여넣은 글을 넣는다
    const linkJobs = urls.map(url => oneLink(url).catch(async e => { console.warn('[os/knowledge] 초안 링크 실패', { mentorId, url, reason: e instanceof Error ? e.message : e }); await fail(url, '읽는 중 문제가 생겼어요', 'unknown') }))
    for (const [i, text] of input.pastes.entries()) {
        await tryAdd('paste', () => addTextSource(db, mentorId, input.pastes.length > 1 ? `붙여넣은 글 ${i + 1}` : '붙여넣은 글', text))
    }
    await Promise.allSettled(linkJobs)
    return { added, failed, failures }
}

/**
 * 못 읽은 자료 다시 읽기 (「다시 시도」). 주인 확인은 부르는 쪽에서 먼저 한다.
 *   파일 = 조각을 비우고 「기다리는 중」으로 돌린다 → 화면이 기존 창구(/api/creator/knowledge/process)를 다시 부른다 (mode: 'process')
 *   링크, 유튜브 = 다시 읽어 새 자료로 넣고, 성공하면 못 읽은 옛 자료를 뺀다 (mode: 'done')
 *   글 = 저장된 원문으로 다시 조각을 만든다 (mode: 'done')
 * 실패하면 이유를 던진다. 옛 자료는 그대로 남아 다시 시도할 수 있다.
 */
export async function retryBotSource(db: SupabaseClient, mentorId: string, sourceId: string, opts: { userId?: string } = {}): Promise<{ mode: 'process' | 'done'; sourceId: string }> {
    const { data, error } = await db
        .from('knowledge_sources')
        .select('id, title, source_type, original_url, content, processing_status, chunk_count, source_kind')
        .eq('id', sourceId)
        .eq('mentor_id', mentorId)       // 🔒 다른 봇의 자료 번호를 적어 보내도 안 된다
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('그 자료를 못 찾았어요')
    const row = data as { id: string; title: string; source_type: BotSourceType; original_url: string | null; content: string | null; processing_status: string; chunk_count: number | null; source_kind: string | null }
    if (!isUnusableSource(row.processing_status, row.chunk_count)) throw new Error('이미 다 읽은 자료예요')

    const path = row.original_url ?? ''
    if (path && !/^https?:\/\//i.test(path)) {
        // 파일: 남은 조각을 비우고 처음부터 다시 읽게 한다
        await db.from('knowledge_chunks').delete().eq('source_id', row.id)
        const { error: upErr } = await db.from('knowledge_sources')
            .update({ processing_status: 'pending', chunk_count: 0, [FAIL_REASON_COL]: null, [LEGACY_FAIL_REASON_COL]: null })
            .eq('id', row.id).eq('mentor_id', mentorId)
        if (upErr) throw new Error(upErr.message)
        return { mode: 'process', sourceId: row.id }
    }

    let fresh: { id: string }
    if (path) {
        fresh = await addLinkSource(db, mentorId, path, { userId: opts.userId }) as { id: string }
    } else if ((row.content ?? '').trim().length >= 10) {
        try {
            fresh = await addKnowledgeSource(db, mentorId, row.title, row.content as string, row.source_type, undefined, {
                meta: row.source_kind ? { sourceKind: row.source_kind } : undefined,
            }) as { id: string }
        } catch (e) {
            throw new Error(failReasonLine(e))
        }
    } else {
        throw new Error('다시 읽을 원본이 없어요. 빼고 다시 넣어 주세요')
    }
    await removeBotSource(db, mentorId, row.id)
    return { mode: 'done', sourceId: fresh.id }
}

/** 자료 하나 빼기 (조각까지 같이 지운다). 주인 확인은 부르는 쪽에서 먼저 한다 */
export async function removeBotSource(db: SupabaseClient, mentorId: string, sourceId: string) {
    const { data: source, error } = await db
        .from('knowledge_sources')
        .select('id, original_url, source_type')
        .eq('id', sourceId)
        .eq('mentor_id', mentorId)       // 🔒 다른 봇의 자료 번호를 적어 보내도 안 지워진다
        .maybeSingle()
    if (error) throw new Error(error.message)
    if (!source) throw new Error('그 자료를 못 찾았어요')

    const path = (source as { original_url: string | null }).original_url
    if (path && !path.startsWith('http')) {
        await db.storage.from('knowledge-files').remove([path])
    }
    await db.from('knowledge_chunks').delete().eq('source_id', sourceId)
    const { error: delErr } = await db.from('knowledge_sources').delete().eq('id', sourceId).eq('mentor_id', mentorId)
    if (delErr) throw new Error(delErr.message)
}

/**
 * 답에 쓴 자료의 출처(제목)를 찾는다.
 * 검색 함수(match_knowledge)는 글 조각만 돌려주고 어느 파일인지 안 알려준다.
 * 그래서 조각 글로 되짚어 원장(knowledge_sources)의 제목을 찾는다.
 */
export async function findSourcesOfChunks(
    db: SupabaseClient, mentorId: string, chunkTexts: string[],
): Promise<{ id: string; title: string }[]> {
    const texts = chunkTexts.map(t => (t ?? '').trim()).filter(Boolean).slice(0, 5)
    if (texts.length === 0) return []
    const { data: chunks, error } = await db
        .from('knowledge_chunks')
        .select('source_id, content')
        .eq('mentor_id', mentorId)
        .in('content', texts)
    if (error || !chunks) return []
    const ids = [...new Set((chunks as { source_id: string }[]).map(c => c.source_id).filter(Boolean))]
    if (ids.length === 0) return []
    const { data: sources } = await db
        .from('knowledge_sources')
        .select('id, title')
        .eq('mentor_id', mentorId)
        .in('id', ids)
    return ((sources ?? []) as { id: string; title: string }[]).map(s => ({ id: s.id, title: s.title }))
}
