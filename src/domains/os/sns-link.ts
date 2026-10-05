// SNS, 블로그 링크 연동 (대표 승인 0928 23:29). 서버 전용.
// 받은 링크를 이미 있는 「계정 연결」(feeds: 유튜브 채널, 네이버 블로그 RSS, 티스토리 RSS, RSS, 일반 웹)로 읽어 그 사람 봇의 자료에 넣는다.
// 대표 결정 0929 00:54 「SNS 주소만 넣으면 나처럼 말하는 AI」: 네이버 블로그와 브런치도 다시 자동으로 읽는다.
//   못 읽었을 때만 「대표 글 3편 붙여넣기」(pasteSnsPosts)를 보탬으로 연다.
//   인스타그램, 스레드는 공개 계정이면 자동으로 읽는다(0929 readers/instagram, threads). 못 읽으면(비공개) 캡처나 붙여넣기.
//   페이스북은 캡처 올리기나 글 붙여넣기로 받는다(대표 결정 0929). X, 틱톡은 링크만 저장한다(준비 중).
// 자료가 실제로 들어갔을 때만 클로버 50개를 계정당 한 번, 같은 주소로는 한 계정만 준다
//   (DB 함수 grant_sns_link_bonus_keyed 가 계정 중복과 주소 중복을 막는다).
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveChannelInput } from './feeds/youtube'
import { youtubeVideoId } from './readers/youtube'
import { MIN_TEXT_CHARS, MAX_PASTE_CHARS, MAX_PASTE_POSTS, TOO_SHORT_LINE, FULL_LINE, accountKeyOf, enoughText, failCodeOfReason, isLinkFailCode, canRetry, type LinkFailCode } from './link-rules'
import { isMarketHost } from '@/domains/home/link-guide'
import { createFeed, listFeeds, syncFeed, loadExistingSources, type FeedKind } from './feeds'
import { isSafeFetchUrl } from '@/domains/agent/fetch-url'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from './readers'
import { isMediumHost, isMediumPostUrl, mediumFeedUrl } from './readers/medium'
import { detectBlogKind } from './feeds/blog'
import { markInjectionPatterns } from '@/domains/chat/injection'
import { addKnowledgeSource } from '@/domains/knowledge'
import { saveSocialPosts } from './social-store'
import { addImageNotes } from './image-enrich'
import { MAX_SOURCES_PER_BOT, addTextSource, addLinkSource, assertRoomForMore } from './knowledge'
import { parseScreenshotImages, readScreenshots } from './screenshot-read'
import { snsLabelOf } from './sns-capture'
import { bootstrapDefaultTeam } from './team'
import { JOBS } from './presets'
import { firstJobFor, SNS_BONUS_CLOVERS, SNS_KEY_TAKEN_LINE, SNS_PASTE_LINE, SNS_CAPTURE_LINE, SNS_NO_READ_LINE, SNS_PENDING_LINE, SNS_READ_LINE, SNS_SUCCESS_LINE } from './onboarding'

export type SnsPlatform = 'youtube' | 'naver_blog' | 'brunch' | 'tistory' | 'substack' | 'medium' | 'wordpress' | 'rss' | 'website' | 'linkedin' | 'instagram' | 'threads' | 'x' | 'tiktok' | 'facebook' | 'market'

/** 붙여넣기 한 편 최소 글자, 최대 편수. 어느 입구든 같은 값 (link-rules.ts, 1005) */
export const PASTE_MIN_CHARS = MIN_TEXT_CHARS
export const PASTE_MAX_POSTS = MAX_PASTE_POSTS
export const PASTE_MAX_CHARS = MAX_PASTE_CHARS

export interface SnsTarget {
    url: string
    platform: SnsPlatform
    /** 읽을 수 있으면 계정 연결 종류와 넣을 값, 못 읽으면 null (준비 중) */
    feed: { kind: FeedKind; handleOrUrl: string } | null
    /** 대표 글 붙여넣기를 받을 수 있는 곳. feed 가 있으면 자동으로 읽고, 못 읽었을 때만 붙여넣기를 연다 */
    paste?: boolean
    /** 글, 영상 하나를 그 자리에서 읽는 곳 (인스타그램, 스레드, 유튜브 영상 하나). 계정 연결(feed)이 아니다 */
    single?: boolean
}

