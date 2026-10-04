// 링크와 글 넣기 공통 규칙 (1005): 입구마다 달랐던 최소 글자, 이유 문구, 칸 셈을 한 곳에서 본다
import { describe, it, expect } from 'vitest'
import { MIN_TEXT_CHARS, enoughText, accountKeyOf, failCodeOfReason, canRetry, canPaste, readSummaryLine, linkLabelOf, FULL_LINE, TOO_SHORT_LINE, RETRY_LABEL } from '../link-rules'
import { josa, snsFail } from '../readers/social-fetch'

describe('link-rules 최소 글자', () => {
    it('어느 입구든 공백 빼고 30자부터', () => {
        expect(MIN_TEXT_CHARS).toBe(30)
        expect(enoughText('가'.repeat(29))).toBe(false)
        expect(enoughText('가'.repeat(30))).toBe(true)
        expect(enoughText(' 가 '.repeat(30))).toBe(true)
        expect(enoughText(null)).toBe(false)
    })
})

describe('link-rules 칸 셈 열쇠', () => {
    it('같은 블로그의 글은 한 칸 (RSS 주소, 글 주소 모두)', () => {
        const k = accountKeyOf('https://blog.naver.com/ranto28')
        expect(k).toBe('naver:ranto28')
        expect(accountKeyOf('https://blog.naver.com/ranto28/223000001')).toBe(k)
        expect(accountKeyOf('https://rss.blog.naver.com/ranto28.xml')).toBe(k)
        expect(accountKeyOf('https://notice.tistory.com/1')).toBe(accountKeyOf('https://notice.tistory.com/entry/a'))
        expect(accountKeyOf('https://brunch.co.kr/@curi/12')).toBe('brunch:@curi')
    })
    it('계정을 못 알아보는 주소는 열쇠 없음 (글마다 칸 하나)', () => {
        expect(accountKeyOf('https://example.com/a')).toBeNull()
        expect(accountKeyOf('그냥 글')).toBeNull()
    })
})

describe('link-rules 이유와 다시 시도', () => {
    it('이유 글에서 갈래를 가린다', () => {
        expect(failCodeOfReason('인스타그램이 지금 읽기를 막고 있어요')).toBe('blocked')
        expect(failCodeOfReason('인스타그램에서 글을 읽지 못했어요. 비공개 계정이거나 주소가 달라요')).toBe('not_public')
        expect(failCodeOfReason('스레드를 읽는 데 시간이 너무 걸렸어요')).toBe('timeout')
        expect(failCodeOfReason(FULL_LINE)).toBe('full')
    })
    it('막힘, 시간 초과는 다시 시도, 비공개는 붙여넣기만', () => {
        expect(canRetry('blocked')).toBe(true)
        expect(canRetry('timeout')).toBe(true)
        expect(canRetry('not_public')).toBe(false)
        expect(canPaste('not_public')).toBe(true)
        expect(canPaste('full')).toBe(false)
        expect(RETRY_LABEL).toBe('다시 시도')
    })
    it('고객 문구에 숫자 한도, 가운데점, 긴 대시가 없다', () => {
        for (const line of [FULL_LINE, TOO_SHORT_LINE, readSummaryLine(['블로그 글 3개']), snsFail('인스타그램', 'blocked').reason, snsFail('스레드', 'profile_only').reason]) {
            expect(line).not.toMatch(/[\u00b7\u2014\u2013]/)
        }
        expect(FULL_LINE).not.toMatch(/\d/)
        expect(TOO_SHORT_LINE).not.toMatch(/\d/)
    })
    it('읽은 결과 한 줄', () => {
        expect(readSummaryLine([])).toBe('')
        expect(readSummaryLine(['블로그 글 3개', '인스타 글 2개'])).toBe('블로그 글 3개, 인스타 글 2개를 읽었어요')
    })
    it('곳 이름', () => {
        expect(linkLabelOf('https://www.instagram.com/nasa')).toBe('인스타그램')
        expect(linkLabelOf('threads.com/@nasa')).toBe('스레드')
        expect(linkLabelOf('https://blog.naver.com/a')).toBe('네이버 블로그')
    })
})

describe('받침에 맞는 조사', () => {
    it('인스타그램이, 스레드가', () => {
        expect(josa('인스타그램', '이', '가')).toBe('이')
        expect(josa('스레드', '이', '가')).toBe('가')
        expect(snsFail('인스타그램', 'blocked').reason).toBe('인스타그램이 지금 읽기를 막고 있어요')
        expect(snsFail('스레드', 'blocked').reason).toBe('스레드가 지금 읽기를 막고 있어요')
        expect(snsFail('스레드', 'timeout').reason).toContain('스레드를')
    })
})
