import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    classifyLookChange,
    pickNoticeLine,
    pickReplyLine,
    pickNoticer,
    shouldPostLookBeat,
    markLookBeatPosted,
    LOOK_BEAT_COOLDOWN_MS,
    NOTICE_COLOR,
    NOTICE_SHAPE,
    NOTICE_BOTH,
    REPLY_LINES,
    _resetLookBeatCooldownForTests,
    inferRoleHint,
    personaExcerpt,
    parseLookBanterJson,
    pickPersonaFallbackLines,
    generateLookBanterLines,
    buildLookBanterSystemPrompt,
    buildLookBanterUserPrompt,
} from '../look-change'

describe('classifyLookChange', () => {
    it('색만 바뀌면 color', () => {
        expect(classifyLookChange({ color: 'teal' })).toBe('color')
    })
    it('모양만 바뀌면 shape', () => {
        expect(classifyLookChange({ shape: 'hex' })).toBe('shape')
    })
    it('둘 다면 both', () => {
        expect(classifyLookChange({ shape: 'egg', color: 'blue' })).toBe('both')
    })
    it('이름/인사만이면 null', () => {
        expect(classifyLookChange({})).toBeNull()
    })
})

describe('템플릿 풀', () => {
    it('색/모양/둘다/답장 풀이 충분히 많다', () => {
        expect(NOTICE_COLOR.length).toBeGreaterThanOrEqual(8)
        expect(NOTICE_SHAPE.length).toBeGreaterThanOrEqual(8)
        expect(NOTICE_BOTH.length).toBeGreaterThanOrEqual(6)
        expect(REPLY_LINES.length).toBeGreaterThanOrEqual(8)
    })
    it('가운뎃점이나 긴 줄표를 쓰지 않는다', () => {
        const all = [...NOTICE_COLOR, ...NOTICE_SHAPE, ...NOTICE_BOTH, ...REPLY_LINES]
        for (const s of all) {
            expect(s).not.toMatch(/[·—]/)
            expect(s.trim().length).toBeGreaterThan(0)
        }
    })
})

describe('pickNoticeLine / pickReplyLine', () => {
    it('rng 로 고정하면 같은 줄을 고른다', () => {
        const rng = () => 0
        expect(pickNoticeLine('color', rng)).toBe(NOTICE_COLOR[0])
        expect(pickNoticeLine('shape', rng)).toBe(NOTICE_SHAPE[0])
        expect(pickNoticeLine('both', rng)).toBe(NOTICE_BOTH[0])
        expect(pickReplyLine(rng)).toBe(REPLY_LINES[0])
    })
    it('종류마다 다른 풀에서 고른다', () => {
        const rng = () => 0
        expect(pickNoticeLine('color', rng)).not.toBe(pickNoticeLine('shape', rng))
    })
    it('여러 번 뽑으면 풀 안 값이 나온다', () => {
        let i = 0
        const rng = () => {
            const v = (i++ % NOTICE_COLOR.length) / NOTICE_COLOR.length
            return v
        }
        const seen = new Set<string>()
        for (let n = 0; n < NOTICE_COLOR.length; n++) seen.add(pickNoticeLine('color', rng))
        expect(seen.size).toBeGreaterThan(1)
    })
})

describe('pickNoticer', () => {
    it('다른 봇이 없으면 null', () => {
        expect(pickNoticer([])).toBeNull()
    })
    it('한 명이면 그 봇', () => {
        expect(pickNoticer([{ mentorId: 'm2' }], () => 0)).toEqual({ mentorId: 'm2' })
    })
    it('여러 명이면 rng 로 고른다', () => {
        const others = [{ mentorId: 'a' }, { mentorId: 'b' }, { mentorId: 'c' }]
        expect(pickNoticer(others, () => 0)?.mentorId).toBe('a')
        expect(pickNoticer(others, () => 0.99)?.mentorId).toBe('c')
    })
})

describe('shouldPostLookBeat — 빠른 토글 쿨다운', () => {
    const store = new Map<string, number>()
    beforeEach(() => store.clear())

    it('처음엔 올린다', () => {
        expect(shouldPostLookBeat('u1', 'm1', 1000, store)).toBe(true)
    })
    it('올린 직후엔 막는다', () => {
        markLookBeatPosted('u1', 'm1', 1000, store)
        expect(shouldPostLookBeat('u1', 'm1', 1000 + LOOK_BEAT_COOLDOWN_MS - 1, store)).toBe(false)
    })
    it('쿨다운이 지나면 다시 올린다', () => {
        markLookBeatPosted('u1', 'm1', 1000, store)
        expect(shouldPostLookBeat('u1', 'm1', 1000 + LOOK_BEAT_COOLDOWN_MS, store)).toBe(true)
    })
    it('다른 봇은 서로 막지 않는다', () => {
        markLookBeatPosted('u1', 'm1', 1000, store)
        expect(shouldPostLookBeat('u1', 'm2', 1000, store)).toBe(true)
    })
})

describe('_resetLookBeatCooldownForTests', () => {
    it('전역 맵을 비운다', () => {
        markLookBeatPosted('u', 'm', Date.now())
        _resetLookBeatCooldownForTests()
        expect(shouldPostLookBeat('u', 'm')).toBe(true)
    })
})