/** 링크 모양으로 어디인지, 읽을 수 있는지 가린다. 모양이 틀리면 사람 말로 던진다 */
export function classifySnsLink(raw: unknown): SnsTarget {
    const t = String(raw ?? '').trim()
    if (!t) throw new Error('주소를 넣어 주세요')
    if (t.length > 300) throw new Error('주소가 너무 길어요')
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^https?:\/\//i.test(t)) throw new Error('http, https 주소만 넣을 수 있어요')
    let u: URL
    try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`) } catch { throw new Error('주소 모양이 이상해요') }
    if (!/^https?:$/.test(u.protocol)) throw new Error('http, https 주소만 넣을 수 있어요')
    const url = u.toString()
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    const is = (h: string) => host === h || host.endsWith(`.${h}`)

    // 인스타그램, 스레드 = 공개 계정은 자동으로 읽고(connectSnsLink), 못 읽으면 캡처나 붙여넣기. 페이스북 = 캡처나 붙여넣기
    if (is('instagram.com')) return { url, platform: 'instagram', feed: null, paste: true, single: true }
    if (is('threads.net') || is('threads.com')) return { url, platform: 'threads', feed: null, paste: true, single: true }
    // X, 링크드인 = 글을 읽지 않는다 (로그인 없이 읽는 안전한 길이 없다). 글 붙여넣기, 캡처 안내만
    if (is('x.com') || is('twitter.com')) return { url, platform: 'x', feed: null, paste: true }
    if (is('linkedin.com') || is('lnkd.in')) return { url, platform: 'linkedin', feed: null, paste: true }
    if (is('tiktok.com')) return { url, platform: 'tiktok', feed: null }
    if (is('facebook.com') || is('fb.com')) return { url, platform: 'facebook', feed: null, paste: true }

    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
        // 영상 하나 주소도 받는다 (초안 길과 같은 규칙, 1005). 채널 주소는 최근 영상을 읽는다
        if (youtubeVideoId(url)) return { url, platform: 'youtube', feed: null, single: true, paste: true }
        if (!resolveChannelInput(url)) throw new Error('유튜브 영상이나 채널(@핸들) 주소를 넣어 주세요')
        return { url, platform: 'youtube', feed: { kind: 'youtube', handleOrUrl: url } }
    }
    if (host === 'blog.naver.com' || host === 'rss.blog.naver.com') {
        const id = (u.searchParams.get('blogId') || u.pathname.split('/').filter(Boolean)[0] || '').replace(/\.xml$/, '')
        if (!/^[A-Za-z0-9_-]{2,40}$/.test(id) || /\.naver$/i.test(id)) throw new Error('네이버 블로그 주소를 확인해 주세요. 예: blog.naver.com/아이디')
        // 공개 RSS 로 읽는다(대표 결정 0929). 못 읽으면 붙여넣기
        return { url: `https://blog.naver.com/${id}`, platform: 'naver_blog', feed: { kind: 'podcast', handleOrUrl: `https://rss.blog.naver.com/${id}.xml` }, paste: true }
    }
    // 브런치: 작가 화면에 숨은 RSS 링크(link rel=alternate)를 찾아 읽는다(website 읽기). 글 하나 주소(/@작가/번호)는 그 글만. 못 읽으면 붙여넣기
    if (is('brunch.co.kr')) {
        const parts = u.pathname.split('/').filter(Boolean)
        if (parts[0] === 'rss' || parts[0] === 'atom') return { url, platform: 'brunch', feed: { kind: 'podcast', handleOrUrl: url }, paste: true }
        if (parts[0]?.startsWith('@') && /^\d+$/.test(parts[1] ?? '')) return { url, platform: 'brunch', feed: null, paste: true, single: true }
        return { url, platform: 'brunch', feed: { kind: 'website', handleOrUrl: url }, paste: true }
    }
    // 미디엄: 계정, 매체는 공식 RSS (medium.com/feed/@계정). 글 하나는 그 글만 (막히면 RSS 안에서 찾는다)
    if (isMediumHost(host)) {
        if (isMediumPostUrl(url)) return { url, platform: 'medium', feed: null, paste: true, single: true }
        const feedUrl = mediumFeedUrl(url)
        if (!feedUrl) throw new Error('미디엄 계정이나 매체 주소를 넣어 주세요. 예: medium.com/@계정')
        return { url, platform: 'medium', feed: { kind: 'podcast', handleOrUrl: feedUrl }, paste: true }
    }
    // 큰 장터 상품(스마트스토어, 쿠팡 등)은 약관 확인 전까지 자동으로 읽지 않는다. 링크만 저장 (보너스 없음)
    if (isMarketHost(host)) return { url, platform: 'market', feed: null }
    // 티스토리는 주인이 켠 공식 RSS(/rss). robots.txt 도 막지 않는다
    if (is('tistory.com') && host !== 'tistory.com') return { url, platform: 'tistory', feed: { kind: 'podcast', handleOrUrl: `https://${u.hostname.toLowerCase()}/rss` }, paste: true }
    if (is('substack.com')) return { url, platform: 'substack', feed: { kind: 'substack', handleOrUrl: url }, paste: true }
    if (!isSafeFetchUrl(url)) throw new Error('열 수 없는 주소예요. 공개된 주소만 넣어 주세요')
    if (/(\/(rss|feed|atom)(\.xml)?\/?$)|(\.xml$)/i.test(u.pathname)) return { url, platform: 'rss', feed: { kind: 'podcast', handleOrUrl: url }, paste: true }
    // 워드프레스닷컴 블로그, 그 밖의 블로그, 사이트 = website 읽기 (워드프레스 REST, 표준 RSS 자동 찾기, 사이트맵 순서). 글 하나인지는 connectSnsLink 가 주소와 화면을 보고 가린다
    if (accountKeyOf(url)?.startsWith('wordpress:')) return { url, platform: 'wordpress', feed: { kind: 'website', handleOrUrl: url }, paste: true }
    return { url, platform: 'website', feed: { kind: 'website', handleOrUrl: url }, paste: true }
}

