import { describe, it, expect } from 'vitest'
import { parseHangul } from '../hwp'
import { 만든hwpx, 로컬샘플, 로컬샘플있음 } from './helpers'

describe('parseHangul — 코드로 만든 hwpx', () => {
    it('hwpx 한글 문단을 읽는다', async () => {
        const out = await parseHangul(await 만든hwpx(['큐리AI 한글 문서', '둘째 문단입니다']))
        expect(out).toContain('큐리AI 한글 문서')
        expect(out).toContain('둘째 문단입니다')
    })
    it('깨진 파일은 던진다(호출쪽이 업스테이지 등으로 넘김)', async () => {
        await expect(parseHangul(Buffer.from('this is not hwp'))).rejects.toThrow()
    })
})

const 쌍 = ['서울DMC공급공고', '평통_공모안내서', '평통_지원서샘플']
describe('parseHangul 실제 공문서 — test/fixtures-local 이 있을 때만', () => {
    for (const 이름 of 쌍) {
        it.skipIf(!로컬샘플있음('hangul', `${이름}.hwp`))(`${이름}: hwp 와 hwpx 가 같은 글을 내고 한글이 충분하다`, async () => {
            const hwp = await parseHangul(로컬샘플('hangul', `${이름}.hwp`))
            const hwpx = await parseHangul(로컬샘플('hangul', `${이름}.hwpx`))
            const 한글수 = (s: string) => (s.match(/[가-힣]/g) ?? []).length
            expect(한글수(hwp)).toBeGreaterThan(1500)
            expect(Math.abs(한글수(hwp) - 한글수(hwpx)) / 한글수(hwpx)).toBeLessThan(0.02)
        })
    }
    it.skipIf(!로컬샘플있음('hangul', '평통_지원서샘플.hwpx'))('표가 살아 있다', async () => {
        const out = await parseHangul(로컬샘플('hangul', '평통_지원서샘플.hwpx'))
        expect(out).toMatch(/<table>|\|---\|/)
    })
})
