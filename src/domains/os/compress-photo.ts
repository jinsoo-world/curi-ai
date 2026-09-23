// 브라우저에서 사진 크기를 줄인 뒤 올린다 (대화 첨부 체감 속도).
// HEIC/HEIF 는 canvas 가 못 읽는 기기가 많아 그대로 둔다.
// 화면(PhotoAttach)만 부른다. 숫자 한도는 photos.ts 와 맞춘다.

import { PHOTO_MAX_BYTES } from './photos'

/** 긴 변 최대 픽셀. 대화용이면 1600 이면 충분하고 용량이 크게 준다 */
export const PHOTO_UPLOAD_MAX_EDGE = 1600
/** JPEG 품질 (0~1). 0.82 는 읽기엔 충분하고 파일이 가벼움 */
export const PHOTO_UPLOAD_QUALITY = 0.82
/** 이미 이보다 작고 긴 변도 작으면 다시 압축하지 않음 */
const SKIP_IF_UNDER_BYTES = 700 * 1024

export interface CompressOpts {
    maxEdge?: number
    quality?: number
}

/**
 * 올린 파일을 긴 변 maxEdge 이하 JPEG 로 줄인다.
 * 실패하거나 HEIC 이면 원본 File 을 그대로 돌려준다 (올리기는 계속).
 */
export async function compressPhotoForUpload(file: File, opts: CompressOpts = {}): Promise<File> {
    const maxEdge = opts.maxEdge ?? PHOTO_UPLOAD_MAX_EDGE
    const quality = opts.quality ?? PHOTO_UPLOAD_QUALITY
    const type = (file.type || '').toLowerCase()

    // HEIC/HEIF · 빈 종류 · 이미 아주 작은 파일은 손대지 않는다
    if (type === 'image/heic' || type === 'image/heif') return file
    if (file.size > 0 && file.size <= SKIP_IF_UNDER_BYTES) {
        // 픽셀이 큰지 모르니 아래에서 한 번 읽어 본다. 너무 작으면 바로 통과는 아래에서.
    }

    if (typeof document === 'undefined') return file

    try {
        const bitmap = await loadBitmap(file)
        const { width, height } = bitmap
        const long = Math.max(width, height)
        // 이미 작고 용량도 적으면 그대로
        if (long <= maxEdge && file.size <= SKIP_IF_UNDER_BYTES) {
            bitmap.close?.()
            return file
        }
        const scale = long > maxEdge ? maxEdge / long : 1
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { bitmap.close?.(); return file }
        ctx.drawImage(bitmap, 0, 0, w, h)
        bitmap.close?.()

        const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
        if (!blob || blob.size === 0) return file
        // 압축이 더 커지면 원본 유지 (드문 PNG 단색 등)
        if (blob.size >= file.size) return file
        // 서버 4MB 한도를 넘기면 품질을 한 번 더 낮춘다
        let out = blob
        if (out.size > PHOTO_MAX_BYTES) {
            const tighter = await canvasToBlob(canvas, 'image/jpeg', 0.7)
            if (tighter && tighter.size < out.size) out = tighter
        }
        if (out.size > PHOTO_MAX_BYTES) return file

        const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
        return new File([out], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
    } catch {
        return file
    }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement & { close?: () => void }> {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file)
    }
    const url = URL.createObjectURL(file)
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image()
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error('image load failed'))
            el.src = url
        })
        return img
    } finally {
        URL.revokeObjectURL(url)
    }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise(resolve => {
        canvas.toBlob(b => resolve(b), type, quality)
    })
}

/**
 * 정방형(1:1)으로 잘라 JPEG 로 만든다. 아바타 미리보기에서 끈 위치를 반영할 때 쓴다.
 * ox/oy = object-position % (0~100). cover 와 같은 가운데 기준.
 */
export async function cropSquareJpeg(
    src: string,
    oxPct: number,
    oyPct: number,
    edge = 1024,
    quality = 0.88,
): Promise<File | null> {
    if (typeof document === 'undefined') return null
    try {
        const img = await loadUrlImage(src)
        const { naturalWidth: iw, naturalHeight: ih } = img
        if (!iw || !ih) return null
        const side = Math.min(iw, ih)
        // object-fit: cover + object-position 과 같은 잘림
        const maxX = Math.max(0, iw - side)
        const maxY = Math.max(0, ih - side)
        const sx = maxX * (clampPct(oxPct) / 100)
        const sy = maxY * (clampPct(oyPct) / 100)

        const canvas = document.createElement('canvas')
        canvas.width = edge
        canvas.height = edge
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        ctx.drawImage(img, sx, sy, side, side, 0, 0, edge, edge)
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
        if (!blob) return null
        return new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() })
    } catch {
        return null
    }
}

function clampPct(n: number): number {
    if (!Number.isFinite(n)) return 50
    return Math.max(0, Math.min(100, n))
}

function loadUrlImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('image load failed'))
        // data/blob 은 CORS 가 필요 없고, crossOrigin 을 붙이면 오히려 깨질 수 있다
        if (!src.startsWith('data:') && !src.startsWith('blob:')) {
            el.crossOrigin = 'anonymous'
        }
        el.src = src
    })
}
