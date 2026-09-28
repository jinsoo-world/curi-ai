// domains/os: 인스타그램, 페이스북, 스레드 = 캡처 올리기 또는 글 붙여넣기로 자료 넣기 (대표 결정 0929 00:54). 서버 전용.
// 봇 하나를 골라 넣는 「자료 넣기」 창에서 쓴다. 설정의 「내 SNS」 창은 sns-link.ts pasteSnsPosts 가 같은 읽기를 쓴다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { addTextSource } from './knowledge'
import { parseScreenshotImages, readScreenshots } from './screenshot-read'

export const SNS_CAPTURE_MIN_CHARS = 30
export const SNS_CAPTURE_MAX_TEXT = 20_000

const LABEL: Record<string, string> = {
    'instagram.com': '인스타그램', 'facebook.com': '페이스북', 'fb.com': '페이스북',
    'threads.net': '스레드', 'threads.com': '스레드', 'x.com': 'X', 'twitter.com': 'X', 'tiktok.com': '틱톡',
    'blog.naver.com': '네이버 블로그', 'brunch.co.kr': '브런치',
}

/** 주소 → 곳 이름 (모르면 'SNS') */
export function snsLabelOf(url: string | null | undefined): string {
    try {
        const h = new URL(/^https?:\/\//i.test(String(url)) ? String(url) : `https://${url}`).hostname.toLowerCase().replace(/^(www|m)\./, '')
        for (const [k, v] of Object.entries(LABEL)) if (h === k || h.endsWith(`.${k}`)) return v
    } catch { /* 주소 없음 */ }
    return 'SNS'
}

/** 캡처 글과 붙여넣은 글을 한 자료 글로 */
export function captureBody(url: string, fromImages: string[], pasted: string): string {
    const parts: string[] = []
    if (url) parts.push(`출처: ${url}`)
    fromImages.forEach((t, i) => parts.push(`[캡처 ${i + 1}]\n${t}`))
    if (pasted.trim()) parts.push(`[붙여넣은 글]\n${pasted.trim()}`)
    return parts.join('\n\n').slice(0, SNS_CAPTURE_MAX_TEXT)
}

/**
 * 캡처(최대 5장)와 붙여넣은 글을 읽어 봇 자료 하나로 넣는다. 주인 확인과 자리 확인은 부르는 쪽이 먼저 한다.
 * 캡처에서 글을 하나도 못 옮기고 붙여넣은 글도 없으면 사람 말로 던진다.
 */
export async function addSnsCaptureSource(db: SupabaseClient, mentorId: string, a: { url?: unknown; images?: unknown; text?: unknown; userId?: string }) {
    const url = String(a.url ?? '').trim().slice(0, 300)
    const images = parseScreenshotImages(a.images)
    const pasted = String(a.text ?? '').slice(0, SNS_CAPTURE_MAX_TEXT)
    if (images.length === 0 && pasted.trim().length === 0) throw new Error('캡처를 올리거나 글을 붙여넣어 주세요')
    const fromImages = await readScreenshots(images, { route: '/api/os/knowledge', userId: a.userId ?? null, mentorId })
    const body = captureBody(url, fromImages, pasted)
    const real = fromImages.join('') + pasted
    if (real.replace(/\s+/g, '').length < SNS_CAPTURE_MIN_CHARS) {
        throw new Error(images.length > 0 && fromImages.length === 0 ? '캡처에서 글을 못 찾았어요. 글이 보이게 다시 캡처해 주세요' : '글이 너무 짧아요')
    }
    const label = snsLabelOf(url)
    const how = images.length > 0 ? '캡처' : '붙여넣은 글'
    return addTextSource(db, mentorId, `내 ${label} 글 (${how})`, body, images.length > 0 ? 'sns_capture' : 'sns_paste')
}