/** 화면, 자료 이름에 쓸 곳 이름. 이름을 모르는 일반 사이트는 사이트 주소 */
export function targetLabel(t: SnsTarget): string {
    const l = snsLabelOf(t.url)
    if (l !== 'SNS') return l
    try { return new URL(t.url).hostname.replace(/^(www|m)\./, '') || l } catch { return l }
}

/** 블로그 글 하나를 그 자리에서 읽는 곳 (글 하나 주소) */
export const BLOG_POST_PLATFORMS: readonly SnsPlatform[] = ['website', 'wordpress', 'medium', 'brunch']

/**
 * 주소 모양만으로 모르는 블로그 주소가 글 하나인지 목록인지 가려 target 을 고친다.
 * 일반 사이트, 워드프레스닷컴 주소만. 글 하나면 그 글만 읽는다(사이트 전체를 돌지 않는다). 못 가리면 그대로(목록).
 */
export async function refineSnsTarget(t: SnsTarget): Promise<SnsTarget> {
    if ((t.platform !== 'website' && t.platform !== 'wordpress') || t.single || t.feed?.kind !== 'website') return t
    let kind: 'post' | 'account' = 'account'
    try { kind = await detectBlogKind(t.url) } catch { /* 못 열면 목록으로 본다 */ }
    return kind === 'post' ? { ...t, feed: null, single: true, paste: true } : t
}

/**
 * 같은 블로그, 채널인지 가리는 열쇠 (보너스는 한 주소에 한 계정만).
 * 네이버는 아이디, 티스토리와 Substack 은 주소 이름, 유튜브는 채널 경로, 나머지는 주소(쿼리 뺌)
 */
