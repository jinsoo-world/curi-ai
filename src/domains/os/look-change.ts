// domains/os — 봇 모양/색이 바뀌면 단톡에서 다른 봇이 눈치채고, 바뀐 봇이 받아친다.
// 스크립트 비트(템플릿). Solar 호출 없음. 비용 0, 즉시.
// 제품 카피: 가운뎃점(·) · 긴 줄표(—) 금지.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
    listChannels, getChannelBots, saveChannelMessage, ChannelTableMissing,
} from './channels'
import type { ChannelMessage } from './channels'
import type { BotColor, BotShape } from './types'

export type LookChangeKind = 'color' | 'shape' | 'both'

/** 저장 한 번에 같은 봇으로 연속 비트 안 남기게 (빠른 토글 방지) */
export const LOOK_BEAT_COOLDOWN_MS = 45_000

const lastBeatAt = new Map<string, number>()

function beatKey(userId: string, mentorId: string) {
    return `${userId}:${mentorId}`
}

/** 순수: 쿨다운 안이면 false. 시험용으로 now/map 주입 가능 */
export function shouldPostLookBeat(
    userId: string,
    mentorId: string,
    now = Date.now(),
    store: Map<string, number> = lastBeatAt,
): boolean {
    const prev = store.get(beatKey(userId, mentorId))
    if (prev === undefined) return true
    return now - prev >= LOOK_BEAT_COOLDOWN_MS
}

export function markLookBeatPosted(
    userId: string,
    mentorId: string,
    now = Date.now(),
    store: Map<string, number> = lastBeatAt,
): void {
    store.set(beatKey(userId, mentorId), now)
}

/** patch 에 shape/color 가 실제로 들어왔는지 → 비트 종류. 둘 다 없으면 null */
export function classifyLookChange(patch: {
    shape?: BotShape | string
    color?: BotColor | string
}): LookChangeKind | null {
    const shape = patch.shape !== undefined
    const color = patch.color !== undefined
    if (shape && color) return 'both'
    if (color) return 'color'
    if (shape) return 'shape'
    return null
}

/** 머리색/색 눈치채기 — 위트·하찮음·귀여움. 매번 다르게 뽑는다 */
export const NOTICE_COLOR: readonly string[] = [
    '머리색 바꿨네?',
    '오늘 유독 반짝이는데',
    '누가 머리 새로 했냐',
    '어 색 바꿨다',
    '방금 전까지 그 색 아니었는데',
    '머리 염색했어?',
    '세상에 색이 달라졌네',
    '오 새 머리색이다',
    '왜 갑자기 반짝여',
    '색 센스 뭐야 그거',
    '나 그 색 좋아하는데',
    '잠깐만 머리 왜 달라',
]

/** 모양 눈치채기 */
export const NOTICE_SHAPE: readonly string[] = [
    '모양 바꿨네?',
    '윤곽이 좀 달라 보이는데',
    '몸매(?) 손봤어?',
    '실루엣 새로네',
    '어 형태가 바뀌었어',
    '갑자기 각이 생겼는데',
    '어디 성형하고 왔냐',
    '모양이 새롭다',
    '윤곽선이 왜 이래 귀여워',
    '방금 전 그 모양이 아니었는데',
    '실루엣 센스 뭐야',
    '오 폼 바꿨다',
]

/** 둘 다 바뀜 */
export const NOTICE_BOTH: readonly string[] = [
    '완전 새 사람인데?',
    '머리랑 모양 둘 다 손봤네',
    '오늘 풀 세팅이냐',
    '리뉴얼 떴다',
    '갑자기 왜 이렇게 새로워',
    '색이랑 윤곽 다 바꿨어?',
    '변신 완료인가',
    '오 메이크오버네',
    '누가 새로 태어났냐',
    '풀체인지인데 티 안 낼 생각이었니',
]

