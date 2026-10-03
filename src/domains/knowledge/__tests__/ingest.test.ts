// 자료 넣기 보강 (1003): 조각 겹침·메타, 원문 해시, 자세한 문장 고르기, 동시 실행. 인터넷·DB 없음.
import { describe, it, expect } from 'vitest'
import {
    INGEST_CHUNK_MAX, INGEST_OVERLAP_MAX, chunkForIngest, chunkMeta, contentHash, pickDetailSentences, runPool,
} from '../ingest'

const sentence = (n: number) => `이것은 ${n}번째 문장이고 강의에서 나눈 이야기를 적었습니다.`

describe('chunkForIngest: 한국어 문단, 문장 경계 + 겹침', () => {
    it('짧은 글(인스타 캡션 한 편)은 조각 하나, 겹침 없음', () => {
        const c = chunkForIngest('오늘 수강생 12명과 첫 수업을 했어요. 다들 고마워요!')
        expect(c).toHaveLength(1)
        expect(c[0]).toMatchObject({ index: 0, total: 1, overlap: '' })
    })

    it('긴 글은 조각마다 한도 안, 문장 중간에서 자르지 않는다', () => {
        const text = Array.from({ length: 60 }, (_, i) => sentence(i + 1)).join(' ')
        const c = chunkForIngest(text)
        expect(c.length).toBeGreaterThan(3)
        for (const x of c) {
            expect(x.text.length).toBeLessThanOrEqual(INGEST_CHUNK_MAX + INGEST_OVERLAP_MAX + 1)
            expect(x.text.trim().endsWith('.')).toBe(true)
        }
        expect(c.map(x => x.total)).toEqual(c.map(() => c.length))
    })

    it('두 번째 조각부터 앞 조각 끝 문장을 겹쳐 붙인다 (경계에 걸린 사실이 반쪽이 되지 않게)', () => {
        const text = Array.from({ length: 60 }, (_, i) => sentence(i + 1)).join(' ')
        const c = chunkForIngest(text)
        const prevLast = c[0].text.split(/(?<=\.)\s+/).pop()!
        expect(c[1].overlap).toBe(prevLast)
        expect(c[1].text.startsWith(prevLast)).toBe(true)
        expect(c[1].overlap.length).toBeLessThanOrEqual(INGEST_OVERLAP_MAX)
    })

    it('새 소제목으로 시작하는 조각에는 겹침을 붙이지 않는다', () => {
        const part = Array.from({ length: 14 }, (_, i) => sentence(i + 1)).join(' ')
        const c = chunkForIngest(`# 1장 시작\n${part}\n\n# 2장 가격\n${part}`)
        const second = c.find(x => x.heading === '2장 가격' && x.text.startsWith('# 2장'))
        expect(second).toBeDefined()
        expect(second!.overlap).toBe('')
    })

    it('인스타·스레드 묶음의 「---」 줄은 조각에 남기지 않는다', () => {
        const c = chunkForIngest('첫 글이에요. 수업 후기입니다.\n\n---\n\n둘째 글이에요. 책 추천입니다.')
        expect(c.map(x => x.text).join('\n')).not.toMatch(/^-{3,}$/m)
        expect(c).toHaveLength(1)
    })

    it('유튜브 자막의 [분:초]를 조각마다 시작 시각으로 남긴다. 표식이 없는 조각은 앞 시각을 잇는다', () => {
        const lines = Array.from({ length: 30 }, (_, i) => `[${i}:00] ${sentence(i)} ${sentence(i + 100)}`).join('\n')
        const c = chunkForIngest(lines)
        expect(c[0].t).toBe('0:00')
        expect(c.length).toBeGreaterThan(2)
        const last = c[c.length - 1]
        expect(last.t).toMatch(/^\d+:00$/)
        expect(Number(last.t!.split(':')[0])).toBeGreaterThan(0)
    })
})

describe('chunkMeta: 조각마다 출처, 제목, 위치, 날짜', () => {
    it('필요한 칸만, 없는 칸은 빼고', () => {
        const [c] = chunkForIngest('[3:00] 영상 속 이야기입니다.')
        expect(chunkMeta(c, { title: '내 영상', url: 'https://youtu.be/x', publishedAt: '2026-09-01T00:00:00.000Z' })).toEqual({
            pos: '1/1', t: '3:00', title: '내 영상', url: 'https://youtu.be/x', published_at: '2026-09-01T00:00:00.000Z',
        })
        expect(chunkMeta(c, { title: '글' })).toEqual({ pos: '1/1', t: '3:00', title: '글' })
    })
})

describe('contentHash: 같은 글은 같은 열쇠', () => {
    it('띄어쓰기, 줄바꿈 차이는 같은 글로 본다', () => {
        expect(contentHash('안녕하세요\n\n 반가워요  ')).toBe(contentHash('안녕하세요 반가워요'))
        expect(contentHash('가')).not.toBe(contentHash('나'))
        expect(contentHash('가')).toMatch(/^[0-9a-f]{64}$/)
    })
})

describe('pickDetailSentences: 글 뒤쪽의 숫자, 경험담도 모델에게 보여 준다', () => {
    it('짧은 글은 그대로', () => {
        expect(pickDetailSentences('짧은 글입니다.', 500)).toBe('짧은 글입니다.')
    })
    it('긴 글은 앞부분 + 숫자, 경험 문장을 한도 안에서 골라 붙인다', () => {
        const filler = Array.from({ length: 80 }, (_, i) => `그냥 평범한 문장 ${'가'.repeat(i % 3)}입니다.`).join(' ')
        const fact = '저는 2019년에 퇴사하고 첫 강의에서 수강생 37명을 모았어요.'
        const out = pickDetailSentences(`${filler} ${fact} ${filler}`, 600)
        expect(out.length).toBeLessThanOrEqual(600)
        expect(out).toContain(fact)
        expect(out.startsWith('그냥 평범한 문장')).toBe(true)
    })
})

describe('runPool: 동시에 n개까지, 순서대로 결과', () => {
    it('결과는 넣은 순서, 동시에 도는 수는 한도 이하', async () => {
        let now = 0, peak = 0
        const out = await runPool([5, 1, 3, 2, 4], 2, async (v) => {
            now++; peak = Math.max(peak, now)
            await new Promise(r => setTimeout(r, v))
            now--
            return v * 10
        })
        expect(out).toEqual([50, 10, 30, 20, 40])
        expect(peak).toBeLessThanOrEqual(2)
    })
    it('하나가 실패하면 새 일을 더 시작하지 않고 실패를 던진다', async () => {
        const started: number[] = []
        await expect(runPool([1, 2, 3, 4, 5], 1, async (v) => { started.push(v); if (v === 2) throw new Error('끊김'); return v })).rejects.toThrow('끊김')
        expect(started).toEqual([1, 2])
    })
})