export function snsCanonicalKey(t: SnsTarget): string {
    const u = new URL(t.url)
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, '').toLowerCase()
    if (t.platform === 'naver_blog') return `naver:${(path.split('/')[1] || '').toLowerCase()}`
    if (t.platform === 'brunch') return `brunch:${path.split('/')[1] || ''}`
    if (t.platform === 'tistory' || t.platform === 'substack') return `${t.platform}:${host}`
    // 미디엄, 워드프레스닷컴은 계정(매체) 하나 = 열쇠 하나 (글 하나 주소도 같은 열쇠)
    if (t.platform === 'medium' || t.platform === 'wordpress') { const k = accountKeyOf(t.url); if (k) return k }
    if (t.platform === 'youtube') {
        if (t.single) return `youtube:video:${youtubeVideoId(t.url) ?? t.url}`
        const r = resolveChannelInput(t.url)
        if (r) return `youtube:${'channelId' in r ? r.channelId : decodeURIComponent(new URL(r.pageUrl).pathname).toLowerCase()}`
    }
    return `${t.platform}:${host}${path}`.slice(0, 300)
}

export interface SnsConnectResult {
    status: 'read' | 'pending' | 'failed' | 'paste'
    platform: SnsPlatform
    added: number
    bonus: number
    alreadyGranted: boolean
    /** 같은 주소로 다른 계정이 이미 보너스를 받음 */
    keyTaken?: boolean
    message: string
    balance?: number
    /** 못 읽은 이유 갈래 (화면이 「다시 시도」, 붙여넣기를 가른다) */
    code?: LinkFailCode
    /** 「다시 시도」가 도움이 되는 실패인가 */
    retry?: boolean
    /** 읽은 결과 한 줄 (예: 인스타그램 글 5개를 읽었어요) */
    summary?: string
}

type Db = SupabaseClient

/** 자료를 넣을 봇 = 온보딩이 고른 첫 봇, 없으면 맡길 일에 맞는 기본 팀 봇, 그것도 없으면 첫 봇 */
async function pickBot(db: Db, userId: string, displayName: string): Promise<string | null> {
    const { team } = await bootstrapDefaultTeam(db, { id: userId, displayName })
    if (team.length === 0) return null
    const { data: onb } = await db.from('user_onboarding').select('first_bot_mentor_id, use_cases').eq('user_id', userId).maybeSingle()
    if (onb?.first_bot_mentor_id && team.some(b => b.mentorId === onb.first_bot_mentor_id)) return onb.first_bot_mentor_id
    const job = JOBS.find(j => j.id === firstJobFor(onb?.use_cases as string[] | null))
    return (team.find(b => job && b.oneLiner === job.oneLiner) ?? team[0]).mentorId
}

