// domains/knowledge — 자료 넣기 보강 (1003, 대표 지시 「블로그, 유튜브, 인스타, 스레드, 파일 링크 넣으면 적절하게 잘 청킹되고 보관되게」)
//
// 밖에 나가지 않는 순수 함수만 둔다 (시험하기 쉽게). 저장은 actions.ts 가 한다.
//   chunkForIngest = 기존 문단·문장 자르기(splitIntoChunksWithHeadings)에 「겹침」과 「위치·영상 시각」을 더한다
//   chunkMeta      = 조각마다 남길 메타 (출처, 제목, 위치, 날짜, 소제목, 영상 시각)
//   contentHash    = 같은 글 두 번 저장 막기용 열쇠
//   pickDetailSentences = 초안 모델에게 보여 줄 글을 고른다 (앞부분 + 숫자, 경험담 문장)
//   runPool        = 임베딩을 동시에 몇 개씩 (차례로 하나씩이면 긴 글이 1분을 넘긴다)

import { createHash } from 'node:crypto'
import { splitIntoChunksWithHeadings, headingOf } from './embedding'

/**
 * 조각 최대 글자 = 600, 겹침 최대 = 120 (약 20%).
 * 근거: 한국어 600자는 대략 300~400 토큰. 검색용 조각은 보통 256~512 토큰, 겹침 10~20% 를 쓴다.
 * 예전 500자, 겹침 0 에서는 문단 경계에 걸린 숫자, 사례가 반쪽으로 갈려 둘 다 검색에서 밀렸다.
 * 겹침은 앞 조각의 마지막 한 문장만 붙인다(새 소제목으로 시작하는 조각에는 안 붙인다).
 */
export const INGEST_CHUNK_MAX = 600
export const INGEST_OVERLAP_MAX = 120

export interface IngestChunk {
    /** 저장할 조각 글 (겹침 포함) */
    text: string
    /** 가장 가까운 소제목 (없으면 null) */
    heading: string | null
    /** 앞 조각에서 겹쳐 붙인 글 (없으면 빈 글) */
    overlap: string
    index: number
    total: number
    /** 유튜브 자막의 [분:초] 시작 시각 (없으면 undefined) */
    t?: string
}

const STAMP = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g
const SENTENCE_SPLIT = /(?<=[.!?。…])\s+|\n+/

function stamps(text: string): string[] {
    return [...text.matchAll(STAMP)].map(m => m[1])
}

/** 앞 조각 끝 문장 하나 (너무 길면 끝에서 한도만큼, 낱말 경계에서) */
function tailSentence(prev: string, max: number): string {
    const parts = prev.split(SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean)
    const last = parts[parts.length - 1] ?? ''
    if (last.length <= max) return last
    const cut = last.slice(-max)
    const sp = cut.indexOf(' ')
    return (sp > 0 && sp < max * 0.4 ? cut.slice(sp + 1) : cut).trim()
}

/** 인스타·스레드 여러 편 사이의 「---」 줄을 문단 나눔으로 바꾼다 */
function cleanForChunks(text: string): string {
    return String(text ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/^[ \t]*-{3,}[ \t]*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/** 글 → 조각들 (겹침, 위치, 영상 시각 포함) */
export function chunkForIngest(text: string, max = INGEST_CHUNK_MAX, overlapMax = INGEST_OVERLAP_MAX): IngestChunk[] {
    const cleaned = cleanForChunks(text)
    if (!cleaned) return []
    const base = splitIntoChunksWithHeadings(cleaned, max)
    let lastT: string | undefined
    return base.map((b, i) => {
        const own = stamps(b.text)
        const t = own[0] ?? lastT
        if (own.length) lastT = own[own.length - 1]
        const startsSection = i > 0 && headingOf(b.text) !== null
        const overlap = i === 0 || startsSection ? '' : tailSentence(base[i - 1].text, overlapMax)
        return {
            text: overlap ? `${overlap}\n${b.text}` : b.text,
            heading: b.heading, overlap, index: i, total: base.length,
            ...(t ? { t } : {}),
        }
    })
}

/** 조각 메타 (knowledge_chunks.meta). 없는 칸은 넣지 않는다 */
export function chunkMeta(c: IngestChunk, ctx: { title?: string | null; url?: string | null; publishedAt?: string | null }): Record<string, string> {
    const m: Record<string, string> = { pos: `${c.index + 1}/${c.total}` }
    if (c.heading) m.heading = c.heading.slice(0, 80)
    if (c.t) m.t = c.t
    if (ctx.title) m.title = String(ctx.title).slice(0, 120)
    if (ctx.url) m.url = String(ctx.url).slice(0, 500)
    if (ctx.publishedAt) m.published_at = String(ctx.publishedAt)
    return m
}

/** 같은 글 열쇠: 띄어쓰기, 줄바꿈 차이는 무시한다 */
export function contentHash(text: string): string {
    return createHash('sha256').update(String(text ?? '').replace(/\s+/g, ' ').trim()).digest('hex')
}

const DETAIL_MARK = /(저는|제가|나는|내가|했어요|했습니다|했다|였어요|였습니다|처음|덕분|실제로|직접|경험|사례|후기|비결|실수)/

function detailScore(s: string): number {
    let n = 0
    if (/\d/.test(s)) n += 2
    if (DETAIL_MARK.test(s)) n += 1
    if (/[「」"“”‘’']/.test(s)) n += 1
    return n
}

/**
 * 모델에게 보여 줄 글을 고른다 (예전 = 앞 1,500자만).
 * 앞부분 40% + 나머지에서 숫자, 경험담, 인용이 든 문장을 점수 순으로 골라 원래 순서대로 붙인다.
 * 글을 고치지 않는다 = 고른 문장은 원문 그대로다.
 */
export function pickDetailSentences(text: string, budget: number): string {
    const t = String(text ?? '').trim()
    if (t.length <= budget) return t
    const sentences = t.split(SENTENCE_SPLIT).map(s => s.trim()).filter(Boolean)
    const headMax = Math.floor(budget * 0.4)
    const head: string[] = []
    let used = 0, i = 0
    for (; i < sentences.length; i++) {
        const s = sentences[i]
        if (used + s.length + 1 > headMax) break
        head.push(s); used += s.length + 1
    }
    if (head.length === 0) { head.push(t.slice(0, headMax)); used = headMax }
    const sep = '\n…\n'
    let room = budget - used - sep.length
    const cands = sentences.slice(i)
        .map((s, k) => ({ s, k, score: detailScore(s) }))
        .filter(c => c.score > 0 && c.s.length >= 10 && c.s.length <= 300)
        .sort((a, b) => b.score - a.score || a.k - b.k)
    const picked: { s: string; k: number }[] = []
    for (const c of cands) {
        if (c.s.length + 1 > room) continue
        picked.push(c); room -= c.s.length + 1
    }
    if (picked.length === 0) return t.slice(0, budget)
    picked.sort((a, b) => a.k - b.k)
    return `${head.join(' ')}${sep}${picked.map(p => p.s).join(' ')}`.slice(0, budget)
}

/** 일을 동시에 n개까지. 결과는 넣은 순서. 하나가 실패하면 새 일을 더 시작하지 않고 그 실패를 던진다 */
export async function runPool<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let next = 0
    let failed: unknown = null
    const worker = async () => {
        while (failed === null && next < items.length) {
            const k = next++
            try {
                out[k] = await fn(items[k], k)
            } catch (e) {
                if (failed === null) failed = e
            }
        }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker))
    if (failed !== null) throw failed
    return out
}
