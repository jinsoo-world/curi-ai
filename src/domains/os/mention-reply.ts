// domains/os — 1:1 방에서 「@다른봇」을 부르면 그 봇이 **이 방에서 직접** 답한다 (순수 함수 = 시험 대상).
//
// 왜: 예전엔 지금 봇이 「○○에게도 전달할게요.」만 남기고 상대 봇 방에 말을 넣어 두기만 했다.
//     상대 봇은 아무도 부르지 않아 답이 오지 않았다.
//
// 지금 흐름 (그룹방 @콕집기와 같은 모양: 불린 봇만 답한다)
//   ① 사람 말을 그대로 둔다. 그 아래 한 줄 안내 「양치는영이 기획팀장에게 물어봤어요: 내 이름 뭐라고?」
//   ② 불린 봇이 제 얼굴, 이름, 제 지침으로 답한다 (/api/chat 을 그 봇 mentorId 로, 이 방 sessionId 로 부른다)
//   ③ 여러 명이면 나온 순서대로. 두 번째부터는 「[물어봄] …」 줄을 사람 말 자리에 남겨 1회로 센다
//   ④ 봇이 답 속에서 다른 봇을 @부르면 한 번만 더 이어진다 (무한 왕복 없음)
//
// 저장은 기존 messages 표 그대로(칸 추가 없음). 누가 한 말인지는 줄 순서로 다시 알아낸다(attributeLines).
// 제품 카피에 가운뎃점, 긴 줄표 금지.

import { hasFinalConsonant } from '@/domains/agent/relay'
import { handoffAckLine, mentionTokenRanges } from './mentions'

export interface ReplyBot {
    mentorId: string
    name: string
}

/** 두 번째 봇부터(또는 봇끼리 이어질 때) 사람 말 자리에 남기는 줄의 머리표 */
export const ASK_TAG = '[물어봄]'

/** 봇이 답 속에서 다른 봇을 부를 때 더 이어지는 횟수 (그룹방 MAX_BOT_TURNS 와 같은 뜻: 한 번 건너가면 끝) */
export const MAX_CHAIN_HOPS = 1

/** 안내 줄에 보이는 질문 최대 글자 */
export const NOTE_QUESTION_MAX = 60

/** 봇에게 넘기는 질문 최대 글자 */
const QUESTION_MAX = 2000

/** 「@이름」 바로 뒤에 붙는 조사 (긴 것부터). 「@양치는영이 내 이름…」 → 「내 이름…」 */
const 붙는조사 = ['이랑', '에게', '한테', '께서', '하고', '님', '께', '이', '가', '은', '는', '을', '를', '도', '랑', '아', '야', '의']

function 이가(name: string): string {
    return `${name}${hasFinalConsonant(name) ? '이' : '가'}`
}
function 을를(name: string): string {
    return `${name}${hasFinalConsonant(name) ? '을' : '를'}`
}

/** 본문에서 불린 봇들을 나온 순서대로 (같은 봇은 한 번, 긴 이름 우선) */
export function findMentionedBots<T extends ReplyBot>(text: string, bots: readonly T[]): T[] {
    const list = (bots ?? []).filter(b => b?.name)
    if (!text || list.length === 0) return []
    const src = text ?? ''
    const out: T[] = []
    for (const r of mentionTokenRanges(src, list.map(b => b.name))) {
        const name = src.slice(r.start + 1, r.end)
        const b = list.find(x => x.name === name)
        if (b && !out.some(o => o.mentorId === b.mentorId)) out.push(b)
    }
    return out
}

/** 「@이름」 토큰(과 바로 붙은 조사)을 모두 떼고 공백을 정리한 질문 */
export function stripMentions(text: string, bots: readonly ReplyBot[]): string {
    const src = text ?? ''
    const names = (bots ?? []).map(b => b?.name).filter(Boolean) as string[]
    const ranges = mentionTokenRanges(src, names)
    if (ranges.length === 0) return src.replace(/\s+/g, ' ').trim()
    let out = ''
    let from = 0
    for (const r of ranges) {
        out += src.slice(from, r.start)
        let end = r.end
        const rest = src.slice(end)
        for (const p of 붙는조사) {
            if (rest.startsWith(p)) {
                const after = rest.charAt(p.length)
                // 조사 뒤가 끝, 공백, 문장부호일 때만 조사로 본다 (「@기획팀장이번주」 같은 건 그대로)
                if (!after || /[\s.,!?~:;，。！？]/.test(after)) { end += p.length; break }
            }
        }
        out += ' '
        from = end
    }
    out += src.slice(from)
    return out.replace(/\s+/g, ' ').replace(/^[\s,，:：]+/, '').trim()
}

/** 한 줄 안내. 예) 「양치는영이 기획팀장에게 물어봤어요: 내 이름 뭐라고?」. 질문이 비면 「…을 불렀어요」 */
export function askLine(fromName: string, toName: string, question: string, max?: number): string {
    const from = (fromName ?? '').trim() || '봇'
    const to = (toName ?? '').trim() || '봇'
    let q = (question ?? '').replace(/\s+/g, ' ').trim()
    if (!q) return `${이가(from)} ${을를(to)} 불렀어요`
    if (max && q.length > max) q = `${q.slice(0, max).trimEnd()}…`
    return `${이가(from)} ${to}에게 물어봤어요: ${q}`
}

