// 봇 「내 SNS 연결」 (대표 확정 1006). 서버 전용.
//
// 봇 주인이 SNS 주소 4칸(인스타그램, 블로그, 유튜브, 큐리어스)을 적으면
//   ① 봇 소개 화면에 링크로 보인다 = mentors.links (이미 공개 칸. 다른 링크는 그대로 둔다)
//   ② 「배우기」를 누르면(그리고 하루 1번 자동으로 새 글만) 공개 글을 읽어 그 봇의 자료로 넣는다
//      = 이미 있는 「계정 연결」(knowledge_feeds + syncFeed)에 sns_slot 칸을 붙여 그 위에서 돈다. 매일 도는 크론도 같은 것(/api/cron/feeds)
//
// 칸마다 읽는 길 (공개 글만, 공식 길만. 몰래 긁기 없음)
//   blog      네이버 블로그 = 공개 RSS https://rss.blog.naver.com/{아이디}.xml, 다른 블로그 = RSS, Atom 주소. 최근 20개
//   youtube   채널 공개 피드(videos.xml?channel_id=UC…)의 제목과 설명만. 자막은 공식으로 받을 길이 없어(captions API 는 영상 주인 로그인 필요) 안 쓴다
//             @핸들 → 채널 번호는 공식 YouTube Data API(channels.list forHandle, 열쇠 YOUTUBE_API_KEY)로만 푼다. 열쇠가 없으면 채널 주소를 받는다
//   curious   큐리어스 화면이 부르는 공개 창구(/api/v2, 읽기만)로 그 화면 하나 (리더 소개, 글, 어울림 소개)
//   instagram 메타 공식 API(인스타그램 로그인 + 앱 심사)가 있어야 한다. 지금은 주소 저장과 소개 링크까지만 = 「곧 열려요」
//
// 지키는 것
//   - 밖으로 나가는 요청은 전부 fetchPageSafely(사설 주소 차단, 크기와 시간 한도)를 지난다. 주소는 저장 전에 isSafeFetchUrl 로 한 번 더 본다
//   - 같은 글(주소)은 두 번 넣지 않는다 (syncFeed 가 이미 지킨다)
//   - 글 하나 최대 SNS_ITEM_MAX_CHARS, 봇 하나 SNS 자료 총량 SNS_LEARN_CAP(요금제별), 한 곳 30개와 자료 칸 10개(기존 규칙)
//   - 실패는 연결 줄(last_error, status)에 남는다. 던지지 않는다

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSafeFetchUrl, htmlToText } from '@/domains/agent/fetch-url'
import { parseCuriousUrl, curiousPageUrl } from '@/domains/knowledge/curious-reader'
import { 링크정리, type CreatorLink } from '@/domains/creator/links'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from './readers'
import { assertBotOwned, BotNotMine } from './knowledge'
import { linkLabelOf } from './link-rules'
import { classifySnsLink } from './sns-link'
import { readPlanId } from './usage-db'
import type { PlanId } from './plan'
import { listFeeds, createFeed, deleteFeed } from './feeds/store'
import { syncFeed, type SyncResult } from './feeds/sync'
import { fetchFeed, newerThan, newestFirst, pickCandidates } from './feeds/rss'
import { fetchPodcastItems } from './feeds/podcast'
import { resolveChannelInput, channelFeedUrl, channelIdByApi } from './feeds/youtube'
import type { FeedItem, FeedKind, FetchNewItems, KnowledgeFeed, SnsSlot } from './feeds/types'

export type { SnsSlot }

/** 화면 순서 그대로 */
export const SNS_SLOTS: readonly SnsSlot[] = ['instagram', 'blog', 'youtube', 'curious']
/** 배우기가 되는 칸 (인스타그램은 메타 심사 전까지 「곧 열려요」) */
export const SNS_LEARNABLE: readonly SnsSlot[] = ['blog', 'youtube', 'curious']
export const SNS_SLOT_LABEL: Record<SnsSlot, string> = { instagram: '인스타그램', blog: '블로그', youtube: '유튜브', curious: '큐리어스' }
/** mentors.links 의 kind (creator/links.ts LINK_KINDS 와 같은 글자) */
const LINK_KIND: Record<SnsSlot, string> = { instagram: 'instagram', blog: 'blog', youtube: 'youtube', curious: 'curious' }