export async function connectSnsLink(db: Db, a: { userId: string; displayName: string; url: unknown; source: 'onboarding' | 'settings'; deadline?: number }): Promise<SnsConnectResult> {
    const target = await refineSnsTarget(classifySnsLink(a.url))
    const now = () => new Date().toISOString()
    const { data: link, error: linkErr } = await db.from('user_sns_links')
        .upsert({ user_id: a.userId, url: target.url, platform: target.platform, source: a.source, updated_at: now() }, { onConflict: 'user_id,url' })
        .select('id, added_count').single()
    if (linkErr || !link) throw new Error('링크를 저장하지 못했어요')
    const base = { platform: target.platform, added: 0, bonus: 0, alreadyGranted: false }

    // 인스타그램, 스레드, 유튜브 영상 하나: 그 자리에서 읽는다. 읽은 글이 저장됐을 때만 보너스. 못 읽으면 이유와 함께 알린다(조용히 버리지 않는다)
    if (target.single) return readSnsSingle(db, a, target, link)
    if (target.paste && !target.feed) {
        // X, 링크드인 = 읽지 않고 붙여넣기 안내만
        if (target.platform === 'x' || target.platform === 'linkedin') {
            await db.from('user_sns_links').update({ status: 'pending', note: '글 붙여넣기', updated_at: now() }).eq('id', link.id)
            return { ...base, status: 'paste', message: SNS_NO_READ_LINE, code: 'paste', retry: false }
        }
        await db.from('user_sns_links').update({ status: 'pending', note: '캡처나 글 붙여넣기', updated_at: now() }).eq('id', link.id)
        return { ...base, status: 'paste', message: SNS_CAPTURE_LINE }
    }
    if (!target.feed) {
        await db.from('user_sns_links').update({ status: 'pending', note: '준비 중', updated_at: now() }).eq('id', link.id)
        return { ...base, status: 'pending', message: SNS_PENDING_LINE }
    }

    const mentorId = await pickBot(db, a.userId, a.displayName)
    if (!mentorId) {
        await db.from('user_sns_links').update({ status: 'failed', note: '봇이 없어요', updated_at: now() }).eq('id', link.id)
        return { ...base, status: 'failed', message: '봇을 먼저 만들어 주세요' }
    }

    let added = 0
    let note: string | null = null
    let feedId: string | null = null
    try {
        const feeds = await listFeeds(db, mentorId)
        const same = feeds.find(f => f.kind === target.feed!.kind && f.handleOrUrl.trim().toLowerCase() === target.feed!.handleOrUrl.trim().toLowerCase())
        const { count, perKey } = await loadExistingSources(db, mentorId)
        const key = accountKeyOf(target.feed.handleOrUrl)
        // 칸이 다 찼어도 이미 글이 들어 있는 블로그, 채널이면 더 가져온다 (한 곳은 칸 하나)
        if (!same && count >= MAX_SOURCES_PER_BOT && !(key && (perKey.get(key) ?? 0) > 0)) throw new Error(FULL_LINE)
        const feed = same ?? await createFeed(db, { userId: a.userId, mentorId, kind: target.feed.kind, handleOrUrl: target.feed.handleOrUrl })
        feedId = feed.id
        const sync = await syncFeed(db, feed, { deadline: a.deadline })
        added = sync.added
        if (!sync.ok || added === 0) note = sync.note || sync.lastError || '읽을 새 글이 없었어요'
    } catch (e) {
        note = e instanceof Error ? e.message : '읽지 못했어요'
    }

    const total = (link.added_count ?? 0) + added
    const status: SnsConnectResult['status'] = total > 0 ? 'read' : 'failed'
    await db.from('user_sns_links').update({
        status, mentor_id: mentorId, feed_id: feedId, added_count: total, note: added > 0 ? null : note, updated_at: now(),
    }).eq('id', link.id)
    // 자동으로 못 읽었고 붙여넣기를 받는 곳이면 붙여넣기 칸을 연다 (링크는 실패로 남아 다시 시도할 수 있다)
    const code = failCodeOfReason(note || '')
    if (status !== 'read' && target.paste) return { ...base, status: 'paste', message: note || SNS_PASTE_LINE, code, retry: canRetry(code) }
    if (status !== 'read') return { ...base, status, message: note || '읽지 못했어요', code, retry: canRetry(code) }

    return grantBonus(db, a.userId, link.id, target, { ...base, status, added, message: SNS_READ_LINE, summary: `${targetLabel(target)} 글 ${added}개를 읽었어요` })
}

/** 읽은 글 묶음의 편 수 (인스타그램, 스레드는 글 사이에 --- 줄을 둔다) */
function countPosts(text: string): number {
    return Math.max(1, text.split(/\n-{3,}\n/).filter(t => t.trim()).length)
}

/**
 * 글, 영상 하나(인스타그램, 스레드, 유튜브 영상)를 읽어 자료로 넣는다. 항상 결과를 돌려준다.
 * 글이 저장되면 보너스까지, 못 읽으면 이유 한 줄과 갈래(code)를 돌려주고 링크는 「못 읽음」으로 남긴다.
 */