/** 사람 말 자리에 저장되는 줄 (두 번째 봇부터, 봇끼리 이어질 때). 모델도 이 글을 그대로 읽는다 */
export function askRowContent(fromName: string, toName: string, question: string): string {
    return `${ASK_TAG} ${askLine(fromName, toName, (question ?? '').slice(0, QUESTION_MAX))}`
}

export function isAskRow(content: string): boolean {
    return (content ?? '').startsWith(ASK_TAG)
}

/** 「[물어봄] A이 B에게 물어봤어요: q」 를 푼다. 이름은 팀 명단에서 먼저 찾는다 */
export function parseAskRow(
    content: string,
    bots: readonly ReplyBot[] = [],
): { fromName: string; toName: string; question: string } | null {
    if (!isAskRow(content)) return null
    const body = content.slice(ASK_TAG.length).trim()
    const names = [...(bots ?? [])].map(b => b.name).filter(Boolean).sort((a, b) => b.length - a.length)
    for (const f of names) {
        const head = `${이가(f)} `
        if (!body.startsWith(head)) continue
        const rest = body.slice(head.length)
        for (const t of names) {
            const asked = `${t}에게 물어봤어요:`
            if (rest.startsWith(asked)) return { fromName: f, toName: t, question: rest.slice(asked.length).trim() }
            if (rest === `${을를(t)} 불렀어요`) return { fromName: f, toName: t, question: '' }
        }
    }
    const m = body.match(/^(.+?)[이가] (.+?)에게 물어봤어요:\s?([\s\S]*)$/)
    if (m) return { fromName: m[1]!, toName: m[2]!, question: m[3]!.trim() }
    const c = body.match(/^(.+?)[이가] (.+?)[을를] 불렀어요$/)
    if (c) return { fromName: c[1]!, toName: c[2]!, question: '' }
    return null
}

/** 보내기 직전: 이 방 봇이 아닌 팀 봇을 불렀으면 답할 차례와 질문. 아니면 null (평소 대화) */
export function planMentionReplies<T extends ReplyBot>(
    text: string,
    bots: readonly T[],
    roomMentorId: string,
): { targets: T[]; question: string } | null {
    const t = (text ?? '').trim()
    if (!t) return null
    const targets = findMentionedBots(t, bots).filter(b => b.mentorId !== roomMentorId)
    if (targets.length === 0) return null
    return { targets, question: stripMentions(t, bots).slice(0, QUESTION_MAX) }
}

/** 봇 답 속에서 다음으로 불린 봇 (말한 봇 자신은 빼고). 없으면 null */
export function nextChainTarget<T extends ReplyBot>(answer: string, bots: readonly T[], speakerMentorId: string): T | null {
    return findMentionedBots(answer ?? '', bots).find(b => b.mentorId !== speakerMentorId) ?? null
}

export type ChatLine =
    | { kind: 'user'; noteAfter?: string }
    | { kind: 'note'; text: string }
    | { kind: 'bot'; speaker: ReplyBot }

/**
 * 저장된(또는 화면의) 줄 순서로 누가 말했는지 다시 알아낸다.
 * - 「[물어봄] …」 사람 줄 → 안내 줄. 바로 다음 봇 답은 불린 봇
 * - 다른 봇을 @부른 사람 말 → 그 아래 안내 줄. 바로 다음 봇 답은 처음 불린 봇
 * - 예전 「○○에게도 전달할게요.」 답은 이 방 봇 말로 두고 안내 줄도 달지 않는다
 */
export function attributeLines(
    messages: readonly { role: string; content: string }[],
    room: ReplyBot,
    bots: readonly ReplyBot[],
): ChatLine[] {
    const out: ChatLine[] = []
    let pending: ReplyBot | null = null
    const byName = (name: string): ReplyBot => bots.find(b => b.name === name) ?? { mentorId: '', name }
    for (const m of messages ?? []) {
        if (m.role === 'user') {
            const ask = parseAskRow(m.content, bots)
            if (ask) {
                out.push({ kind: 'note', text: askLine(ask.fromName, ask.toName, ask.question, NOTE_QUESTION_MAX) })
                pending = byName(ask.toName)
                continue
            }
            const plan = planMentionReplies(m.content, bots, room.mentorId)
            if (plan) {
                const first = plan.targets[0]!
                out.push({ kind: 'user', noteAfter: askLine(room.name, first.name, plan.question, NOTE_QUESTION_MAX) })
                pending = first
            } else {
                out.push({ kind: 'user' })
                pending = null
            }
            continue
        }
        const content = (m.content ?? '').trim()
        const oldAck = !!pending && content === handoffAckLine(pending.name)
        if (oldAck) {
            const prev = out[out.length - 1]
            if (prev?.kind === 'user') delete prev.noteAfter
        }
        out.push({ kind: 'bot', speaker: pending && !oldAck ? pending : room })
        pending = null
    }
    return out
}

/**
 * /api/chat 에 넘길 문맥. 답할 봇이 아닌 봇의 말은 「(기획팀장의 말) …」로 적어
 * 남의 말을 제 말로 착각하지 않게 한다. 사람 줄은 그대로 (마지막 줄 = 저장되는 사람 말).
 */
export function contextForBot<M extends { role: string; content: string }>(
    messages: readonly M[],
    lines: readonly ChatLine[],
    targetMentorId: string,
): M[] {
    return messages.map((m, i) => {
        const line = lines[i]
        if (m.role !== 'assistant' || line?.kind !== 'bot') return m
        if (line.speaker.mentorId === targetMentorId || !m.content) return m
        return { ...m, content: `(${line.speaker.name}의 말) ${m.content}` }
    })
}
