// domains/push — 대표 확정 5종(결정로그 2026-10-02)의 문구와 겹침 규칙. 번호는 설계서
// 02_제품/큐리스/큐리AI_앱푸시_100종_설계_1002.md 와 같다.
//   ① P014 봇 글 허락 기다림     10분 안의 여러 건은 1개
//   ② P001 매일 루틴 결과         하루 1번(서울 날짜)
//   ③ P025 단체방 답 도착         방마다 10분 1개
//   ④ P033 공개 봇 검사 통과 / P034 공개 전 한 번 더 확인 중 / P035 공개하려면 고칠 곳   봇마다(P035 는 검사 1번당)
//   ⑤ P089 3일 안부              (아직 일으키는 곳이 없다. 3일 미접속을 찾는 예약 작업이 생기면 붙인다)
// 전부 정보(info). 광고는 ⑤ 하나뿐이다.

import { deeplinkBot, deeplinkGroup } from './deeplink'
import { kstDate } from './rules'
import type { PushInput } from './types'

/** 받침에 따라 조사를 고른다. 한글이 아니면 「이(가)」처럼 둘 다 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
    const last = word.trim().slice(-1)
    const code = last.charCodeAt(0) - 0xac00
    if (code < 0 || code > 11171) return `${word}${withFinal}(${withoutFinal})`
    return `${word}${code % 28 === 0 ? withoutFinal : withFinal}`
}
export const iga = (w: string) => josa(w, '이', '가')
const eulreul = (w: string) => josa(w, '을', '를')

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const BOT = (name: string | null | undefined) => (name && name.trim()) || '봇'

/** ① 승인 카드가 새로 생겼다 */
export function p014PermissionPending(a: { userId: string; mentorId: string | null; botName?: string | null; summary: string }): PushInput {
    return {
        userId: a.userId, type: 'P014', category: 'info',
        title: `${iga(BOT(a.botName))} 허락을 기다려요`,
        body: `${clip(a.summary.trim(), 80)} 보내도 될지 봐 주세요.`,
        deeplink: a.mentorId ? deeplinkBot(a.mentorId) : null,
        dedupe: { key: 'pending', withinMinutes: 10 },
    }
}

/** ② 루틴이 성공했다 (실패 알림 P002 는 이번에 켜지 않는다) */
export function p001RoutineDone(a: { userId: string; mentorId: string; botName?: string | null; routineTitle: string; now?: Date }): PushInput {
    const day = kstDate(a.now ?? new Date())
    return {
        userId: a.userId, type: 'P001', category: 'info',
        title: `${iga(BOT(a.botName))} ${eulreul(clip(a.routineTitle.trim() || '루틴', 24))} 마쳤어요`,
        body: '정리해 둔 결과가 도착했어요. 눌러서 확인해 보세요.',
        deeplink: deeplinkBot(a.mentorId),
        dedupe: { key: `day:${day}` },
    }
}

/** ③ 단체방에 봇 답이 모였는데 사용자가 기다리다 나갔다 */
export function p025GroupReplied(a: { userId: string; channelId: string; roomName?: string | null; botNames: string[] }): PushInput {
    const names = a.botNames.filter(Boolean).slice(0, 3)
    const who = names.length === 0 ? '봇들이' : `${names.join(', ')}${names.length < a.botNames.length ? ' 외' : ''} 봇이`
    return {
        userId: a.userId, type: 'P025', category: 'info',
        title: a.roomName?.trim() ? `${clip(a.roomName.trim(), 20)}에 답이 모였어요` : '단체방에 답이 모였어요',
        body: `${who} 답했어요.`,
        deeplink: deeplinkGroup(a.channelId),
        dedupe: { key: `room:${a.channelId}`, withinMinutes: 10 },
    }
}

/** ④-1 공개 봇 검사 통과 = 마켓에 올라감 */
export function p033Published(a: { userId: string; mentorId: string; botName?: string | null }): PushInput {
    return {
        userId: a.userId, type: 'P033', category: 'info',
        title: `${iga(BOT(a.botName))} 공개됐어요`,
        body: '검사를 통과해 이제 봇 마켓에서 누구나 만날 수 있어요.',
        deeplink: deeplinkBot(a.mentorId),
        dedupe: { key: a.mentorId },
    }
}

/** ④-2 공개 전 사람이 한 번 더 본다 */
export function p034InReview(a: { userId: string; mentorId: string; botName?: string | null }): PushInput {
    return {
        userId: a.userId, type: 'P034', category: 'info',
        title: '공개 전에 한 번 더 살펴보고 있어요',
        body: `${BOT(a.botName)} 공개 결과를 하루 안에 알려 드릴게요.`,
        deeplink: deeplinkBot(a.mentorId),
        dedupe: { key: a.mentorId },
    }
}

/** 검사 분류 → 쉬운 말 (기록에는 분류만 남는다) */
const CATEGORY_TEXT: Record<string, string> = {
    impersonation: '다른 실제 인물인 척하는 내용이 있어요.',
    illegal: '법에 어긋나는 내용이 있어요.',
    sexual: '성적인 내용이 있어요.',
    hate: '남을 깎아내리는 내용이 있어요.',
    violence: '폭력적인 내용이 있어요.',
    medical_claim: '건강 효과를 장담하는 말이 있어요.',
    legal_claim: '법률 결과를 장담하는 말이 있어요.',
    financial_claim: '수익을 장담하는 말이 있어요.',
    personal_data: '전화번호나 계좌 같은 개인정보가 들어 있어요.',
}

export function fixHint(categories: string[]): string {
    for (const c of categories) if (CATEGORY_TEXT[c]) return CATEGORY_TEXT[c]
    return '공개 기준에 맞지 않는 곳이 있어요.'
}

/** ④-3 공개하려면 고칠 곳 (AI 판정 block 또는 관리자 거절). 같은 내용 검사 1번당 1번 */
export function p035NeedsFix(a: { userId: string; mentorId: string; botName?: string | null; categories: string[]; checkKey: string }): PushInput {
    return {
        userId: a.userId, type: 'P035', category: 'info',
        title: '공개하려면 고칠 곳이 있어요',
        body: `${BOT(a.botName)}: ${fixHint(a.categories)} 고쳐서 다시 올려 주세요.`,
        deeplink: deeplinkBot(a.mentorId),
        dedupe: { key: `${a.mentorId}:${a.checkKey}` },
    }
}