async function readSnsSingle(db: Db, a: { userId: string; displayName: string; deadline?: number }, target: SnsTarget, link: { id: string; added_count: number | null }): Promise<SnsConnectResult> {
    const now = () => new Date().toISOString()
    const base = { platform: target.platform, added: 0, bonus: 0, alreadyGranted: false }
    const failWith = async (reason: string, code: LinkFailCode, mentorId?: string): Promise<SnsConnectResult> => {
        await db.from('user_sns_links').update({ status: 'failed', ...(mentorId ? { mentor_id: mentorId } : {}), note: reason.slice(0, 200), updated_at: now() }).eq('id', link.id)
        return { ...base, status: 'paste', message: reason, code, retry: canRetry(code) }
    }
    const left = (a.deadline ?? Date.now() + 40_000) - Date.now()
    if (left < 3_000) return failWith('시간이 모자라 못 읽었어요', 'timeout')
    const mentorId = await pickBot(db, a.userId, a.displayName)
    if (!mentorId) return failWith('봇을 먼저 만들어 주세요', 'unknown')
    const isBlog = BLOG_POST_PLATFORMS.includes(target.platform)
    const label = targetLabel(target)
    let added = 1
    try {
        await assertRoomForMore(db, mentorId, { url: target.url })
        if (target.platform === 'youtube') {
            await addLinkSource(db, mentorId, target.url, { userId: a.userId })
        } else {
            const first = await readUrl(target.url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: Math.min(15_000, left - 1_000), ...(isBlog ? { single: true } : {}) })
            if (!first.ok) return failWith(first.reason, isLinkFailCode(first.code) ? first.code : failCodeOfReason(first.reason), mentorId)
            if (!enoughText(first.text)) return failWith('읽은 글이 너무 짧았어요', 'empty', mentorId)
            // 사진 설명 (글마다 대표 사진 한 장). 시간이 모자라거나 실패하면 글만 저장
            const read = await addImageNotes(first, { route: '/api/os/sns-link', userId: a.userId, mentorId }, Math.min(12_000, (a.deadline ?? Date.now() + 40_000) - Date.now() - 6_000))
            if (isBlog) {
                // 블로그 글 하나 = 글 제목 그대로, 한 편. 글 속 「이전 지시 무시」류 문장에는 표식을 붙인다
                const { text } = markInjectionPatterns(read.text)
                await addKnowledgeSource(db, mentorId, (read.title || `내 ${label} 글`).slice(0, 120), `출처: ${target.url}\n\n${text}`, 'url', target.url, {
                    meta: { sourceKind: target.platform, citationUrl: target.url, authorIsMe: true, fetchedAt: now() },
                    ingest: { dedupe: true },
                })
            } else {
                added = countPosts(read.text)
                const saved = await addKnowledgeSource(db, mentorId, `내 ${label} 글`, `출처: ${target.url}\n\n${read.text}`, 'url', target.url, {
                    meta: { sourceKind: target.platform, citationUrl: target.url, authorIsMe: true, fetchedAt: now() },
                    ingest: { dedupe: true },
                }) as { id?: string; deduped?: boolean }
                if (read.social && !saved.deduped) await saveSocialPosts(db, mentorId, saved.id, read.social)
            }
        }
    } catch (e) {
        const reason = e instanceof Error ? e.message : '저장하지 못했어요'
        const code = e instanceof Error && 'code' in e && isLinkFailCode((e as { code?: unknown }).code) ? (e as { code: LinkFailCode }).code : reason === FULL_LINE ? 'full' : failCodeOfReason(reason)
        return failWith(reason, code, mentorId)
    }
    const total = (link.added_count ?? 0) + added
    await db.from('user_sns_links').update({ status: 'read', mentor_id: mentorId, added_count: total, note: null, updated_at: now() }).eq('id', link.id)
    const summary = target.platform === 'youtube' ? '유튜브 영상 1개를 읽었어요' : `${label} 글 ${added}개를 읽었어요`
    return grantBonus(db, a.userId, link.id, target, { ...base, added, status: 'read', message: SNS_READ_LINE, summary })
}

/** 자료가 저장된 링크만 보너스. 계정당 한 번, 같은 주소로는 한 계정만 */
async function grantBonus(db: Db, userId: string, linkId: string, target: SnsTarget, r: SnsConnectResult): Promise<SnsConnectResult> {
    const { data: balance, error: grantErr } = await db.rpc('grant_sns_link_bonus_keyed', { p_user: userId, p_link: linkId, p_amount: SNS_BONUS_CLOVERS, p_key: snsCanonicalKey(target) })
    if (grantErr) {
        console.error('[sns-link] 보너스 지급 실패:', grantErr.message)
        return { ...r, message: SNS_READ_LINE }
    }
    if (balance === -1) return { ...r, keyTaken: true, message: SNS_KEY_TAKEN_LINE }
    if (typeof balance === 'number') return { ...r, bonus: SNS_BONUS_CLOVERS, balance, message: SNS_SUCCESS_LINE }
    return { ...r, alreadyGranted: true, message: SNS_READ_LINE }
}

