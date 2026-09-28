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
import { isMarketHost } from '@/domains/home/link-guide'
import { createFeed, listFeeds, syncFeed, loadExistingSources, type FeedKind } from './feeds'
import { isSafeFetchUrl } from '@/domains/agent/fetch-url'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from './readers'
import { addKnowledgeSource } from '@/domains/knowledge'
import { MAX_SOURCES_PER_BOT, addTextSource, assertRoomForMore } from './knowledge'
import { parseScreenshotImages, readScreenshots } from './screenshot-read'
import { snsLabelOf } from './sns-capture'
import { bootstrapDefaultTeam } from './team'
import { JOBS } from './presets'
import { firstJobFor, SNS_BONUS_CLOVERS, SNS_KEY_TAKEN_LINE, SNS_PASTE_LINE, SNS_CAPTURE_LINE, SNS_PASTE_MAX_POSTS, SNS_PASTE_MIN_CHARS, SNS_PENDING_LINE, SNS_READ_LINE, SNS_SUCCESS_LINE } from './onboarding'

export type SnsPlatform = 'youtube' | 'naver_blog' | 'brunch' | 'tistory' | 'substack' | 'rss' | 'website' | 'instagram' | 'threads' | 'x' | 'tiktok' | 'facebook' | 'market'

/** 붙여넣기 한 편 최소 글자, 최대 편수 (화면과 같이 쓰도록 onboarding.ts에 둔다) */
export const PASTE_MIN_CHARS = SNS_PASTE_MIN_CHARS
export const PASTE_MAX_POSTS = SNS_PASTE_MAX_POSTS
export const PASTE_MAX_CHARS = 20_000

export interface SnsTarget {
    url: string
    platform: SnsPlatform
    /** 읽을 수 있으면 계정 연결 종류와 넣을 값, 못 읽으면 null (준비 중) */
    feed: { kind: FeedKind; handleOrUrl: string } | null
    /** 대표 글 붙여넣기를 받을 수 있는 곳. feed 가 있으면 자동으로 읽고, 못 읽었을 때만 붙여넣기를 연다 */
    paste?: boolean
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
    if (is('instagram.com')) return { url, platform: 'instagram', feed: null, paste: true }
    if (is('threads.net') || is('threads.com')) return { url, platform: 'threads', feed: null, paste: true }
    if (is('x.com') || is('twitter.com')) return { url, platform: 'x', feed: null }
    if (is('tiktok.com')) return { url, platform: 'tiktok', feed: null }
    if (is('facebook.com') || is('fb.com')) return { url, platform: 'facebook', feed: null, paste: true }

