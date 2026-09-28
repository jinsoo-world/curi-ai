import { describe, it, expect } from 'vitest'
import {
    findMentionedBots,
    stripMentions,
    askLine,
    askRowContent,
    parseAskRow,
    planMentionReplies,
    nextChainTarget,
    attributeLines,
    contextForBot,
    NOTE_QUESTION_MAX,
} from '../mention-reply'

const 양 = { mentorId: 'm-yang', name: '양치는영' }
const 기획 = { mentorId: 'm-plan', name: '기획팀장' }
const 요약 = { mentorId: 'm-sum', name: '요약봇' }
const 팀 = [양, 기획, 요약]

describe('findMentionedBots', () => {
    it('나온 순서대로, 같은 봇은 한 번', () => {
        expect(findMentionedBots('@요약봇 그리고 @기획팀장 @요약봇', 팀).map(b => b.name)).toEqual(['요약봇', '기획팀장'])
    })
    it('조사가 붙어도 찾는다', () => {
        expect(findMentionedBots('@양치는영이 내 이름 뭐라고?', 팀)).toEqual([양])
    })
    it('전각 ＠ 도 본다', () => {
        expect(findMentionedBots('＠기획팀장 안녕', 팀)).toEqual([기획])
    })
    it('멘션이 없으면 빈 배열', () => {
        expect(findMentionedBots('기획팀장 안녕', 팀)).toEqual([])
    })
})

describe('stripMentions', () => {
    it('뒤에 붙은 멘션을 뗀다', () => {
        expect(stripMentions('내 이름 뭐라고? @기획팀장', 팀)).toBe('내 이름 뭐라고?')
    })
    it('이름에 붙은 조사도 뗀다', () => {
        expect(stripMentions('@양치는영이 내 이름 뭐라고?', 팀)).toBe('내 이름 뭐라고?')
        expect(stripMentions('@기획팀장님, 오늘 할 일', 팀)).toBe('오늘 할 일')
    })
    it('띄어 쓴 낱말은 조사로 보지 않는다', () => {
        expect(stripMentions('@기획팀장 이거 봐줘', 팀)).toBe('이거 봐줘')
    })
    it('여러 명을 모두 뗀다', () => {
        expect(stripMentions('@기획팀장 @요약봇 정리해 줘', 팀)).toBe('정리해 줘')
    })
})

describe('askLine', () => {
    it('받침에 맞춰 이/가, 가운뎃점과 긴 줄표 없음', () => {
        const line = askLine('양치는영', '기획팀장', '내 이름 뭐라고?')
        expect(line).toBe('양치는영이 기획팀장에게 물어봤어요: 내 이름 뭐라고?')
        expect(line).not.toMatch(/[·—]/)
        expect(askLine('비서', '요약봇', '안녕')).toBe('비서가 요약봇에게 물어봤어요: 안녕')
    })
    it('질문이 비면 불렀어요', () => {
        expect(askLine('양치는영', '기획팀장', '')).toBe('양치는영이 기획팀장을 불렀어요')
        expect(askLine('양치는영', '비서', ' ')).toBe('양치는영이 비서를 불렀어요')
    })
    it('길면 줄인다', () => {
        const line = askLine('양치는영', '기획팀장', '가'.repeat(200), NOTE_QUESTION_MAX)
        expect(line.endsWith('…')).toBe(true)
        expect(line.length).toBeLessThan(100)
    })
})

describe('askRowContent / parseAskRow', () => {
    it('저장한 줄을 다시 푼다', () => {
        const row = askRowContent('양치는영', '요약봇', '내 이름 뭐라고?')
        expect(row.startsWith('[물어봄] ')).toBe(true)
        expect(parseAskRow(row, 팀)).toEqual({ fromName: '양치는영', toName: '요약봇', question: '내 이름 뭐라고?' })
    })
    it('명단에 없는 이름도 푼다', () => {
        expect(parseAskRow('[물어봄] 옛봇이 새봇에게 물어봤어요: 안녕', [])).toEqual({ fromName: '옛봇', toName: '새봇', question: '안녕' })
    })
    it('불렀어요 줄도 푼다', () => {
        expect(parseAskRow(askRowContent('양치는영', '기획팀장', ''), 팀)).toEqual({ fromName: '양치는영', toName: '기획팀장', question: '' })
    })
    it('머리표가 없으면 null', () => {
        expect(parseAskRow('양치는영이 기획팀장에게 물어봤어요: 안녕', 팀)).toBeNull()
    })
})

