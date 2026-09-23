// domains/os — 채팅 입력창 「@」 멘션 (순수 함수 = 시험 대상)
//
// 1:1 방: 다른 팀 봇을 @하면 그 봇 방으로 옮기거나(멘션만) / 그 봇에게 말을 보낸다(멘션+내용).
// 그룹방: 서버 pickResponders / findMentionedBot 이 이미 @한 명만 답하게 한다. 여기는 입력 UI·파싱만.
// 제품 카피에 가운뎃점(·)·긴 줄표(—) 금지.

import { findMentionedBot } from './channels'

export interface MentionBot {
    mentorId: string
    name: string
}

/** 커서 앞에서 지금 치고 있는 @검색어. 없으면 null = 픽커를 닫는다 */
export interface MentionQuery {
    /** text 안에서 '@' 가 시작되는 인덱스 */
    start: number
    /** '@' 뒤, 커서 앞까지 (공백·@ 를 만나기 전) */
    query: string
}

/**
 * 커서 위치에서 「@검색어」를 뽑는다.
 * - 줄 시작이나 공백 뒤의 @ 만 본다 (이메일 주소 안의 @ 는 안 연다).
 * - query 는 공백·새 @ 전까지.
 */
export function detectMentionQuery(text: string, cursor: number): MentionQuery | null {
    const t = text ?? ''
    const c = Math.max(0, Math.min(cursor ?? 0, t.length))
    const before = t.slice(0, c)
    // (^|공백)@검색어$ — 검색어에 공백·@ 없음
    const m = before.match(/(?:^|[\s\u3000])@([^\s@]*)$/)
    if (!m) return null
    const at = before.lastIndexOf('@')
    if (at < 0) return null
    return { start: at, query: m[1] ?? '' }
}

/** 이름으로 필터 (대소문자 무시). 빈 검색어면 전부. */
export function filterMentionBots<T extends MentionBot>(bots: readonly T[], query: string): T[] {
    const q = (query ?? '').trim().toLowerCase()
    const list = (bots ?? []).filter(b => b?.name)
    if (!q) return [...list]
    return list.filter(b => b.name.toLowerCase().includes(q))
}

/** @검색어 자리를 「@이름 」으로 바꾼다. 커서도 이름 뒤 공백으로. */
export function applyMentionInsertion(
    text: string,
    start: number,
    cursor: number,
    name: string,
): { text: string; cursor: number } {
    const t = text ?? ''
    const safeName = (name ?? '').trim()
    if (!safeName) return { text: t, cursor }
    const before = t.slice(0, Math.max(0, start))
    const after = t.slice(Math.max(cursor, start))
    const token = `@${safeName} `
    return { text: before + token + after, cursor: before.length + token.length }
}

/** 본문에서 「@이름」 한 번을 떼어 낸다 (앞뒤 공백 정리). */
export function stripMentionToken(text: string, name: string): string {
    const n = (name ?? '').trim()
    if (!n) return (text ?? '').trim()
    const token = `@${n}`
    const t = text ?? ''
    const at = t.indexOf(token)
    if (at < 0) return t.trim()
    return (t.slice(0, at) + t.slice(at + token.length)).replace(/\s+/g, ' ').trim()
}

export type PersonalMentionDecision =
    | { action: 'stay' }
    | { action: 'switch'; mentorId: string; name: string }
    | { action: 'route'; mentorId: string; name: string; message: string }

/**
 * 1:1 방에서 보내기 직전: @다른봇 이 있으면 그 봇으로 옮길지/말을 넘길지 고른다.
 * - 멘션 없음·지금 봇 멘션 → stay (평소 대화)
 * - @다른봇 만 (또는 공백만) → switch (LLM 안 부름)
 * - @다른봇 + 내용 → route (그 봇 방으로 가서 내용만 보낸다)
 */
export function decidePersonalMentionRoute(
    text: string,
    bots: readonly MentionBot[],
    currentMentorId: string,
): PersonalMentionDecision {
    const t = (text ?? '').trim()
    if (!t || !bots?.length) return { action: 'stay' }
    const mentioned = findMentionedBot(t, [...bots])
    if (!mentioned) return { action: 'stay' }
    if (mentioned.mentorId === currentMentorId) return { action: 'stay' }
    const remainder = stripMentionToken(t, mentioned.name)
    if (!remainder) return { action: 'switch', mentorId: mentioned.mentorId, name: mentioned.name }
    return {
        action: 'route',
        mentorId: mentioned.mentorId,
        name: mentioned.name,
        message: remainder.slice(0, 8000),
    }
}

/** 방 옮긴 뒤 자동으로 보낼 말 (세션 저장소). 키는 mentorId. */
const PENDING_KEY = 'curi:pending-mention-send'

export function stashPendingMentionSend(
    storage: Pick<Storage, 'setItem'> | null | undefined,
    mentorId: string,
    message: string,
): void {
    if (!storage || !mentorId || !message.trim()) return
    try {
        storage.setItem(PENDING_KEY, JSON.stringify({ mentorId, message: message.trim().slice(0, 8000), at: Date.now() }))
    } catch { /* quota / private mode */ }
}

/** 맞으면 말을 꺼내고 지운다. 다른 봇이거나 5분 지나면 null. */
export function takePendingMentionSend(
    storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined,
    mentorId: string,
    maxAgeMs = 5 * 60_000,
): string | null {
    if (!storage || !mentorId) return null
    try {
        const raw = storage.getItem(PENDING_KEY)
        if (!raw) return null
        const d = JSON.parse(raw) as { mentorId?: string; message?: string; at?: number }
        // 다른 봇 방으로 잠깐 들른 경우 키를 지우지 않는다 (맞는 방이 가져가게)
        if (d.mentorId !== mentorId) return null
        if (typeof d.at === 'number' && Date.now() - d.at > maxAgeMs) {
            storage.removeItem(PENDING_KEY)
            return null
        }
        storage.removeItem(PENDING_KEY)
        const msg = (d.message ?? '').trim()
        return msg || null
    } catch {
        try { storage.removeItem(PENDING_KEY) } catch { /* */ }
        return null
    }
}