/** 봇 하나가 SNS 에서 배운 자료 총량 (요금제별). 한 곳 30개, 자료 칸 10개 규칙은 따로 그대로 */
export const SNS_LEARN_CAP: Record<PlanId, number> = { free: 20, basic: 60, pro: 90 }
/** 블로그 한 번에 읽는 최근 글 수 */
export const SNS_BLOG_MAX_POSTS = 20
/** 유튜브 한 번에 보는 최근 영상 수 (공개 피드가 15개를 준다) */
export const SNS_YOUTUBE_MAX_VIDEOS = 15
/** 글 하나 최대 글자 */
export const SNS_ITEM_MAX_CHARS = 20_000
export const INSTAGRAM_COMING_SOON = '인스타그램 배우기는 곧 열려요. 지금은 소개 화면에 링크로 보여요'

/** 주소가 틀렸을 때. field = 어느 칸인지 (화면이 그 칸에 빨간 글씨를 단다) */
export class SnsInputError extends Error {
    constructor(public readonly field: SnsSlot, message: string) { super(message) }
}

/** sns_slot 칸이 아직 없다(마이그레이션 20261022 전). API 는 「준비 중」으로 바꾼다 */
export class SnsNotReady extends Error {
    constructor() { super('SNS 연결은 준비 중이에요. 잠시 후 다시 해 주세요') }
}

export function isSnsSlot(v: unknown): v is SnsSlot {
    return typeof v === 'string' && (SNS_SLOTS as readonly string[]).includes(v)
}

/* ─────────────────────────── 1. 주소 검증 ─────────────────────────── */

export interface SnsNormalized {
    /** 소개 화면에 걸 주소 */
    publicUrl: string
    /** 배우기에 쓰는 연결 (인스타그램은 null) */
    fetch: { kind: FeedKind; handleOrUrl: string } | null
}

export interface NormalizeOptions {
    /** 유튜브 @핸들 → 채널 번호(UC…). 기본 = 공식 YouTube Data API (열쇠 없으면 null) */
    resolveYoutubeHandle?: (pageUrl: string) => Promise<string | null>
}

async function officialYoutubeHandle(pageUrl: string): Promise<string | null> {
    const key = process.env.YOUTUBE_API_KEY
    if (!key) return null
    try { return await channelIdByApi(pageUrl, key) } catch { return null }
}