describe('planMentionReplies', () => {
    it('양치는영 방에서 「내 이름 뭐라고? @기획팀장」 → 기획팀장이 답한다', () => {
        expect(planMentionReplies('내 이름 뭐라고? @기획팀장', 팀, 양.mentorId)).toEqual({ targets: [기획], question: '내 이름 뭐라고?' })
    })
    it('기획팀장 방에서 「@양치는영이 내 이름 뭐라고?」 → 양치는영이 답한다', () => {
        expect(planMentionReplies('@양치는영이 내 이름 뭐라고?', 팀, 기획.mentorId)).toEqual({ targets: [양], question: '내 이름 뭐라고?' })
    })
    it('여러 명이면 순서대로, 이 방 봇은 뺀다', () => {
        expect(planMentionReplies('@양치는영 @요약봇 @기획팀장 정리', 팀, 양.mentorId)?.targets).toEqual([요약, 기획])
    })
    it('이 방 봇만 부르거나 멘션이 없으면 null (평소 대화)', () => {
        expect(planMentionReplies('@양치는영 안녕', 팀, 양.mentorId)).toBeNull()
        expect(planMentionReplies('안녕', 팀, 양.mentorId)).toBeNull()
        expect(planMentionReplies('', 팀, 양.mentorId)).toBeNull()
    })
})

describe('nextChainTarget', () => {
    it('답 속에서 다른 봇을 부르면 그 봇', () => {
        expect(nextChainTarget('이건 @요약봇 이 더 잘 알아요', 팀, 기획.mentorId)).toEqual(요약)
    })
    it('자기 자신만 부르면 null', () => {
        expect(nextChainTarget('@기획팀장 입니다', 팀, 기획.mentorId)).toBeNull()
        expect(nextChainTarget('그냥 답', 팀, 기획.mentorId)).toBeNull()
    })
})

describe('attributeLines', () => {
    const room = 양
    it('멘션한 사람 말 아래 안내 줄, 다음 답은 불린 봇', () => {
        const lines = attributeLines([
            { role: 'user', content: '안녕' },
            { role: 'assistant', content: '안녕하세요' },
            { role: 'user', content: '내 이름 뭐라고? @기획팀장' },
            { role: 'assistant', content: '진수님이에요.' },
            { role: 'user', content: askRowContent('양치는영', '요약봇', '내 이름 뭐라고?') },
            { role: 'assistant', content: '진수님이요.' },
            { role: 'user', content: '고마워' },
            { role: 'assistant', content: '천만에요' },
        ], room, 팀)
        expect(lines).toEqual([
            { kind: 'user' },
            { kind: 'bot', speaker: 양 },
            { kind: 'user', noteAfter: '양치는영이 기획팀장에게 물어봤어요: 내 이름 뭐라고?' },
            { kind: 'bot', speaker: 기획 },
            { kind: 'note', text: '양치는영이 요약봇에게 물어봤어요: 내 이름 뭐라고?' },
            { kind: 'bot', speaker: 요약 },
            { kind: 'user' },
            { kind: 'bot', speaker: 양 },
        ])
    })
    it('예전 「전달할게요」 답은 이 방 봇 말, 안내 줄 없음', () => {
        const lines = attributeLines([
            { role: 'user', content: '내 이름 뭐라고? @기획팀장' },
            { role: 'assistant', content: '기획팀장에게도 전달할게요.' },
        ], room, 팀)
        expect(lines).toEqual([{ kind: 'user' }, { kind: 'bot', speaker: 양 }])
    })
    it('아직 답이 없는 빈 자리도 불린 봇 차례', () => {
        const lines = attributeLines([
            { role: 'user', content: '@기획팀장 안녕' },
            { role: 'assistant', content: '' },
        ], room, 팀)
        expect(lines[1]).toEqual({ kind: 'bot', speaker: 기획 })
    })
})

describe('contextForBot', () => {
    it('다른 봇의 말에는 누구 말인지 붙이고, 제 말과 사람 말은 그대로', () => {
        const msgs = [
            { role: 'user', content: '내 이름은 진수야' },
            { role: 'assistant', content: '반가워요 진수님' },
            { role: 'user', content: '내 이름 뭐라고? @기획팀장' },
        ]
        const lines = attributeLines(msgs, 양, 팀)
        expect(contextForBot(msgs, lines, 기획.mentorId)).toEqual([
            { role: 'user', content: '내 이름은 진수야' },
            { role: 'assistant', content: '(양치는영의 말) 반가워요 진수님' },
            { role: 'user', content: '내 이름 뭐라고? @기획팀장' },
        ])
        expect(contextForBot(msgs, lines, 양.mentorId)[1]!.content).toBe('반가워요 진수님')
    })
})
