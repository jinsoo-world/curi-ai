// domains/os — 그룹방에서 @ 없이 말했을 때 누가 답할지 고르는 눈치 라우터.
//
// 원칙 (CEO 0928): 방 전체에 말해도 모든 봇이 답하지 않는다. 그 말이 자기 역할에 맞는 봇만
// 눈치껏 답한다. 대개 한 명, 가끔 두 명, 드물게 그 이상. 방장(진행 봇)은 없다.
// 각 봇은 자기 고유 프롬프트대로만 말하고, 방 규칙은 최소한만 덧붙인다.
//
// 순수 함수(프롬프트 만들기, 답 읽기, 폴백 점수)는 시험 대상이다. 모델 호출은 주입받는다.

import { CONVERSATION_RULES } from '@/domains/mentor/answer-rules'

/** @ 없이 말했을 때 한 번에 답할 수 있는 봇 수 상한 (대개 1, 드물게 이만큼) */
export const MAX_GROUP_REPLIES = 3

/** 뒤 차례 봇이 덧붙일 게 없을 때 쓰는 표지. 이 답은 저장하지 않는다 */
export const PASS_TOKEN = '[PASS]'

export interface RouterBot {
    mentorId: string
    name: string
    systemPrompt?: string | null
    oneLiner?: string | null
}

export interface RouterLine {
    who: string
    text: string
}

const SUMMARY_CHARS = 220