function toUrl(slot: SnsSlot, t: string): URL {
    if (t.length > 300) throw new SnsInputError(slot, '주소가 너무 길어요')
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t)) throw new SnsInputError(slot, 'http, https 주소만 넣을 수 있어요')
    try { return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`) } catch { throw new SnsInputError(slot, '주소 모양이 이상해요') }
}

/**
 * 적은 것 → 소개 링크 주소 + 배우기 연결. 비면 null(지우기). 틀리면 SnsInputError.
 * 밖에 나가는 건 유튜브 @핸들을 공식 API 로 풀 때 하나뿐이다.
 */
export async function normalizeSnsInput(slot: SnsSlot, raw: unknown, opts: NormalizeOptions = {}): Promise<SnsNormalized | null> {
    const t = String(raw ?? '').trim()
    if (!t) return null

    if (slot === 'instagram') {
        const handle = /^@?[A-Za-z0-9._]{1,30}$/.test(t) && !t.includes('/') ? t.replace(/^@/, '') : (() => {
            const u = toUrl(slot, t)
            const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
            if (host !== 'instagram.com') throw new SnsInputError(slot, '인스타그램 주소를 넣어 주세요. 예: instagram.com/아이디')
            const parts = u.pathname.split('/').filter(Boolean)
            if (parts.length !== 1 || ['p', 'reel', 'reels', 'stories', 'explore', 'tv'].includes(parts[0].toLowerCase())) {
                throw new SnsInputError(slot, '글 하나 주소 말고 계정 주소를 넣어 주세요. 예: instagram.com/아이디')
            }
            return parts[0]
        })()
        if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) throw new SnsInputError(slot, '인스타그램 아이디를 확인해 주세요')
        return { publicUrl: `https://www.instagram.com/${handle}/`, fetch: null }
    }

    if (slot === 'youtube') {
        const r = resolveChannelInput(t)
        if (!r) throw new SnsInputError(slot, '유튜브 채널 주소를 넣어 주세요. 예: youtube.com/@채널 (영상 하나 주소는 안 돼요)')
        if ('channelId' in r) {
            const url = `https://www.youtube.com/channel/${r.channelId}`
            return { publicUrl: url, fetch: { kind: 'youtube', handleOrUrl: url } }
        }
        const id = await (opts.resolveYoutubeHandle ?? officialYoutubeHandle)(r.pageUrl)
        if (!id || !/^UC[A-Za-z0-9_-]{22}$/.test(id)) {
            throw new SnsInputError(slot, '이 채널을 지금 못 알아봐요. 채널 주소(youtube.com/channel/UC…)로 넣어 주세요')
        }
        return { publicUrl: r.pageUrl, fetch: { kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${id}` } }
    }

    if (slot === 'curious') {
        const u = toUrl(slot, t)
        const target = parseCuriousUrl(u.toString())
        if (!target || target.kind === 'community') throw new SnsInputError(slot, '큐리어스 리더 화면이나 글 주소를 넣어 주세요. 예: curious-500.com/v2/creator/번호')
        const url = curiousPageUrl(target)
        if (!isSafeFetchUrl(url)) throw new SnsInputError(slot, '열 수 없는 주소예요')
        return { publicUrl: url, fetch: { kind: 'website', handleOrUrl: url } }
    }

    // blog: 네이버 블로그, 티스토리, 브런치/미디엄 RSS, Substack, 그리고 RSS, Atom 주소. 이미 있는 링크 가르기(classifySnsLink)를 그대로 쓴다
    toUrl(slot, t)
    let target: ReturnType<typeof classifySnsLink>
    try { target = classifySnsLink(t) } catch (e) { throw new SnsInputError(slot, e instanceof Error ? e.message : '주소를 확인해 주세요') }
    const feed = target.feed
    if (!feed || (feed.kind !== 'podcast' && feed.kind !== 'substack')) {
        throw new SnsInputError(slot, '블로그 RSS 주소를 넣어 주세요. 네이버 블로그는 blog.naver.com/아이디 만 넣으면 돼요')
    }
    const fetchUrl = feed.kind === 'podcast' ? feed.handleOrUrl : target.url
    if (!isSafeFetchUrl(/^https?:\/\//i.test(fetchUrl) ? fetchUrl : `https://${fetchUrl}`)) throw new SnsInputError(slot, '열 수 없는 주소예요. 공개된 주소만 넣어 주세요')
    return { publicUrl: target.url, fetch: { kind: feed.kind, handleOrUrl: fetchUrl } }
}

/* ─────────────────────────── 2. 주인 확인 ─────────────────────────── */

/** 팀 칸 번호(team_bots.id) → 봇 번호(mentor_id). 내 팀 칸이고 내가 만든 봇일 때만. 아니면 BotNotMine */
export async function resolveOwnedBot(db: SupabaseClient, userId: string, teamBotId: string): Promise<string> {
    if (!userId || !teamBotId) throw new BotNotMine()
    const { data, error } = await db.from('team_bots').select('mentor_id').eq('id', teamBotId).eq('user_id', userId).maybeSingle()
    if (error) throw new Error(error.message)
    const mentorId = (data as { mentor_id?: string } | null)?.mentor_id
    if (!mentorId) throw new BotNotMine()
    await assertBotOwned(db, userId, mentorId)
    return mentorId
}

/* ─────────────────────────── 3. 가져오기 (칸마다) ─────────────────────────── */

const clip = (items: FeedItem[]): FeedItem[] => items.map(i => ({ ...i, text: (i.text ?? '').slice(0, SNS_ITEM_MAX_CHARS) }))

/** 블로그: 기존 RSS 가져오기. 첫 배우기에도 최근 20개까지 (기존은 첫 연결 10개) */
const fetchSnsBlog: FetchNewItems = async (feed, since, opts = {}) => {
    const r = await fetchPodcastItems(feed, since ?? new Date(0), { ...opts, maxItems: Math.min(opts.maxItems ?? Infinity, SNS_BLOG_MAX_POSTS) })
    return { ...r, items: clip(r.items) }
}

/** 유튜브: 공식 공개 피드의 제목과 설명만. 채널 번호가 저장돼 있어야 한다(채널 페이지를 긁지 않는다) */
const fetchSnsYoutube: FetchNewItems = async (feed, since, opts = {}) => {
    const r = resolveChannelInput(feed.handleOrUrl)
    if (!r || !('channelId' in r)) throw new Error('유튜브 채널 번호를 몰라요. 채널 주소를 다시 저장해 주세요')
    let why = '모양이 이상해요'
    for (let attempt = 0; attempt < 2; attempt++) {
        const f = await fetchFeed(channelFeedUrl(r.channelId))
        if (f && 'entries' in f) {
            const all = newestFirst(f.entries.map(e => {
                const desc = htmlToText(e.description || e.content || '')
                return { title: (e.title || '제목 없는 영상').slice(0, 120), url: e.url, publishedAt: e.publishedAt, text: desc ? `${e.title}\n\n${desc}` : e.title }
            }))
            const items = pickCandidates(newerThan(all, since), opts, SNS_YOUTUBE_MAX_VIDEOS)
            const noDesc = items.filter(i => i.text === i.title).length
            return { items: clip(items), note: noDesc ? `${noDesc}개 영상은 설명이 없어 제목만 있어요` : undefined }
        }
        why = f && 'error' in f ? f.error : why
    }
    throw new Error(`유튜브 새 영상 목록을 지금 못 열었어요(${why}). 내일 다시 해 볼게요`)
}

/** 큐리어스: 그 화면 하나를 공개 창구로 읽는다 (readUrl 의 curious 길, 요청은 fetchPageSafely) */
const fetchSnsCurious: FetchNewItems = async (feed, _since, opts = {}) => {
    if (opts.isKnown?.(feed.handleOrUrl)) return { items: [] }
    const r = await readUrl(feed.handleOrUrl, { ...KNOWLEDGE_READ_OPTIONS, maxChars: SNS_ITEM_MAX_CHARS })
    if (!r.ok) throw new Error(r.reason)
    return { items: clip([{ title: (r.title || '큐리어스').slice(0, 120), url: feed.handleOrUrl, text: r.text }]) }
}

export const SNS_FETCHERS: Record<Exclude<SnsSlot, 'instagram'>, FetchNewItems> = {
    blog: fetchSnsBlog,
    youtube: fetchSnsYoutube,
    curious: fetchSnsCurious,
}

/* ─────────────────────────── 4. 배우기 한 번 ─────────────────────────── */

async function updateFeedRow(db: SupabaseClient, feedId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await db.from('knowledge_feeds').update(patch).eq('id', feedId)
    if (error) console.error('[os/bot-sns] 연결 줄 고치기 실패', { feedId, message: error.message })
}

/** 이 봇의 SNS 연결 줄들 */
async function listSnsFeeds(db: SupabaseClient, mentorId: string): Promise<KnowledgeFeed[]> {
    return (await listFeeds(db, mentorId)).filter(f => !!f.snsSlot)
}

/** 연결 하나로 만든 자료 수 */
async function countFeedItems(db: SupabaseClient, mentorId: string, feedId: string): Promise<number> {
    const { count, error } = await db.from('knowledge_sources').select('id', { count: 'exact', head: true }).eq('mentor_id', mentorId).eq('feed_id', feedId)
    if (error) throw new Error(error.message)
    return count ?? 0
}

/** 이 봇이 SNS 연결로 배운 자료 수 (연결 줄별) */
async function countSnsItems(db: SupabaseClient, mentorId: string, feeds: KnowledgeFeed[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    for (const f of feeds) out.set(f.id, await countFeedItems(db, mentorId, f.id))
    return out
}

export function snsCapNote(cap: number): string {
    return `SNS 자료 한도(${cap}개)에 닿았어요. 요금제를 올리거나 안 쓰는 자료를 빼면 더 배워요`
}

/**
 * SNS 연결 하나를 한 번 돌린다 (주인 「배우기」, 매일 크론 둘 다). 던지지 않는다.
 * 요금제 상한을 먼저 보고, 남은 만큼만 syncFeed 에 넘긴다. 가져오기는 칸별 SNS 가져오기로 바꿔 끼운다.
 */
export async function syncSnsFeed(db: SupabaseClient, feed: KnowledgeFeed, opts: { deadline?: number } = {}): Promise<SyncResult> {
    const slot = feed.snsSlot
    const base = { feedId: feed.id, added: 0, skipped: 0, failed: 0 }
    if (!slot || slot === 'instagram') return { ...base, ok: true, status: feed.status, lastError: INSTAGRAM_COMING_SOON, note: INSTAGRAM_COMING_SOON }
    try {
        const plan = await readPlanId(db, feed.userId)
        const cap = SNS_LEARN_CAP[plan]
        const counts = await countSnsItems(db, feed.mentorId, await listSnsFeeds(db, feed.mentorId))
        const used = [...counts.values()].reduce((a, b) => a + b, 0)
        const remaining = cap - used
        if (remaining <= 0) {
            const why = snsCapNote(cap)
            await updateFeedRow(db, feed.id, { status: 'connected', last_error: why, last_synced_at: new Date().toISOString() })
            return { ...base, ok: true, status: 'connected', lastError: why, note: why }
        }
        const label = slot === 'blog' ? linkLabelOf(feed.handleOrUrl) : SNS_SLOT_LABEL[slot]
        return await syncFeed(db, feed, {
            deadline: opts.deadline,
            fetchers: { [feed.kind]: SNS_FETCHERS[slot] },
            maxNew: remaining,
            source: { titlePrefix: `[${label}]`, sourceKind: `sns_${slot}` },
        })
    } catch (e) {
        const why = e instanceof Error && e.message ? e.message : '배우지 못했어요'
        console.error('[os/bot-sns] syncSnsFeed', { feedId: feed.id, why })
        await updateFeedRow(db, feed.id, { status: 'error', last_error: why, last_synced_at: new Date().toISOString() })
        return { ...base, ok: false, status: 'error', lastError: why, note: why }
    }
}

/* ─────────────────────────── 5. 읽기, 저장, 배우기 ─────────────────────────── */

export type SnsAccountStatus = 'empty' | 'coming_soon' | 'needs_save' | 'ready' | 'learned' | 'error'

export interface SnsAccountView {
    slot: SnsSlot
    label: string
    /** 소개 화면에 보이는 주소 (없으면 null) */
    url: string | null
    /** 지금 「배우기」를 누를 수 있나 */
    canLearn: boolean
    status: SnsAccountStatus
    lastLearnedAt: string | null
    learnedCount: number
    /** 사람에게 보여 줄 한 줄 (실패 이유, 안내) */
    lastError: string | null
}

export interface BotSnsView {
    accounts: SnsAccountView[]
    total: { learnedCount: number; cap: number; plan: PlanId }
}

async function readLinks(db: SupabaseClient, mentorId: string): Promise<CreatorLink[]> {
    const { data, error } = await db.from('mentors').select('links').eq('id', mentorId).maybeSingle()
    if (error) throw new Error(error.message)
    return 링크정리((data as { links?: unknown } | null)?.links)
}

/** 칸 4개의 주소, 상태, 배운 수 + 요금제 상한 */
export async function readBotSns(db: SupabaseClient, mentorId: string, plan: PlanId): Promise<BotSnsView> {
    const [links, feeds] = await Promise.all([readLinks(db, mentorId), listSnsFeeds(db, mentorId)])
    const counts = await countSnsItems(db, mentorId, feeds)
    const accounts = SNS_SLOTS.map((slot): SnsAccountView => {
        const url = links.find(l => l.kind === LINK_KIND[slot])?.url ?? null
        const feed = feeds.find(f => f.snsSlot === slot)
        const view = { slot, label: SNS_SLOT_LABEL[slot], url, canLearn: false, lastLearnedAt: null, learnedCount: 0, lastError: null }
        if (slot === 'instagram') return url ? { ...view, status: 'coming_soon', lastError: INSTAGRAM_COMING_SOON } : { ...view, status: 'empty' }
        if (!feed) return url ? { ...view, status: 'needs_save', lastError: '주소를 한 번 더 저장하면 배울 수 있어요' } : { ...view, status: 'empty' }
        const status: SnsAccountStatus = feed.status === 'error' ? 'error' : feed.lastSyncedAt ? 'learned' : 'ready'
        return { ...view, url: url ?? feed.handleOrUrl, canLearn: true, status, lastLearnedAt: feed.lastSyncedAt ?? null, learnedCount: counts.get(feed.id) ?? 0, lastError: feed.lastError ?? null }
    })
    return {
        accounts,
        total: { learnedCount: [...counts.values()].reduce((a, b) => a + b, 0), cap: SNS_LEARN_CAP[plan], plan },
    }
}

export type SnsInput = Partial<Record<SnsSlot, string | null>>

/**
 * 주소 저장. input 에 있는 칸만 바꾼다(null, 빈 글자 = 지우기).
 * 전부 먼저 검증하고(하나라도 틀리면 아무것도 안 바꾼다) → 연결 줄 → 공개 링크 순서.
 * 지운 칸의 연결 줄은 빼지만 이미 배운 자료는 남는다(deleteFeed 기본).
 */
export async function saveBotSns(db: SupabaseClient, a: { userId: string; mentorId: string; input: SnsInput }, opts: NormalizeOptions = {}): Promise<void> {
    const changes: [SnsSlot, SnsNormalized | null][] = []
    for (const slot of SNS_SLOTS) {
        if (!(slot in a.input)) continue
        changes.push([slot, await normalizeSnsInput(slot, a.input[slot], opts)])
    }
    if (changes.length === 0) return

    // 공개 링크: 그 종류의 첫 링크만 바꾼다(리더가 따로 넣은 두 번째 블로그 등은 그대로)
    const links = await readLinks(db, a.mentorId)
    for (const [slot, n] of changes) {
        const i = links.findIndex(l => l.kind === LINK_KIND[slot])
        if (i >= 0) links.splice(i, 1)
        if (n) links.push({ kind: LINK_KIND[slot], url: n.publicUrl })
    }
    const cleaned = 링크정리(links)
    if (cleaned.length < links.length) throw new SnsInputError(changes[changes.length - 1][0], '링크는 8개까지 넣을 수 있어요. 소개 화면 링크를 하나 빼 주세요')

    const all = await listFeeds(db, a.mentorId)
    for (const [slot, n] of changes) {
        const mine = all.find(f => f.snsSlot === slot)
        const want = n?.fetch ?? null
        if (!want) {
            if (mine) await deleteFeed(db, a.mentorId, mine.id, false)
            continue
        }
        const same = (f: KnowledgeFeed) => f.kind === want.kind && f.handleOrUrl.trim().toLowerCase() === want.handleOrUrl.toLowerCase()
        if (mine && same(mine)) continue
        if (mine) {
            const { error } = await db.from('knowledge_feeds').update({ kind: want.kind, handle_or_url: want.handleOrUrl, status: 'connected', last_error: null, last_synced_at: null, item_count: 0 })
                .eq('id', mine.id).eq('mentor_id', a.mentorId)
            if (error) throw new Error(error.message)
            continue
        }
        // 「계정 연결」로 이미 붙여 둔 같은 곳이면 그 줄을 SNS 칸으로 쓴다(두 번 붙이지 않는다)
        const adopt = all.find(f => !f.snsSlot && same(f))
        const feedId = adopt ? adopt.id : (await createFeed(db, { userId: a.userId, mentorId: a.mentorId, kind: want.kind, handleOrUrl: want.handleOrUrl })).id
        const { error } = await db.from('knowledge_feeds').update({ sns_slot: slot }).eq('id', feedId).eq('mentor_id', a.mentorId)
        if (error?.code === '42703') {
            // 칸이 없으면 방금 만든 줄을 되돌리고 「준비 중」 (SNS 표시 없는 연결이 남지 않게)
            if (!adopt) await deleteFeed(db, a.mentorId, feedId, false)
            throw new SnsNotReady()
        }
        if (error) throw new Error(error.message)
    }

    const { error } = await db.from('mentors').update({ links: cleaned }).eq('id', a.mentorId)
    if (error) throw new Error(error.message)
}

export interface SnsLearnResult {
    slot: SnsSlot
    ok: boolean
    added: number
    skipped: number
    failed: number
    note: string | null
}

/** 「지금 배우기」: 고른 칸(없으면 배울 수 있는 칸 전부)을 차례로 한 번씩. 시간 한도를 넘기면 남은 칸은 다음에 */
export async function learnBotSns(db: SupabaseClient, a: { mentorId: string; slots?: SnsSlot[]; deadline?: number }): Promise<SnsLearnResult[]> {
    const want = (a.slots?.length ? a.slots : SNS_LEARNABLE).filter(s => SNS_LEARNABLE.includes(s))
    const feeds = (await listSnsFeeds(db, a.mentorId)).filter(f => f.snsSlot && want.includes(f.snsSlot))
    const out: SnsLearnResult[] = []
    for (const slot of want) {
        const feed = feeds.find(f => f.snsSlot === slot)
        if (!feed) continue
        if (a.deadline && Date.now() > a.deadline - 5_000) {
            out.push({ slot, ok: false, added: 0, skipped: 0, failed: 0, note: '시간이 모자라 이 칸은 다음에 배워요' })
            continue
        }
        const r = await syncSnsFeed(db, feed, { deadline: a.deadline })
        out.push({ slot, ok: r.ok, added: r.added, skipped: r.skipped, failed: r.failed, note: r.note ?? r.lastError ?? null })
    }
    return out
}

/** 이 사람의 요금제 (요금제 상한 보여 주기용) */
export { readPlanId }