/** 바뀐 봇의 받아치기 — 캐주얼, 일에 집중하라는 톤 */
export const REPLY_LINES: readonly string[] = [
    '응 기분 좀 내봤어. 너 일에 집중해',
    '티 많이 나? 일은 네가 해',
    '그냥 기분. 회의 가자',
    '알아채다니. 자 일이나 하자',
    '고마워. 그래도 보고서부터',
    '기분 전환이었어. 넌 집중해',
    '들켰네. 일은 그대로 부탁해',
    '응. 놀랄 일은 아니고 일이나',
    '살짝만. 너 할 일 많아 보여',
    '티 났어? 그래도 마감이 먼저야',
    '기분이야. 자 다시 본론',
    '칭찬으로 들을게. 일 가자',
    '들키긴 했다. 집중은 너가',
    '응 바꿨어. 일은 네가 챙겨',
    '그냥. 회의 자료부터 보자',
]

function poolFor(kind: LookChangeKind): readonly string[] {
    if (kind === 'color') return NOTICE_COLOR
    if (kind === 'shape') return NOTICE_SHAPE
    return NOTICE_BOTH
}

function pickFrom(pool: readonly string[], rng: () => number): string {
    if (pool.length === 0) return ''
    const i = Math.floor(rng() * pool.length) % pool.length
    return pool[i]!
}

/** 순수: 눈치채기 한 줄 */
export function pickNoticeLine(kind: LookChangeKind, rng: () => number = Math.random): string {
    return pickFrom(poolFor(kind), rng)
}

/** 순수: 받아치기 한 줄 */
export function pickReplyLine(rng: () => number = Math.random): string {
    return pickFrom(REPLY_LINES, rng)
}

/** 순수: 다른 봇 한 명. 없으면 null */
export function pickNoticer<T extends { mentorId: string }>(
    others: T[],
    rng: () => number = Math.random,
): T | null {
    if (others.length === 0) return null
    const i = Math.floor(rng() * others.length) % others.length
    return others[i] ?? null
}

export interface LookBeatResult {
    channelId: string
    notice: ChannelMessage
    reply: ChannelMessage
    noticerMentorId: string
    changedMentorId: string
}

/**
 * 모양/색이 바뀐 뒤 단톡에 비트 2턴을 남긴다.
 * - 멤버십 있는 방 중 하나(가장 최근 생성)만
 * - 다른 봇 1명이 눈치채고, 바뀐 봇이 받아친다
 * - 쿨다운/멤버 부족/표 없음이면 null (PATCH 자체는 성공이어야 함)
 */
export async function postLookChangeBeat(
    db: SupabaseClient,
    args: {
        userId: string
        changedMentorId: string
        kind: LookChangeKind
        rng?: () => number
        now?: number
    },
): Promise<LookBeatResult | null> {
    const rng = args.rng ?? Math.random
    const now = args.now ?? Date.now()
    if (!shouldPostLookBeat(args.userId, args.changedMentorId, now)) return null

    let channels
    try {
        channels = await listChannels(db, args.userId)
    } catch (e) {
        if (e instanceof ChannelTableMissing) return null
        throw e
    }

    // 이 봇이 들어 있고, 다른 봇이 1명 이상인 방. 최근 생성 방 우선.
    const candidates = channels
        .filter(ch => ch.memberMentorIds.includes(args.changedMentorId))
        .filter(ch => ch.memberMentorIds.some(id => id !== args.changedMentorId))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    const room = candidates[0]
    if (!room) return null

    const bots = await getChannelBots(db, args.userId, room.memberMentorIds)
    const others = bots.filter(b => b.mentorId !== args.changedMentorId)
    const noticer = pickNoticer(others, rng)
    const changed = bots.find(b => b.mentorId === args.changedMentorId)
    if (!noticer || !changed) return null

    const noticeText = pickNoticeLine(args.kind, rng)
    const replyText = pickReplyLine(rng)
    if (!noticeText || !replyText) return null

    const notice = await saveChannelMessage(db, room.id, {
        authorKind: 'bot',
        mentorId: noticer.mentorId,
        content: noticeText,
    })
    const reply = await saveChannelMessage(db, room.id, {
        authorKind: 'bot',
        mentorId: changed.mentorId,
        content: replyText,
    })

    markLookBeatPosted(args.userId, args.changedMentorId, now)
    return {
        channelId: room.id,
        notice,
        reply,
        noticerMentorId: noticer.mentorId,
        changedMentorId: changed.mentorId,
    }
}

/** 시험용으로 쿨다운 맵을 비운다 */
export function _resetLookBeatCooldownForTests(store: Map<string, number> = lastBeatAt) {
    store.clear()
}
