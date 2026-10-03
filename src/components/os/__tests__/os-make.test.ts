// /os/make (대표 확정 1003 「OS UI에 다 옮겨놔. SNS 주소 입력하는 것도」): 새 API 없이 /home 과 같은 API·문구를 쓴다
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { HOME_COPY } from '@/domains/home/copy'

const src = readFileSync('src/components/os/OsMake.tsx', 'utf8')
const shell = readFileSync('src/components/os/OsShell.tsx', 'utf8')
const first = readFileSync('src/app/os/page.tsx', 'utf8')

describe('/os/make', () => {
    it('대표가 준 문구 그대로', () => {
        expect(HOME_COPY.title).toBe('내 SNS 주소만 넣으면, 나처럼 말하는 AI가 생겨요')
        expect(HOME_COPY.sub).toBe('블로그, 유튜브, 인스타, 스레드, 파는 상품 주소를 넣어 보세요. 파일을 올려도 돼요.')
        expect(HOME_COPY.chips.map(c => c.label)).toEqual(['블로그', '유튜브', '인스타그램', '스레드', '상품', '파일'])
        expect(HOME_COPY.multi).toBe('여러 자료 입력 가능')
        expect(HOME_COPY.make).toBe('내 AI 만들기')
        expect(src).toContain('HOME_COPY')
    })
    it('기존 API 두 개만 부르고, 만든 뒤 그 봇 대화방으로 간다', () => {
        expect(src).toContain("'/api/os/twin-draft'")
        expect(src).toContain("'/api/os/twin-draft/create'")
        expect(src).toContain('router.push(`/os/chat/${bot.mentorId}`)')
        const apis = src.match(/fetch\([`'"]\/api\/[^`'"?]+/g) ?? []
        expect(new Set(apis.map(a => a.replace(/fetch\([`'"]/, '')))).toEqual(new Set(['/api/home/link-title', '/api/os/twin-draft', '/api/os/twin-draft/create']))
    })
    it('손님은 보관 후 카카오 로그인으로, 돌아오면 이 화면이 이어 만든다', () => {
        expect(src).toContain('saveHomeDraft')
        expect(src).toContain("OS_MAKE_PATH = '/os/make'")
        expect(src).toContain('provider=kakao')
        expect(src).toContain('readHomeDraft')
    })
    it('「＋ 개인봇」과 손님 첫 문이 /os/make 로', () => {
        expect(shell).toContain('router.push(`/os/make${demo ? \'?demo=1\' : \'\'}`)')
        expect(first).toContain("router.replace('/os/make')")
        expect(first).not.toContain("router.replace('/os/welcome')")
    })
})
