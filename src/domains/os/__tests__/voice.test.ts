import { describe, it, expect } from 'vitest'
import { analyzeVoice, buildVoiceGuide, splitSentences, stripParticle, isPolite } from '../voice'
import { buildTwinPrompt, TWIN_HARD_LIMITS } from '../twin'
import { buildBotPrompt } from '../presets'
import type { NewBotInput } from '../types'

const 존댓말샘플 = [
    '안녕하세요. 오늘도 한 걸음 나가 보려고 합니다.',
    '저는 오십에 유튜브를 시작했어요. 늦었다고 생각했는데 아니었어요.',
    '처음부터 잘하는 사람은 없어요. 그냥 오늘 하나만 해 보세요.',
]

const 평어샘플 = [
    '늦었다는 말은 틀렸다. 시작한 사람만 남는다.',
    '오늘 하나만 한다. 내일은 내일 생각한다.',
]

describe('os/voice — 문장·조사 나누기', () => {
    it('마침표와 줄바꿈으로 문장을 나눈다', () => {
        expect(splitSentences('가나다. 라마바!\n사아자?')).toEqual(['가나다.', '라마바!', '사아자?'])
    })

    it('빈 줄과 기호만 있는 줄은 문장으로 세지 않는다', () => {
        expect(splitSentences('가나다.\n\n---\n  \n라마바.')).toEqual(['가나다.', '라마바.'])
    })

    it('조사를 뗀다. 너무 짧아지면 원래 낱말을 쓴다', () => {
        expect(stripParticle('유튜브를')).toBe('유튜브')
        expect(stripParticle('시작은')).toBe('시작')
        expect(stripParticle('나는')).toBe('나는')   // 두 글자라 떼면 한 글자 → 그대로
    })

    it('존댓말 문장을 알아본다', () => {
        expect(isPolite('시작해 보세요.')).toBe(true)
        expect(isPolite('시작했습니다!')).toBe(true)
        expect(isPolite('시작한다.')).toBe(false)
    })
})

describe('os/voice — 말투 특징 뽑기', () => {
    it('글이 하나도 없으면 0으로 돌려주고 터지지 않는다', () => {
        const p = analyzeVoice([])
        expect(p.sentenceCount).toBe(0)
        expect(p.avgSentenceLength).toBe(0)
        expect(p.topWords).toEqual([])
        expect(buildVoiceGuide(p)).toContain('글 샘플이 없다')
    })

    it('빈 문자열만 넣어도 터지지 않는다', () => {
        expect(analyzeVoice(['', '   ', '\n']).sentenceCount).toBe(0)
    })

    it('존댓말 글이면 존댓말 비율이 높게 나온다', () => {
        const p = analyzeVoice(존댓말샘플)
        expect(p.sampleCount).toBe(3)
        expect(p.sentenceCount).toBeGreaterThan(4)
        expect(p.politeRatio).toBeGreaterThan(0.7)
        expect(p.avgSentenceLength).toBeGreaterThan(0)
        expect(p.maxSentenceLength).toBeGreaterThanOrEqual(p.avgSentenceLength)
    })

    it('평어 글이면 존댓말 비율이 낮게 나온다', () => {
        expect(analyzeVoice(평어샘플).politeRatio).toBeLessThan(0.3)
    })

    it('자주 쓰는 낱말은 조사를 뗀 모양으로 세고, 흔한 말은 뺀다', () => {
        const p = analyzeVoice(['유튜브를 시작했어요. 유튜브는 어렵지 않아요. 유튜브가 답이에요.'])
        expect(p.topWords[0].word).toBe('유튜브')
        expect(p.topWords[0].count).toBe(3)
        expect(p.topWords.map(w => w.word)).not.toContain('정말')
    })

    it('문장 끝 패턴을 센다', () => {
        const p = analyzeVoice(존댓말샘플)
        expect(p.endings.length).toBeGreaterThan(0)
        expect(p.endings.every(e => e.ending.startsWith('~'))).toBe(true)
    })

    it('이모지·느낌표·물음표를 알아본다', () => {
        const p = analyzeVoice(['오늘 시작했어요 🌱', '정말 좋아요!', '같이 해 볼까요?'])
        expect(p.usesEmoji).toBe(true)
        expect(p.exclamationRatio).toBeGreaterThan(0)
        expect(p.questionRatio).toBeGreaterThan(0)
        expect(analyzeVoice(평어샘플).usesEmoji).toBe(false)
    })

    it('상위 낱말은 10개를 넘지 않는다', () => {
        const many = Array.from({ length: 30 }, (_, i) => `낱말${i}번 낱말${i}번 끝났어요.`)
        expect(analyzeVoice(many).topWords.length).toBeLessThanOrEqual(10)
    })
})

