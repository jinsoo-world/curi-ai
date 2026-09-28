// domains/knowledge — Gemini 임베딩 생성

import { GoogleGenAI } from '@google/genai'
import { logLlmUsage } from '@/domains/llm/usage-log'
import type { UsageCtx } from '@/domains/llm/usage-log'
import { estimateTokensFromText } from '@/domains/llm/prices'

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

export const EMBEDDING_MODEL = 'gemini-embedding-001'

/**
 * 텍스트를 Gemini 임베딩 벡터로 변환
 * usage 를 주면 비용 기록(llm_usage)에 남긴다. 임베딩은 토큰 수를 안 돌려줘서 글자 수로 어림한다.
 */
export async function generateEmbedding(text: string, usage?: UsageCtx): Promise<number[]> {
    const started = Date.now()
    const log = (ok: boolean, error?: string) => logLlmUsage({
        route: usage?.route ?? 'unknown',
        userId: usage?.userId, mentorId: usage?.mentorId, channelId: usage?.channelId,
        kind: 'embedding', provider: 'gemini', model: EMBEDDING_MODEL,
        inputTokens: estimateTokensFromText(text), outputTokens: 0, tokensEstimated: true,
        latencyMs: Date.now() - started, ok, error,
    })
    try {
        const result = await getAI().models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text,
            config: {
                outputDimensionality: 768,
            },
        })
        log(true)
        return result.embeddings?.[0]?.values || []
    } catch (e) {
        log(false, e instanceof Error ? e.message : String(e))
        throw e
    }
}

/**
 * 텍스트를 청크로 분할
 */
export function splitIntoChunks(text: string, maxChunkSize = 500): string[] {
    const paragraphs = text.split(/\n\n+/)
    const chunks: string[] = []
    let current = ''

    for (const para of paragraphs) {
        if ((current + '\n\n' + para).length > maxChunkSize && current) {
            chunks.push(current.trim())
            current = para
        } else {
            current = current ? current + '\n\n' + para : para
        }
    }

    if (current.trim()) {
        chunks.push(current.trim())
    }

    return chunks
}

/* ────────────── 맥락 붙인 조각 (대표 결정 0928) ──────────────
 * 조각만 따로 임베딩하면 「이 조각이 어느 자료의 어느 부분인지」가 빠진다 (예: 「매출 목표 30억」만 남고 DOHL 사업계획서라는 말이 없음).
 * 새로 넣는 자료는 임베딩에 쓰는 글 앞에만 자료 제목, 종류, 가장 가까운 소제목을 붙인다. 모델 호출은 더 없다.
 * 저장하는 조각 글(content)은 그대로 둔다 = 화면과 낱말 검색은 깨끗한 원문을 본다.
 * 끄기: CONTEXTUAL_CHUNKS_ENABLED=false
 */

export function contextualChunksEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return String(env.CONTEXTUAL_CHUNKS_ENABLED ?? 'true').toLowerCase() !== 'false'
}

// 소제목으로 볼 줄: 마크다운 #, [슬라이드 N], 제1장, 1. 2) 같은 번호, ①, □ ■ ▶ ◆ 표식, [대괄호 제목]
const HEADING_PATTERNS: RegExp[] = [
    /^#{1,6}\s+(.{1,80})$/,
    /^\[슬라이드\s*\d+\]\s*(.{0,80})$/,
    /^(제\s*\d+\s*[장절조항].{0,60})$/,
    /^(\d{1,2}[.)]\s*[^\d].{1,60})$/,
    /^([\u2460-\u2473].{1,60})$/,
    /^([\u25A0\u25A1\u25B6\u25C6\u25CF]\s*.{1,60})$/,
    /^\[([^\]]{2,60})\]$/,
]

/** 문단 첫 줄이 소제목이면 그 글 (아니면 null) */
export function headingOf(paragraph: string): string | null {
    const first = String(paragraph ?? '').split('\n')[0].trim()
    if (!first || first.length > 90) return null
    for (const re of HEADING_PATTERNS) {
        const m = first.match(re)
        if (m) {
            const h = (m[1] ?? first).trim()
            // [슬라이드 3] 뒤에 제목이 없으면 슬라이드 번호라도
            return h || first
        }
    }
    return null
}

/** splitIntoChunks 와 똑같이 자르고, 조각마다 가장 가까운 소제목을 함께 돌려준다 */
export function splitIntoChunksWithHeadings(text: string, maxChunkSize = 500): { text: string; heading: string | null }[] {
    const paragraphs = text.split(/\n\n+/)
    const out: { text: string; heading: string | null }[] = []
    let current = ''
    let currentHeading: string | null = null
    let lastHeading: string | null = null

    for (const para of paragraphs) {
        const h = headingOf(para)
        if ((current + '\n\n' + para).length > maxChunkSize && current) {
            out.push({ text: current.trim(), heading: currentHeading })
            current = para
            currentHeading = h ?? lastHeading
        } else {
            if (!current) currentHeading = h ?? lastHeading
            current = current ? current + '\n\n' + para : para
        }
        if (h) lastHeading = h
    }
    if (current.trim()) out.push({ text: current.trim(), heading: currentHeading })
    return out
}

const EXT_LABEL: Record<string, string> = {
    pdf: 'PDF', ppt: '슬라이드', pptx: '슬라이드', doc: '문서', docx: '문서', hwp: '한글 문서', hwpx: '한글 문서',
    txt: '글', md: '글', xlsx: '표', xls: '표', csv: '표',
}

/** 자료 종류를 사람 말로 (source_type 과 파일 이름 끝으로) */
export function sourceKindLabel(sourceType: string | null | undefined, title: string | null | undefined): string {
    const ext = String(title ?? '').toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1]
    if (ext && EXT_LABEL[ext]) return EXT_LABEL[ext]
    switch (sourceType) {
        case 'pdf': return 'PDF'
        case 'url': return '웹페이지'
        case 'youtube': return '유튜브'
        default: return '글'
    }
}

/** 임베딩에 쓸 글 = 맥락 머리말 + 조각 원문. 스위치가 꺼져 있으면 원문 그대로 */
export function contextualEmbeddingText(
    ctx: { title?: string | null; sourceType?: string | null; heading?: string | null },
    chunk: string,
    env: Record<string, string | undefined> = process.env,
): string {
    if (!contextualChunksEnabled(env)) return chunk
    const title = String(ctx.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)
    const heading = String(ctx.heading ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const parts = [
        title ? `자료: ${title}` : '',
        `종류: ${sourceKindLabel(ctx.sourceType, ctx.title)}`,
        heading && !chunk.startsWith(heading) ? `부분: ${heading}` : '',
    ].filter(Boolean)
    return `[${parts.join(' / ')}]\n\n${chunk}`
}
