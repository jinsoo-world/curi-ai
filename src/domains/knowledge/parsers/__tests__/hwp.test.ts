import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parseHangul } from '../hwp'

const 샘플 = (이름: string) => readFileSync(path.resolve(__dirname, '../../../../../test/fixtures/hangul', 이름))
const 쌍 = ['서울DMC공급공고', '평통_공모안내서', '평통_지원서샘플']

describe('parseHangul 실제 공문서', () => {
    for (const 이름 of 쌍) {
        it(`${이름}: hwp 와 hwpx 가 같은 글을 내고 한글이 충분하다`, async () => {
            const hwp = await parseHangul(샘플(`${이름}.hwp`))
            const hwpx = await parseHangul(샘플(`${이름}.hwpx`))
            const 한글수 = (s: string) => (s.match(/[가-힣]/g) ?? []).length
            expect(한글수(hwp)).toBeGreaterThan(1500)
            expect(한글수(hwpx)).toBeGreaterThan(1500)
            expect(Math.abs(한글수(hwp) - 한글수(hwpx)) / 한글수(hwpx)).toBeLessThan(0.02)
        })
    }
    it('표가 살아 있다(칸 병합 표는 HTML, 단순 표는 파이프)', async () => {
        const out = await parseHangul(샘플('평통_지원서샘플.hwpx'))
        expect(out).toMatch(/<table>|\|---\|/)
        expect(out).toContain('자문위원 후보자 카드')
    })
    it('깨진 파일은 던진다(호출쪽이 업스테이지 등으로 넘김)', async () => {
        await expect(parseHangul(Buffer.from('this is not hwp'))).rejects.toThrow()
    })
})