    if (host === 'youtube.com' || host === 'youtu.be') {
        if (!resolveChannelInput(url)) throw new Error('유튜브는 채널 주소(@핸들)를 넣어 주세요')
        return { url, platform: 'youtube', feed: { kind: 'youtube', handleOrUrl: url } }
    }
    if (host === 'blog.naver.com' || host === 'rss.blog.naver.com') {
        const id = (u.searchParams.get('blogId') || u.pathname.split('/').filter(Boolean)[0] || '').replace(/\.xml$/, '')
        if (!/^[A-Za-z0-9_-]{2,40}$/.test(id) || /\.naver$/i.test(id)) throw new Error('네이버 블로그 주소를 확인해 주세요. 예: blog.naver.com/아이디')
        // 공개 RSS 로 읽는다(대표 결정 0929). 못 읽으면 붙여넣기
        return { url: `https://blog.naver.com/${id}`, platform: 'naver_blog', feed: { kind: 'podcast', handleOrUrl: `https://rss.blog.naver.com/${id}.xml` }, paste: true }
    }
    // 브런치는 일반 웹처럼 읽는다(예전 그대로). 못 읽으면 붙여넣기
    if (is('brunch.co.kr')) return { url, platform: 'brunch', feed: { kind: 'website', handleOrUrl: url }, paste: true }
    // 큰 장터 상품(스마트스토어, 쿠팡 등)은 약관 확인 전까지 자동으로 읽지 않는다. 링크만 저장 (보너스 없음)
    if (isMarketHost(host)) return { url, platform: 'market', feed: null }
    // 티스토리는 주인이 켠 공식 RSS(/rss). robots.txt 도 막지 않는다
    if (is('tistory.com') && host !== 'tistory.com') return { url, platform: 'tistory', feed: { kind: 'podcast', handleOrUrl: `https://${u.hostname.toLowerCase()}/rss` } }
    if (is('substack.com')) return { url, platform: 'substack', feed: { kind: 'substack', handleOrUrl: url } }
    if (!isSafeFetchUrl(url)) throw new Error('열 수 없는 주소예요. 공개된 주소만 넣어 주세요')
    if (/(\/(rss|feed|atom)(\.xml)?\/?$)|(\.xml$)/i.test(u.pathname)) return { url, platform: 'rss', feed: { kind: 'podcast', handleOrUrl: url } }
    return { url, platform: 'website', feed: { kind: 'website', handleOrUrl: url } }
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
    if (t.platform === 'youtube') {
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
    const target = classifySnsLink(a.url)
    const now = () => new Date().toISOString()
    const { data: link, error: linkErr } = await db.from('user_sns_links')
        .upsert({ user_id: a.userId, url: target.url, platform: target.platform, source: a.source, updated_at: now() }, { onConflict: 'user_id,url' })
        .select('id, added_count').single()
    if (linkErr || !link) throw new Error('링크를 저장하지 못했어요')
    const base = { platform: target.platform, added: 0, bonus: 0, alreadyGranted: false }

    // 인스타그램, 스레드: 공개 계정이면 먼저 자동으로 읽는다. 실제로 글이 저장됐을 때만 보너스
    if (target.platform === 'instagram' || target.platform === 'threads') {
        const auto = await readSnsAuto(db, a, target, link)
        if (auto) return auto
    }
    if (target.paste && !target.feed) {
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
        const { count } = await loadExistingSources(db, mentorId)
        if (!same && count >= MAX_SOURCES_PER_BOT) throw new Error(`자료 칸이 다 찼어요(${MAX_SOURCES_PER_BOT}개). 자료를 빼고 다시 해 주세요`)
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
    if (status !== 'read' && target.paste) return { ...base, status: 'paste', message: SNS_PASTE_LINE }
    if (status !== 'read') return { ...base, status, message: note || '읽지 못했어요' }

    return grantBonus(db, a.userId, link.id, target, { ...base, status, added, message: SNS_READ_LINE })
}

/**
 * 인스타그램, 스레드 공개 계정 자동 읽기. 글이 저장되면 결과(보너스 포함), 못 읽으면 null(= 캡처, 붙여넣기로).
 */
async function readSnsAuto(db: Db, a: { userId: string; displayName: string; deadline?: number }, target: SnsTarget, link: { id: string; added_count: number | null }): Promise<SnsConnectResult | null> {
    const now = () => new Date().toISOString()
    const left = (a.deadline ?? Date.now() + 20_000) - Date.now()
    if (left < 3_000) return null
    const read = await readUrl(target.url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: Math.min(15_000, left - 1_000) })
    if (!read.ok || read.text.trim().length < 20) return null
    const mentorId = await pickBot(db, a.userId, a.displayName)
    if (!mentorId) return null
    try {
        await assertRoomForMore(db, mentorId)
        const label = snsLabelOf(target.url)
        await addKnowledgeSource(db, mentorId, `내 ${label} 글`, `출처: ${target.url}\n\n${read.text}`, 'url', target.url)
    } catch (e) {
        await db.from('user_sns_links').update({ status: 'failed', mentor_id: mentorId, note: e instanceof Error ? e.message : '저장하지 못했어요', updated_at: now() }).eq('id', link.id)
        return null
    }
    const total = (link.added_count ?? 0) + 1
    await db.from('user_sns_links').update({ status: 'read', mentor_id: mentorId, added_count: total, note: null, updated_at: now() }).eq('id', link.id)
    return grantBonus(db, a.userId, link.id, target, { platform: target.platform, added: 1, bonus: 0, alreadyGranted: false, status: 'read', message: SNS_READ_LINE })
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
        if (key.length < PASTE_MIN_CHARS) { tooShort++; continue }
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
    if (posts.length === 0) throw new Error(tooShort > 0 ? `글이 너무 짧아요. 한 편에 ${PASTE_MIN_CHARS}자 이상 넣어 주세요` : '글을 붙여넣어 주세요')
    const now = () => new Date().toISOString()
    const { data: link, error: linkErr } = await db.from('user_sns_links')
        .upsert({ user_id: a.userId, url: target.url, platform: target.platform, source: 'settings', updated_at: now() }, { onConflict: 'user_id,url' })
        .select('id, added_count').single()
    if (linkErr || !link) throw new Error('링크를 저장하지 못했어요')
    const mentorId = await pickBot(db, a.userId, a.displayName)
    if (!mentorId) throw new Error('봇을 먼저 만들어 주세요')
    await assertRoomForMore(db, mentorId)
    const label = snsLabelOf(target.url)
    const body = posts.map((p, i) => `[글 ${i + 1}]\n${p}`).join('\n\n')
    await addTextSource(db, mentorId, `내 ${label} 대표 글 ${posts.length}편`, `출처: ${target.url}\n\n${body}`, 'sns_paste')
    const total = (link.added_count ?? 0) + posts.length
    await db.from('user_sns_links').update({ status: 'read', mentor_id: mentorId, added_count: total, note: null, updated_at: now() }).eq('id', link.id)
    return grantBonus(db, a.userId, link.id, target, { platform: target.platform, added: posts.length, bonus: 0, alreadyGranted: false, status: 'read', message: SNS_READ_LINE })
}