/** 라우터에 넣을 봇 한 줄 요약: 이름 + 한 줄 소개 + 프롬프트 앞부분 */
export function botRoleSummary(bot: RouterBot): string {
    const one = (bot.oneLiner ?? '').trim()
    const prompt = (bot.systemPrompt ?? '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_CHARS)
    return [one, prompt].filter(Boolean).join(' / ') || '(역할 설명 없음)'
}

/** 눈치 라우터 프롬프트. 봇은 번호로 고르게 해서 이름 표기 흔들림을 피한다 */
export function buildRouterPrompt(
    text: string,
    bots: RouterBot[],
    recent: RouterLine[] = [],
): { system: string; user: string } {
    const system = `너는 단톡방의 눈치 담당이다. 주인이 방 전체에 한 말을 보고, 어떤 봇이 답하는 게 자연스러운지 고른다.
규칙:
- 대개 가장 잘 맞는 봇 한 명만 고른다.
- 두 봇의 역할이 모두 분명히 필요할 때만 두 명을 고른다. 모두를 고르는 일은 아주 드물다.
- 인사나 잡담처럼 누구 몫인지 애매하면 가장 어울리는 한 명만 고른다.
- 봇 역할 설명에 근거해서만 고른다. 진행자나 사회자를 따로 세우지 않는다.
- 답은 번호만 쉼표로 쓴다. 예: 2 또는 1,3. 다른 말은 쓰지 않는다.`
    const 명단 = bots.map((b, i) => `${i + 1}. ${b.name}: ${botRoleSummary(b)}`).join('\n')
    const 흐름 = recent.slice(-6).map(l => `${l.who}: ${l.text.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n')
    const user = `[봇 명단]\n${명단}\n\n${흐름 ? `[최근 대화]\n${흐름}\n\n` : ''}[주인이 방금 한 말]\n${text}\n\n답할 봇 번호:`
    return { system, user }
}

/** 라우터 답(「2」「1, 3」「2번 글감봇」)을 mentorId 목록으로. 못 읽으면 빈 배열 */
export function parseRouterReply(reply: string | null | undefined, bots: RouterBot[], max = MAX_GROUP_REPLIES): string[] {
    if (!reply) return []
    const out: string[] = []
    for (const m of reply.matchAll(/\d+/g)) {
        const i = Number(m[0]) - 1
        const b = bots[i]
        if (b && !out.includes(b.mentorId)) out.push(b.mentorId)
        if (out.length >= max) break
    }
    if (out.length === 0) {
        // 숫자 대신 이름으로 답했을 때
        for (const b of bots) {
            if (b.name && reply.includes(b.name) && !out.includes(b.mentorId)) out.push(b.mentorId)
            if (out.length >= max) break
        }
    }
    return out
}

function 낱말(s: string): string[] {
    return (s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
}

/**
 * 라우터가 죽었을 때 쓰는 폴백: 말과 봇 역할 설명의 낱말 겹침이 가장 큰 **한 명**.
 * 동점이거나 아무것도 안 겹치면 방에 먼저 넣은 봇. 절대로 전원을 고르지 않는다.
 */
export function fallbackResponder(text: string, bots: RouterBot[]): string | null {
    if (bots.length === 0) return null
    const 말 = 낱말(text)
    let best = { id: bots[0]!.mentorId, score: 0 }
    for (const b of bots) {
        if (b.name && text.includes(b.name)) return b.mentorId
        const 역할 = `${b.name} ${b.oneLiner ?? ''} ${(b.systemPrompt ?? '').slice(0, 600)}`.toLowerCase()
        let score = 0
        for (const w of 말) {
            // 한국어 조사 붙은 꼴도 잡도록 앞 두 글자 이상으로 본다
            const stem = w.length > 2 ? w.slice(0, w.length - 1) : w
            if (역할.includes(w) || 역할.includes(stem)) score += 1
        }
        if (score > best.score) best = { id: b.mentorId, score }
    }
    return best.id
}

export type RouterAsk = (system: string, user: string) => Promise<string | null>

/**
 * @ 없는 말에 답할 봇을 고른다. 1명 이상 MAX_GROUP_REPLIES 이하.
 * 모델이 실패하거나 엉뚱하게 답하면 폴백 한 명.
 */
export async function routeGroupReply(
    text: string,
    bots: RouterBot[],
    recent: RouterLine[],
    ask: RouterAsk,
): Promise<string[]> {
    if (bots.length === 0) return []
    if (bots.length === 1) return [bots[0]!.mentorId]
    let picked: string[] = []
    try {
        const { system, user } = buildRouterPrompt(text, bots, recent)
        picked = parseRouterReply(await ask(system, user), bots)
    } catch {
        picked = []
    }
    if (picked.length > 0) return picked
    const one = fallbackResponder(text, bots)
    return one ? [one] : []
}

/** 뒤 차례 봇이 「덧붙일 것 없음」이라고 답했는가 */
export function isPassReply(reply: string | null | undefined): boolean {
    const t = (reply ?? '').trim()
    if (!t) return true
    return /^\[?\s*(pass|패스)\s*\]?[.!]?$/i.test(t) || t.startsWith(PASS_TOKEN)
}

export type GroupReplyMode = 'mention' | 'routed-first' | 'routed-next'

/**
 * 그룹방에서 봇 한 명에게 줄 시스템 프롬프트.
 * 봇 고유 프롬프트가 주인공이고, 방 규칙은 짧게 덧붙인다. 진행, 정리, 차례 나누기 같은 방장 지시는 없다.
 */
export function buildGroupSystemPrompt(me: RouterBot, others: RouterBot[], mode: GroupReplyMode): string {
    const 나 = (me.systemPrompt ?? '').trim() || `너는 「${me.name}」. 주인의 AI 팀원이다.${me.oneLiner ? ` ${me.oneLiner}` : ''}`
    const 이름들 = others.map(b => b.name).filter(Boolean).join(', ') || '없음'
    const 줄: string[] = [
        `[그룹 채팅방] 같은 방에 ${이름들}도 있다.`,
        `- 너는 「${me.name}」 자신으로서만, 위 네 역할과 말투대로 짧게 답한다.`,
        '- 방을 진행하거나, 남의 답을 정리하거나, 누가 무엇을 할지 나눠 주지 않는다.',
        '- 앞사람이 한 말을 되풀이하지 않는다.',
        '- 밖으로 나가는 일(보내기, 게시, 구매, 이체, 삭제)은 여기서 하지 않는다. 필요하면 초안만 쓰고 주인에게 물어본다.',
    ]
    if (mode === 'mention') {
        줄.push('- 네 몫이 아닌 일이면 다른 봇 한 명만 @이름 으로 부를 수 있다. 아니면 아무도 부르지 않는다.')
    } else {
        줄.push('- @이름으로 다른 봇을 부르지 않는다.')
    }
    if (mode === 'routed-next') {
        줄.push(`- 앞에서 다른 봇이 이미 답했다. 네 역할로 꼭 덧붙일 게 없으면 ${PASS_TOKEN} 한 단어만 쓴다.`)
    }
    // 대화 원칙을 먼저, 방 규칙(특히 「덧붙일 것 없으면 패스」)을 맨 끝에 둔다
    return `${나}\n\n${CONVERSATION_RULES}\n\n${줄.join('\n')}`
}
