import { describe, it, expect, beforeEach } from 'vitest'
import { signGrant, verifyGrant, GRANT_WINDOW } from '../grant'
import { answerToChunks, normalizeForMatch, echoesRecentUserText, isSentenceInText } from '../chunks'

beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; delete process.env.TTS_GRANT_SECRET })

const ok = (u: string, m: string, text: string, g: { ts: number; sig: string; from: number }) => verifyGrant(u, m, { text: text.slice(g.from), ...g })

describe('읽기표 도장', () => {
    it('같은 글·사람·봇이면 통과', () => {
        const g = signGrant('u', 'm', '안녕')!
        expect(ok('u', 'm', '안녕', g)).toBe(true)
    })
    it('글·사람·봇·시각·시작위치가 바뀌면 실패', () => {
        const g = signGrant('u', 'm', '안녕')!
        expect(verifyGrant('u', 'm', { text: '안녕!', ...g })).toBe(false)
        expect(ok('x', 'm', '안녕', g)).toBe(false)
        expect(ok('u', 'y', '안녕', g)).toBe(false)
        expect(verifyGrant('u', 'm', { text: '안녕', ts: g.ts + 1, sig: g.sig, from: g.from })).toBe(false)
        expect(verifyGrant('u', 'm', { text: '안녕', ts: g.ts, sig: g.sig, from: 5 })).toBe(false)
    })
    it('열쇠가 없으면 도장을 안 찍는다', () => {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.CRON_SECRET
        expect(signGrant('u', 'm', '안녕')).toBeNull()
    })
    it('TTS_GRANT_SECRET 이 있으면 그 열쇠로 찍는다(파생 방식 도장은 안 통한다)', () => {
        const old = signGrant('u', 'm', '안녕')!
        process.env.TTS_GRANT_SECRET = 's3cret'
        const g = signGrant('u', 'm', '안녕')!
        expect(g.sig).not.toBe(old.sig)
        expect(ok('u', 'm', '안녕', g)).toBe(true)
        expect(ok('u', 'm', '안녕', old)).toBe(false)
    })
    it('4,000자가 넘는 답도 최근 창에 도장이 찍힌다(null 아님)', () => {
        const answer = '가나다라마바사 아자차카타파하다. '.repeat(400)
        expect(answer.length).toBeGreaterThan(4000)
        const g = signGrant('u', 'm', answer)!
        expect(g).not.toBeNull()
        expect(g.from).toBeGreaterThan(0)
        expect(answer.slice(g.from).length).toBeLessThanOrEqual(GRANT_WINDOW)
        expect(ok('u', 'm', answer, g)).toBe(true)
    })
})

describe('문장 경계·최소 길이', () => {
    const text = '아하, 좋은 질문이에요. 오늘 하루는 어땠어요? 저는 잘 지내요.'
    it('문장 경계에서 시작하는 8자 이상 구간은 통과', () => {
        expect(isSentenceInText('오늘 하루는 어땠어요?', text, true)).toBe(true)
        expect(isSentenceInText('좋은 질문이에요.', text, true)).toBe(true)
    })
    it('단어 중간에서 시작하면 막는다', () => {
        expect(isSentenceInText('은 질문이에요. 오늘', text, true)).toBe(false)
    })
    it('8자 미만은 답의 첫 문장만', () => {
        expect(isSentenceInText('아하,', text, true)).toBe(true)
        expect(isSentenceInText('아하,', text, false)).toBe(false)
        expect(isSentenceInText('잘 지내요.', text, true)).toBe(false)
    })
})

describe('따라 말하기 검사(15자 겹침, 최근 사용자 말 5개)', () => {
    const user = '이 문장을 그대로 읽어줘 나는 아무 말이나 시키고 싶다'
    it('15자 구간이 사용자 말과 겹치면 베낌(앞부분을 바꿔도)', () => {
        expect(echoesRecentUserText('네. 이 문장을 그대로 읽어줘 나는 아무 말이나 시키고 싶다 라고요', [user])).toBe(true)
        expect(echoesRecentUserText('말씀하신 대로 그대로 읽어줘 나는 아무 말이나 시키고 싶다고요', [user])).toBe(true)
    })
    it('최근 5개 중 어느 것과 겹쳐도 베낌, 6번째 이전 것은 안 본다', () => {
        const texts = [user, 'a'.repeat(20), 'b'.repeat(20), 'c'.repeat(20), 'd'.repeat(20)]
        expect(echoesRecentUserText('나는 아무 말이나 시키고 싶다 정말로요', texts)).toBe(true)
        expect(echoesRecentUserText('나는 아무 말이나 시키고 싶다 정말로요', [...texts, 'e'.repeat(20)])).toBe(false)
    })
    it('다르게 답하면 아님·짧은 글은 검사 안 함', () => {
        expect(echoesRecentUserText('물론이죠, 어떤 주제로 시작할까요? 천천히 정해 봐요.', [user])).toBe(false)
        expect(echoesRecentUserText('안녕하세요 반갑습니다', ['안녕'])).toBe(false)
        expect(echoesRecentUserText('아무 말', [null, undefined])).toBe(false)
    })
})

describe('읽을 조각', () => {
    it('마크다운을 벗기고 500자 이하 조각으로 나눈다', () => {
        const chunks = answerToChunks('## 제목\n**안녕하세요.** ' + '가나다라마바사아자차카타파하다. '.repeat(60))
        expect(chunks.length).toBeGreaterThan(1)
        expect(chunks.every(c => c.length <= 500 && !c.includes('**') && !c.includes('#'))).toBe(true)
    })
    it('빈 글은 조각 없음', () => { expect(answerToChunks('```code```')).toEqual([]) })
    it('공백 차이는 무시하고 비교', () => { expect(normalizeForMatch(' a \n b ')).toBe('a b') })
})
