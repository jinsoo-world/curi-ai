// domains/os/feeds/store — 연결 줄(knowledge_feeds) 읽기, 만들기, 끊기.
//
// 주인 확인(assertBotOwned)은 부르는 쪽(API)이 먼저 한다. 여기서는 항상 mentor_id 를 같이 건다
// (다른 봇의 연결 번호를 적어 보내도 안 걸리게).
// 표가 아직 없으면(마이그레이션 전 미리보기 배포) FeedTableMissing 을 던진다. API 는 이걸 「준비 중」으로 바꾼다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSafeFetchUrl } from '@/domains/agent/fetch-url'
import { removeBotSource } from '@/domains/os/knowledge'
import type { FeedKind, FeedStatus, KnowledgeFeed, KnowledgeFeedRow } from './types'
import { feedFromRow, FEED_COLUMNS, isSocialStubKind } from './types'
import { resolveChannelInput } from './youtube'
import { substackFeedUrl } from './podcast'
import { withScheme } from './rss'
import { SOCIAL_STUB_NOTE } from './social-stub'

const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다
/** 봇 하나에 붙일 수 있는 계정 수 */
export const MAX_FEEDS_PER_BOT = 5

export class FeedTableMissing extends Error {
    constructor() { super('knowledge_feeds 표가 아직 없다. supabase/migrations/20261001_knowledge_feeds.sql 을 실행해야 한다') }
}

function fail(error: { code?: string; message?: string } | null): never {
    if ((error?.code === TABLE_MISSING || error?.code === TABLE_MISSING_REST)) throw new FeedTableMissing()
    throw new Error(error?.message ?? '연결 표를 읽지 못했어요')
}

/** 이 봇에 붙은 연결 목록 */
export async function listFeeds(db: SupabaseClient, mentorId: string): Promise<KnowledgeFeed[]> {
    const { data, error } = await db.from('knowledge_feeds').select(FEED_COLUMNS)
        .eq('mentor_id', mentorId).order('created_at', { ascending: false })
    if (error) fail(error)
    return ((data ?? []) as unknown as KnowledgeFeedRow[]).map(feedFromRow)
}

/** 연결 하나 (이 봇 것만) */
export async function getFeed(db: SupabaseClient, mentorId: string, feedId: string): Promise<KnowledgeFeed> {
    const { data, error } = await db.from('knowledge_feeds').select(FEED_COLUMNS)
        .eq('id', feedId).eq('mentor_id', mentorId).maybeSingle()
    if (error) fail(error)
    if (!data) throw new Error('그 연결을 못 찾았어요')
    return feedFromRow(data as unknown as KnowledgeFeedRow)
}

/** 매일 크론이 돌릴 연결들. 준비 중(paused)은 빼고, 오래 안 가져온 것부터 */
export async function listDueFeeds(db: SupabaseClient, limit: number): Promise<KnowledgeFeed[]> {
    const { data, error } = await db.from('knowledge_feeds').select(FEED_COLUMNS)
        .neq('status', 'paused')
        .order('last_synced_at', { ascending: true, nullsFirst: true })
        .limit(limit)
    if (error) fail(error)
    return ((data ?? []) as unknown as KnowledgeFeedRow[]).map(feedFromRow)
}

/** 적은 것이 그 종류에 맞는 모양인가. 틀리면 사람 말로 던진다 */
export function validateHandle(kind: FeedKind, raw: string): string {
    const t = String(raw ?? '').trim()
    if (!t) throw new Error('핸들이나 주소를 넣어 주세요')
    if (t.length > 300) throw new Error('주소가 너무 길어요')
    if (isSocialStubKind(kind)) return t
    if (kind === 'youtube') {
        if (!resolveChannelInput(t)) throw new Error('유튜브 채널을 못 알아봤어요. @핸들이나 채널 주소를 넣어 주세요')
        return t
    }
    const url = kind === 'substack' ? substackFeedUrl(t) : withScheme(t)
    if (!isSafeFetchUrl(url)) throw new Error('열 수 없는 주소예요. 공개된 http, https 주소만 연결할 수 있어요')
    return t
}

/** 연결 줄 하나 만들기. 같은 계정을 두 번 붙이지 않는다 */
export async function createFeed(db: SupabaseClient, input: { userId: string; mentorId: string; kind: FeedKind; handleOrUrl: string }): Promise<KnowledgeFeed> {
    const handle = validateHandle(input.kind, input.handleOrUrl)
    const list = await listFeeds(db, input.mentorId)
    if (list.some(f => f.kind === input.kind && f.handleOrUrl.trim().toLowerCase() === handle.toLowerCase())) {
        throw new Error('이미 연결한 계정이에요')
    }
    if (list.length >= MAX_FEEDS_PER_BOT) throw new Error(`계정은 봇 하나당 ${MAX_FEEDS_PER_BOT}개까지 연결할 수 있어요`)

    const stub = isSocialStubKind(input.kind)
    const status: FeedStatus = stub ? 'paused' : 'connected'
    const { data, error } = await db.from('knowledge_feeds').insert({
        user_id: input.userId,
        mentor_id: input.mentorId,
        kind: input.kind,
        handle_or_url: handle,
        status,
        last_error: stub ? SOCIAL_STUB_NOTE : null,
    }).select(FEED_COLUMNS).single()
    if (error) fail(error)
    return feedFromRow(data as unknown as KnowledgeFeedRow)
}

/**
 * 연결 끊기.
 *   deleteSources=false(기본) = 연결 줄만 지운다. 이미 가져온 자료는 남고 feed_id 만 비워진다(DB 규칙 ON DELETE SET NULL)
 *   deleteSources=true        = 이 연결로 가져온 자료와 조각을 먼저 지운다(자료 빼기와 같은 함수 removeBotSource)
 */
export async function deleteFeed(db: SupabaseClient, mentorId: string, feedId: string, deleteSources = false): Promise<{ removedSources: number }> {
    await getFeed(db, mentorId, feedId)   // 이 봇의 연결인지 먼저 본다
    let removedSources = 0
    if (deleteSources) {
        const { data, error } = await db.from('knowledge_sources').select('id')
            .eq('mentor_id', mentorId).eq('feed_id', feedId)
        if (error) throw new Error(error.message)
        for (const row of (data ?? []) as { id: string }[]) {
            await removeBotSource(db, mentorId, row.id)
            removedSources++
        }
    }
    const { error } = await db.from('knowledge_feeds').delete().eq('id', feedId).eq('mentor_id', mentorId)
    if (error) fail(error)
    return { removedSources }
}
