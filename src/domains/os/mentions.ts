// domains/os — 채팅 입력창 「@」 멘션 (순수 함수 = 시험 대상)
//
// 1:1 방: 다른 팀 봇을 @하면 지금 방에 남긴 채 그 봇에게 넘긴다(사이드바가 상대 봇을 부른다).
// 그룹방: 서버 pickResponders / findMentionedBot 이 이미 @한 명만 답하게 한다. 여기는 입력 UI·파싱만.
// 제품 카피에 가운뎃점(·)·긴 줄표(—) 금지.

import { findMentionedBot } from './channels'

export interface MentionBot {
    mentorId: string
    name: string
}

/** 커서 앞에서 지금 치고 있는 @검색어. 없으면 null = 픽커를 닫는다 */
export interface MentionQuery {
    /** text 안에서 '@' / '＠' 가 시작되는 인덱스 */
    start: number
    /** '@' 뒤, 커서 앞까지 (공백·@ 를 만나기 전) */
    query: string
}

/** 반각 @ 와 전각 ＠ 모두 멘션 트리거로 본다 */
const AT_CHARS = '@＠'

/**
 * 커서 위치에서 「@검색어」를 뽑는다.
 * - 줄 시작이나 공백 뒤의 @ / ＠ 만 본다 (이메일 주소 안의 @ 는 안 연다).
 * - query 는 공백·새 @ 전까지.
 */
export function detectMentionQuery(text: string, cursor: number): MentionQuery | null {
    const t = text ?? ''
    const c = Math.max(0, Math.min(cursor ?? 0, t.length))
    const before = t.slice(0, c)
    // (^|공백)[@＠]검색어$ — 검색어에 공백·@·＠ 없음
    const m = before.match(/(?:^|[\s\u3000])[@＠]([^\s@＠]*)$/)
    if (!m) return null
    let at = -1
    for (let i = before.length - 1; i >= 0; i--) {
        if (AT_CHARS.includes(before[i]!)) { at = i; break }
    }
    if (at < 0) return null
    return { start: at, query: m[1] ?? '' }
}

/**
 * onChange 직후 selectionStart 가 0 으로 남는 경우(모바일·IME)를 고친다.
 * 커서가 0 인데 문자열 끝이 @검색어면 끝(또는 매치 끝)을 커서로 쓴다.
 */
export function resolveMentionCursor(text: string, cursor: number): number {
    const t = text ?? ''
    const reported = Math.max(0, Math.min(cursor ?? 0, t.length))
    if (reported > 0) return reported
    if (!t) return 0
    // 끝이 @검색어면 그 구간을 치고 있는 중으로 본다 (selectionStart=0 버그)
    if (detectMentionQuery(t, t.length)) return t.length
    return reported
}

/** 이름으로 필터 (대소문자 무시). 빈 검색어면 전부. */
export function filterMentionBots<T extends MentionBot>(bots: readonly T[], query: string): T[] {
    const q = (query ?? '').trim().toLowerCase()
    const list = (bots ?? []).filter(b => b?.name)
    if (!q) return [...list]
    return list.filter(b => b.name.toLowerCase().includes(q))
}

/** @검색어 자리를 「@이름 」으로 바꾼다. 커서도 이름 뒤 공백으로. 전각 ＠ 도 반각 @ 로 정규화. */
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

/** 본문에서 「@이름」 한 번을 떼어 낸다 (앞뒤 공백 정리). 전각 ＠이름 도 본다. */
export function stripMentionToken(text: string, name: string): string {
    const n = (name ?? '').trim()
    if (!n) return (text ?? '').trim()
    const t = text ?? ''
    for (const at of ['@', '＠'] as const) {
        const token = `${at}${n}`
        const idx = t.indexOf(token)
        if (idx >= 0) {
            return (t.slice(0, idx) + t.slice(idx + token.length)).replace(/\s+/g, ' ').trim()
        }
    }
    return t.trim()
}

export type PersonalMentionDecision =
    | { action: 'stay' }
    | { action: 'handoff'; mentorId: string; name: string; message: string }

/**
 * 1:1 방에서 보내기 직전: @다른봇 이 있으면 **지금 방에 남긴 채** 그 봇에게 넘긴다.
 * - 멘션 없음·지금 봇 멘션 → stay (평소 대화)
 * - @다른봇 (내용 있든 없든) → handoff (채널 전환 없음. 사이드바에서 상대 봇이 부른다)
 *
 * 예전 switch(멘션만 방으로 이동) / route(내용 들고 방으로 이동) 는 없앴다.
 * 그룹방은 이 함수를 쓰지 않는다 (pickResponders / findMentionedBot).
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
    return {
        action: 'handoff',
        mentorId: mentioned.mentorId,
        name: mentioned.name,
        message: remainder.slice(0, 8000),
    }
}

/** 지금 방 봇이 채팅에 남기는 넘김 안내. 가운뎃점·긴 줄표 없음. */
export function handoffAckLine(name: string): string {
    const n = (name ?? '').trim() || '그 봇'
    return `${n}에게도 전달할게요.`
}

/** 왼쪽 명단 「나를 불러」 이벤트 이름 (CustomEvent detail.mentorId) */
export const BOT_CALL_EVENT = 'curi:bot-call'

/** 읽지 않은 호출을 탭 저장소에 남기는 키 (mentorId[] JSON) */
export const BOT_CALL_UNREAD_KEY = 'curi:bot-call-unread'

/** 사이드바에 「이 봇이 나를 부른다」를 알린다. */
export function emitBotCall(
    target: Pick<EventTarget, 'dispatchEvent'> | null | undefined,
    mentorId: string,
): void {
    if (!target || !mentorId) return
    try {
        target.dispatchEvent(new CustomEvent(BOT_CALL_EVENT, { detail: { mentorId } }))
    } catch { /* jsdom / 구형 */ }
}

/** 읽지 않은 호출 목록을 읽는다. */
export function readBotCallUnread(
    storage: Pick<Storage, 'getItem'> | null | undefined,
): string[] {
    if (!storage) return []
    try {
        const raw = storage.getItem(BOT_CALL_UNREAD_KEY)
        if (!raw) return []
        const arr = JSON.parse(raw) as unknown
        if (!Array.isArray(arr)) return []
        return arr.filter((x): x is string => typeof x === 'string' && !!x)
    } catch {
        return []
    }
}

/** 읽지 않은 호출에 mentorId 를 더한다 (이미 있으면 앞으로 당긴다). */
export function addBotCallUnread(
    storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
    mentorId: string,
): string[] {
    if (!storage || !mentorId) return readBotCallUnread(storage)
    const next = [mentorId, ...readBotCallUnread(storage).filter(id => id !== mentorId)].slice(0, 40)
    try { storage.setItem(BOT_CALL_UNREAD_KEY, JSON.stringify(next)) } catch { /* quota */ }
    return next
}

/** 그 봇 방을 열면 읽지 않은 호출에서 뺀다. */
export function clearBotCallUnread(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined,
    mentorId: string,
): string[] {
    if (!storage || !mentorId) return readBotCallUnread(storage)
    const next = readBotCallUnread(storage).filter(id => id !== mentorId)
    try {
        if (next.length === 0) storage.removeItem(BOT_CALL_UNREAD_KEY)
        else storage.setItem(BOT_CALL_UNREAD_KEY, JSON.stringify(next))
    } catch { /* */ }
    return next
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