describe('os/voice — 말투 규칙 문단', () => {
    it('숫자(평균 글자 수)와 금지(줄표·중간점)가 문단에 들어간다', () => {
        const g = buildVoiceGuide(analyzeVoice(존댓말샘플))
        expect(g).toContain('[말투 규칙')
        expect(g).toMatch(/평균 \d+자/)
        expect(g).toContain('줄표')
        expect(g).toContain('존댓말')
    })

    it('이모지를 안 쓰는 사람에겐 「쓰지 않는다」가 붙는다', () => {
        expect(buildVoiceGuide(analyzeVoice(평어샘플))).toContain('이모지를 쓰지 않는다')
    })

    it('이모지를 쓰는 사람에겐 「1개까지」가 붙는다', () => {
        expect(buildVoiceGuide(analyzeVoice(['오늘도 한 걸음 🌱', '좋아요 😊']))).toContain('1개까지')
    })
})

describe('os/twin — 디지털 나 설명 조립', () => {
    const input: NewBotInput = {
        job: 'fan_reply', autonomy: 'always_ask', name: '디지털 나', shape: 'circle', color: 'orange',
    }
    const guide = buildVoiceGuide(analyzeVoice(존댓말샘플))
    const profile = {
        ownerName: '열정진',
        publicIntro: '큐리어스 대표. 40·50·60대 크리에이터 플랫폼을 만든다.',
        audience: '4060 수강생·구독자',
        topics: ['강의 신청과 수강 방법'],
    }

    it('주인 이름·소개·말투 규칙이 모두 들어간다', () => {
        const p = buildTwinPrompt(input, guide, profile)
        expect(p).toContain('「디지털 나」')
        expect(p).toContain('열정진님')
        expect(p).toContain('큐리어스 대표')
        expect(p).toContain('[말투 규칙')
        expect(p).toContain('4060 수강생·구독자')
        expect(p).toContain('강의 신청과 수강 방법')
    })

    it('절대 하지 않는 것 7개가 모두 들어간다', () => {
        const p = buildTwinPrompt(input, guide, profile)
        for (const l of TWIN_HARD_LIMITS) expect(p).toContain(l)
    })

    it('본인이 아니라 초안을 쓴다고 못 박는다', () => {
        expect(buildTwinPrompt(input, guide, profile)).toContain('본인이 아니다')
    })

    it('기본 승인 모드면 「이대로 보낼까요?」로 묻는다', () => {
        expect(buildTwinPrompt(input, guide, profile)).toContain('이대로 보낼까요?')
    })

    it('초안만 모드면 보내기 문구가 사라진다', () => {
        const p = buildTwinPrompt({ ...input, autonomy: 'draft_only' }, guide, profile)
        expect(p).toContain('초안만 만든다')
        expect(p).not.toContain('이대로 보낼까요?')
    })

    it('직접 쓰기(custom)면 사용자가 쓴 한 줄이 맡은 일이 된다', () => {
        const p = buildTwinPrompt(
            { ...input, job: 'custom', customJob: '  팬 질문에 내 말투로 답장 초안 ' }, guide, profile,
        )
        expect(p).toContain('팬 질문에 내 말투로 답장 초안')
    })

    it('직접 쓰기여도 산출물 모양은 두루뭉술하지 않다', () => {
        const p = buildTwinPrompt({ ...input, job: 'custom', customJob: '답장 초안' }, guide, profile)
        expect(p).not.toContain('요청한 일의 결과물')
        expect(p).toContain('3~6문장')
    })

    it('산출물 모양을 직접 주면 그게 쓰인다', () => {
        const p = buildTwinPrompt(input, guide, { ...profile, outputShape: '한 줄 요약만' })
        expect(p).toContain('한 줄 요약만')
    })

    it('추가 금지·넘길 곳을 주면 그대로 들어간다', () => {
        const p = buildTwinPrompt(input, guide, {
            ...profile, neverDo: ['정치 이야기를 하지 않는다'], handoff: '고객센터로 안내한다',
        })
        expect(p).toContain('정치 이야기를 하지 않는다')
        expect(p).toContain('고객센터로 안내한다')
    })

    it('presets.buildBotPrompt 는 그대로다 (트윈은 따로 만든다)', () => {
        const old = buildBotPrompt(input, '열정진')
        expect(old).toContain('AI 팀원(봇)이다')
        expect(old).not.toContain('[말투 규칙')
        expect(old).not.toContain('디지털 분신')
    })
})
