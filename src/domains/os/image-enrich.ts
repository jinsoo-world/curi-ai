/**
 * 읽은 글에 사진 설명을 붙인다 (대표 승인 1005 13:14 「이미지도 읽게 해」). 서버 전용.
 *   인스타그램 = 글마다 대표 사진 한 장 (계정당 최대 10장, 작은 판 사진).
 *   블로그, 웹 글 = 글의 대표 사진(og:image) 한 장.
 * 설명은 그 글의 「사진 설명」, 「사진 속 글자」 줄로 같은 자료 안에 들어간다. 원본 사진은 저장하지 않는다.
 * 실패하거나 시간이 모자라면 사진 설명만 빠지고 글은 그대로 저장된다.
 */
import type { ReadPage } from '@/domains/agent/fetch-url'
import { describeImages, imageNoteLines, type ImageNoteCtx } from '@/domains/knowledge/image-note'
import { formatSocialText } from './readers/social-post'

const MAX_TEXT = 100_000

export async function addImageNotes(read: ReadPage, ctx: ImageNoteCtx, budgetMs: number): Promise<ReadPage> {
    if (budgetMs < 2_000) return read
    try {
        if (read.social && read.social.platform === 'instagram') {
            const posts = read.social.posts
            const items = posts.slice(0, 10).map((p, i) => ({ key: p.code ?? `i${i}`, url: p.thumbUrl ?? p.imageUrls[0] ?? '' })).filter(x => x.url)
            if (items.length === 0) return read
            const notes = await describeImages(items, ctx, { budgetMs })
            if (notes.size === 0) return read
            const next = posts.map((p, i) => {
                const n = notes.get(p.code ?? `i${i}`)
                return n ? { ...p, imageNote: n } : p
            })
            return { ...read, text: formatSocialText(read.social.profile, next).slice(0, MAX_TEXT), social: { ...read.social, posts: next } }
        }
        if (read.image) {
            const notes = await describeImages([{ key: 'og', url: read.image }], ctx, { budgetMs, max: 1 })
            const lines = imageNoteLines(notes.get('og'))
            if (!lines) return read
            return { ...read, text: `${read.text}\n\n${lines}`.slice(0, MAX_TEXT) }
        }
    } catch (e) {
        console.warn('[os/image-enrich] 사진 설명 붙이기 실패, 글만 저장:', e instanceof Error ? e.message : e)
    }
    return read
}

/** 계정 글 여러 편: 글마다 대표 사진 한 장, 한 번에 최대 10장. url → 붙일 줄 */
export async function imageNotesForItems(items: readonly { url: string; image?: string }[], ctx: ImageNoteCtx, budgetMs: number): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (budgetMs < 2_000) return out
    const list = items.filter(i => i.image).slice(0, 10).map(i => ({ key: i.url, url: i.image as string }))
    if (list.length === 0) return out
    const notes = await describeImages(list, ctx, { budgetMs })
    for (const [k, n] of notes) { const l = imageNoteLines(n); if (l) out.set(k, l) }
    return out
}
