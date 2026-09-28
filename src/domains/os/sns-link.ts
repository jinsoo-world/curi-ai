// SNS, 블로그 링크 연동 (대표 승인 0928 23:29). 서버 전용.
// 받은 링크를 이미 있는 「계정 연결」(feeds: 유튜브 채널, RSS, 일반 웹)로 읽어 그 사람 봇의 자료에 넣는다.
// 네이버 블로그는 공개 RSS(rss.blog.naver.com)로 읽는다. 인스타그램, 스레드, X, 틱톡은 공식 열쇠가 없어 링크만 저장한다(준비 중).
// 자료가 1건 이상 실제로 들어갔을 때만 클로버 50개를 계정당 한 번 준다 (DB 함수 grant_sns_link_bonus 가 중복을 막는다).
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveChannelInput } from './feeds/youtube'
import { createFeed, listFeeds, syncFeed, loadExistingSources, type FeedKind } from './feeds'
import { isSafeFetchUrl } from '@/domains/agent/fetch-url'
import { MAX_SOURCES_PER_BOT } from './knowledge'
import { bootstrapDefaultTeam } from './team'
import { JOBS } from './presets'
import { firstJobFor, SNS_BONUS_CLOVERS, SNS_PENDING_LINE, SNS_READ_LINE, SNS_SUCCESS_LINE } from './onboarding'

export type SnsPlatform = 'youtube' | 'naver_blog' | 'substack' | 'rss' | 'website' | 'instagram' | 'threads' | 'x' | 'tiktok'

export interface SnsTarget {
    url: string
    platform: SnsPlatform
    /** 읽을 수 있으면 계정 연결 종류와 넣을 값, 못 읽으면 null (준비 중) */
    feed: { kind: FeedKind; handleOrUrl: string } | null
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

    if (is('instagram.com')) return { url, platform: 'instagram', feed: null }
    if (is('threads.net') || is('threads.com')) return { url, platform: 'threads', feed: null }
    if (is('x.com') || is('twitter.com')) return { url, platform: 'x', feed: null }
    if (is('tiktok.com')) return { url, platform: 'tiktok', feed: null }

    if (host === 'youtube.com' || host === 'youtu.be') {
        if (!resolveChannelInput(url)) throw new Error('유튜브는 채널 주소(@핸들)를 넣어 주세요')
        return { url, platform: 'youtube', feed: { kind: 'youtube', handleOrUrl: url } }
    }
    if (host === 'blog.naver.com' || host === 'rss.blog.naver.com') {
        const id = (u.searchParams.get('blogId') || u.pathname.split('/').filter(Boolean)[0] || '').replace(/\.xml$/, '')
        if (!/^[A-Za-z0-9_-]{2,40}$/.test(id) || /\.naver$/i.test(id)) throw new Error('네이버 블로그 주소를 확인해 주세요. 예: blog.naver.com/아이디')
        return { url, platform: 'naver_blog', feed: { kind: 'podcast', handleOrUrl: `https://rss.blog.naver.com/${id}.xml` } }
    }
    if (is('substack.com')) return { url, platform: 'substack', feed: { kind: 'substack', handleOrUrl: url } }
    if (!isSafeFetchUrl(url)) throw new Error('열 수 없는 주소예요. 공개된 주소만 넣어 주세요')
    if (/(\/(rss|feed|atom)(\.xml)?\/?$)|(\.xml$)/i.test(u.pathname)) return { url, platform: 'rss', feed: { kind: 'podcast', handleOrUrl: url } }
    return { url, platform: 'website', feed: { kind: 'website', handleOrUrl: url } }
}

export interface SnsConnectResult {
    status: 'read' | 'pending' | 'failed'
    platform: SnsPlatform
    added: number
    bonus: number
    alreadyGranted: boolean
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
    if (status !== 'read') return { ...base, status, message: note || '읽지 못했어요' }

    // 자료가 1건 이상 저장된 링크만 보너스. 계정당 한 번 (이미 받았으면 null)
    const { data: balance, error: grantErr } = await db.rpc('grant_sns_link_bonus', { p_user: a.userId, p_link: link.id, p_amount: SNS_BONUS_CLOVERS })
    if (grantErr) {
        console.error('[sns-link] 보너스 지급 실패:', grantErr.message)
        return { ...base, status, added, message: SNS_READ_LINE }
    }
    if (typeof balance === 'number') return { ...base, status, added, bonus: SNS_BONUS_CLOVERS, balance, message: SNS_SUCCESS_LINE }
    return { ...base, status, added, alreadyGranted: true, message: SNS_READ_LINE }
}