describe('페르소나 힌트 / 발췌', () => {
    it('기획팀장 이름은 planning 힌트', () => {
        expect(inferRoleHint({ name: '기획팀장', oneLiner: '방향을 잡고 결정거리를 가져와요' })).toBe('planning')
    })
    it('홍보팀장 이름은 marketing 힌트', () => {
        expect(inferRoleHint({ name: '홍보팀장', oneLiner: '알리는 글과 답장 초안을 써요' })).toBe('marketing')
    })
    it('힌트 없으면 general', () => {
        expect(inferRoleHint({ name: '새 봇', oneLiner: '그냥 도와줘요' })).toBe('general')
    })
    it('발췌에 이름과 한 줄과 프롬프트 앞부분이 들어간다', () => {
        const ex = personaExcerpt({
            name: '기획팀장',
            oneLiner: '방향을 잡아요',
            systemPrompt: '너는 차분한 기획팀장이다. 우선순위를 먼저 말한다.',
        })
        expect(ex).toContain('기획팀장')
        expect(ex).toContain('방향을 잡아요')
        expect(ex).toContain('차분한 기획팀장')
        expect(ex).not.toMatch(/[·—]/)
    })
})

describe('parseLookBanterJson', () => {
    it('정상 JSON 을 읽는다', () => {
        expect(parseLookBanterJson('{"notice":"머리색 바꿨네?","reply":"응 기분이야"}')).toEqual({
            notice: '머리색 바꿨네?',
            reply: '응 기분이야',
        })
    })
    it('코드울타리와 군말이 있어도 읽는다', () => {
        const raw = '좋아요\n```json\n{"notice":"오 새 머리색","reply":"티 났어? 일 하자"}\n```\n'
        expect(parseLookBanterJson(raw)?.notice).toBe('오 새 머리색')
    })
    it('가운뎃점/긴줄표를 벗겨낸다', () => {
        const got = parseLookBanterJson('{"notice":"색·바꿨네","reply":"응—그래"}')
        expect(got?.notice).not.toMatch(/[·—]/)
        expect(got?.reply).not.toMatch(/[·—]/)
    })
    it('깨진 JSON 은 null', () => {
        expect(parseLookBanterJson('노노')).toBeNull()
        expect(parseLookBanterJson('{"notice":""}')).toBeNull()
    })
})

describe('pickPersonaFallbackLines — 역할 편향', () => {
    it('기획 눈치채기 풀이 기본 풀과 다를 수 있다', () => {
        const rng = () => 0
        const planner = { name: '기획팀장', oneLiner: '방향을 잡아요' }
        const marketer = { name: '홍보팀장', oneLiner: '알리는 글을 써요' }
        const a = pickPersonaFallbackLines('color', planner, marketer, rng)
        const b = pickNoticeLine('color', rng)
        // rng=0 이고 역할 풀이 65% 분기로 선택되면 역할 풀 첫 줄
        expect(a.notice.length).toBeGreaterThan(0)
        expect(a.reply.length).toBeGreaterThan(0)
        expect(a.notice).not.toMatch(/[·—]/)
        expect(a.reply).not.toMatch(/[·—]/)
        // 같은 rng 여도 역할 풀을 쓸 수 있어 기본 풀과 다를 수 있다
        expect(typeof b).toBe('string')
    })
})

describe('generateLookBanterLines — LLM / 폴백', () => {
    it('솔라가 JSON 을 주면 llm 소스', async () => {
        const ask = vi.fn(async () => '{"notice":"기획적으로 색이 새로워","reply":"홍보용으로 바꿔봤어. 카피나 하자"}')
        const got = await generateLookBanterLines({
            kind: 'color',
            noticer: { name: '기획팀장', oneLiner: '방향을 잡아요', systemPrompt: '차분히 우선순위를 말한다' },
            changed: { name: '홍보팀장', oneLiner: '알리는 글을 써요', systemPrompt: '밝고 센스 있게 홍보한다' },
            askSolarImpl: ask as never,
        })
        expect(got.source).toBe('llm')
        expect(got.notice).toContain('색')
        expect(got.reply.length).toBeGreaterThan(1)
        expect(ask).toHaveBeenCalledOnce()
        const call = ask.mock.calls[0] as unknown as [string, string]
        expect(call[0]).toContain('JSON')
        expect(call[1]).toContain('기획팀장')
        expect(call[1]).toContain('홍보팀장')
        expect(buildLookBanterSystemPrompt()).toContain('JSON')
    })
    it('솔라가 null 이면 template 폴백', async () => {
        const ask = vi.fn(async () => null)
        const got = await generateLookBanterLines({
            kind: 'shape',
            noticer: { name: '기획팀장' },
            changed: { name: '홍보팀장' },
            rng: () => 0,
            askSolarImpl: ask as never,
        })
        expect(got.source).toBe('template')
        expect(got.notice.length).toBeGreaterThan(0)
        expect(got.reply.length).toBeGreaterThan(0)
    })
    it('솔라가 깨진 답이면 template 폴백', async () => {
        const ask = vi.fn(async () => '그냥 말')
        const got = await generateLookBanterLines({
            kind: 'both',
            noticer: { name: '조사팀장', oneLiner: '자료를 찾아요' },
            changed: { name: '개발팀장', oneLiner: '도구를 정리해요' },
            rng: () => 0,
            askSolarImpl: ask as never,
        })
        expect(got.source).toBe('template')
    })
})

describe('밴터 프롬프트 규칙', () => {
    it('유저 프롬프트에 두 페르소나와 변경 종류가 들어간다', () => {
        const u = buildLookBanterUserPrompt({
            kind: 'color',
            noticer: { name: '기획팀장', oneLiner: '방향' },
            changed: { name: '홍보팀장', oneLiner: '홍보' },
        })
        expect(u).toContain('기획팀장')
        expect(u).toContain('홍보팀장')
        expect(u).toMatch(/머리색|색/)
    })
})
