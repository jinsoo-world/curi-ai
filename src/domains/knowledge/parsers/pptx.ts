// pptx 읽기 = pptxtojson 2.2.0. 슬라이드마다 제목을 달고 글·표 칸·노트를 줄로 편다.
// (옛 .ppt 는 여기서 못 읽는다. 호출쪽이 업스테이지로 시도하고, 안 되면 pptx 로 저장해 올려 달라고 안내한다.)

import { assertZipSafe, asPasswordError, limitText } from './safety'

type Element = {
    content?: string
    text?: string
    data?: Array<Array<{ text?: string } | null> | null>
    elements?: Element[]
}
type Slide = { elements?: Element[]; layoutElements?: Element[]; note?: string }

function 태그없이(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .split('\n')
        .map(줄 => 줄.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
}

function 글모으기(elements: Element[] | undefined, texts: string[]) {
    for (const el of elements ?? []) {
        if (el.content) {
            const t = 태그없이(el.content)
            if (t) texts.push(t)
        }
        // 표: 2.x 부터 칸 글도 HTML 이라 같이 벗긴다
        for (const row of el.data ?? []) {
            for (const cell of row ?? []) {
                if (cell?.text) {
                    const t = 태그없이(cell.text)
                    if (t) texts.push(t)
                }
            }
        }
        if (el.elements) 글모으기(el.elements, texts)
    }
}

export async function parsePptx(buffer: Buffer): Promise<{ text: string; slides: number }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require('pptxtojson/dist/index.cjs') as { parse: (data: ArrayBuffer) => Promise<{ slides?: Slide[] }> }
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    assertZipSafe(buffer)
    let result: { slides?: Slide[] }
    try {
        result = await parse(ab)
    } catch (err) {
        throw asPasswordError(err)
    }
    const out: string[] = []
    const slides = result?.slides ?? []
    slides.forEach((slide, i) => {
        const texts: string[] = []
        글모으기(slide.elements, texts)
        글모으기(slide.layoutElements, texts)
        if (texts.length > 0) out.push(`[슬라이드 ${i + 1}]\n${texts.join('\n')}`)
        if (slide.note) out.push(`[슬라이드 ${i + 1} 노트]\n${slide.note}`)
    })
    return { text: limitText(out.join('\n\n')).text, slides: slides.length }
}