/** 붙여넣은 글 정리: 앞뒤 공백, 같은 글 한 번, 한 편 최대 글자. 짧은 글은 뺀다 */
export function cleanPastedPosts(raw: unknown): { posts: string[]; tooShort: number } {
    const list = Array.isArray(raw) ? raw : []
    const seen = new Set<string>()
    const posts: string[] = []
    let tooShort = 0
    for (const v of list.slice(0, PASTE_MAX_POSTS * 2)) {
        const t = String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, PASTE_MAX_CHARS)
        if (!t) continue
        const key = t.replace(/\s+/g, ' ')
        if (seen.has(key)) continue
        seen.add(key)
        if (!enoughText(t)) { tooShort++; continue }
        posts.push(t)
        if (posts.length >= PASTE_MAX_POSTS) break
    }
    return { posts, tooShort }
}

/**
 * 네이버 블로그, 브런치: 대표 글(최대 3편)을 붙여넣으면 한 자료로 묶어 내 봇에 넣는다(자료 칸 하나만 씀).
 * 저장되면 보너스 조건 충족 (계정당 한 번, 같은 주소 한 계정).
 */
export async function pasteSnsPosts(db: Db, a: { userId: string; displayName: string; url: unknown; posts: unknown; images?: unknown }): Promise<SnsConnectResult> {
    const target = classifySnsLink(a.url)
    if (!target.paste) throw new Error('이 주소는 주소만 넣으면 돼요')
    // 캡처가 있으면 글을 옮겨 적어 한 편으로 더한다 (300자 규칙은 똑같이 적용)
    const images = parseScreenshotImages(a.images)
    const fromImages = images.length > 0 ? await readScreenshots(images, { route: '/api/os/sns-link', userId: a.userId }) : []
    if (images.length > 0 && fromImages.length === 0 && !(Array.isArray(a.posts) && a.posts.some(p => String(p ?? '').trim()))) {
        throw new Error('캡처에서 글을 못 찾았어요. 글이 보이게 다시 캡처해 주세요')
    }
    const pastedList = [...(Array.isArray(a.posts) ? a.posts : []), ...(fromImages.length ? [fromImages.join('\n\n')] : [])]
    const { posts, tooShort } = cleanPastedPosts(pastedList)
    if (posts.length === 0) throw new Error(tooShort > 0 ? TOO_SHORT_LINE : '글을 붙여넣어 주세요')
    const now = () => new Date().toISOString()
    const { data: link, error: linkErr } = await db.from('user_sns_links')
        .upsert({ user_id: a.userId, url: target.url, platform: target.platform, source: 'settings', updated_at: now() }, { onConflict: 'user_id,url' })
        .select('id, added_count').single()
    if (linkErr || !link) throw new Error('링크를 저장하지 못했어요')
    const mentorId = await pickBot(db, a.userId, a.displayName)
    if (!mentorId) throw new Error('봇을 먼저 만들어 주세요')
    await assertRoomForMore(db, mentorId)
    const label = targetLabel(target)
    const body = posts.map((p, i) => `[글 ${i + 1}]\n${p}`).join('\n\n')
    await addTextSource(db, mentorId, `내 ${label} 대표 글 ${posts.length}편`, `출처: ${target.url}\n\n${body}`, 'sns_paste')
    const total = (link.added_count ?? 0) + posts.length
    await db.from('user_sns_links').update({ status: 'read', mentor_id: mentorId, added_count: total, note: null, updated_at: now() }).eq('id', link.id)
    return grantBonus(db, a.userId, link.id, target, { platform: target.platform, added: posts.length, bonus: 0, alreadyGranted: false, status: 'read', message: SNS_READ_LINE })
}
