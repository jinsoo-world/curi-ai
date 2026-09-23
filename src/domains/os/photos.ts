// 사진 첨부 규칙 — 화면 없이 계산만 한다 (검사·격자 열 수·보낼 모양·병렬 올리기)
// 화면(PhotoAttach·PhotoGrid)은 여기만 부른다. 숫자·규칙을 바꿀 땐 이 파일 한 곳.

/** 한 번에 붙일 수 있는 사진 수 (대표 지시 0923: 10장까지) */
export const PHOTO_MAX_COUNT = 10
/** 장당 크기. 서버(/api/chat/upload-image)가 4MB 에서 거절하니 같은 값으로 맞춘다 (Vercel 본문 4.5MB 한도) */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024
/** 받는 종류 — 서버·Gemini 와 같은 목록 */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
/** 동시에 올리는 장 수 */
export const PHOTO_UPLOAD_PARALLEL = 3

export const PHOTO_MSG_TOO_MANY = '10장까지만 붙일 수 있어요'
export const PHOTO_MSG_TOO_BIG = '사진은 4MB 이하만 보낼 수 있어요'
export const PHOTO_MSG_BAD_TYPE = '사진 파일만 보낼 수 있어요 (JPG·PNG·WEBP·HEIC)'

/** File 에서 검사에 쓰는 것만 뽑은 모양 (테스트에서 File 없이 쓸 수 있게) */
export interface PhotoLike {
    name: string
    type: string
    size: number
}

export interface PhotoCheck<T extends PhotoLike> {
    /** 붙여도 되는 것 (순서 유지) */
    ok: T[]
    /** 뺀 것과 이유 */
    rejected: { file: T; reason: string }[]
    /** 사람에게 한 줄로 보여줄 말. 뺀 게 없으면 null */
    notice: string | null
}

/**
 * 고른 파일을 검사한다. 이미 붙어 있는 장 수(already)를 더해 10장을 넘기지 않는다.
 * 종류·크기가 틀린 장은 빼고, 남은 자리만큼만 받는다.
 */
export function checkPhotoFiles<T extends PhotoLike>(files: T[], already = 0): PhotoCheck<T> {
    const ok: T[] = []
    const rejected: { file: T; reason: string }[] = []
    const room = Math.max(0, PHOTO_MAX_COUNT - Math.max(0, already))

    for (const f of files) {
        if (!(PHOTO_TYPES as readonly string[]).includes(f.type)) { rejected.push({ file: f, reason: PHOTO_MSG_BAD_TYPE }); continue }
        if (f.size > PHOTO_MAX_BYTES) { rejected.push({ file: f, reason: PHOTO_MSG_TOO_BIG }); continue }
        if (ok.length >= room) { rejected.push({ file: f, reason: PHOTO_MSG_TOO_MANY }); continue }
        ok.push(f)
    }

    // 안내는 하나만: 장 수 초과가 있으면 그것을 먼저(대표 지시 문구), 아니면 첫 거절 이유
    const tooMany = rejected.some(r => r.reason === PHOTO_MSG_TOO_MANY)
    const notice = rejected.length === 0 ? null : tooMany ? PHOTO_MSG_TOO_MANY : rejected[0].reason
    return { ok, rejected, notice }
}

/** 말풍선 격자 열 수 — 1장=크게 1열, 2~4장=2열, 5장 이상=3열 */
export function photoGridCols(count: number): 1 | 2 | 3 {
    if (count <= 1) return 1
    if (count <= 4) return 2
    return 3
}

/**
 * /api/chat 에 보낼 사진 칸. 1장이면 옛 모양(imageUrl) 그대로, 여러 장이면 imageUrls 도 같이.
 * (imageUrl 은 첫 장 = 옛 서버·저장 칸과 호환)
 */
export function photoPayload(urls: string[]): { imageUrl?: string; imageUrls?: string[] } {
    const clean = urls.filter(u => typeof u === 'string' && u.length > 0).slice(0, PHOTO_MAX_COUNT)
    if (clean.length === 0) return {}
    if (clean.length === 1) return { imageUrl: clean[0] }
    return { imageUrl: clean[0], imageUrls: clean }
}

/**
 * 일을 동시에 limit 개까지만 돌린다 (사진 올리기 병렬 3). 순서대로 결과를 돌려주고,
 * 하나가 실패해도 나머지는 계속 간다 (실패는 결과에 Error 로 남는다).
 */
export async function runLimited<T>(tasks: (() => Promise<T>)[], limit = PHOTO_UPLOAD_PARALLEL): Promise<(T | Error)[]> {
    const results: (T | Error)[] = new Array(tasks.length)
    let next = 0
    const worker = async () => {
        while (next < tasks.length) {
            const i = next++
            try { results[i] = await tasks[i]() }
            catch (e) { results[i] = e instanceof Error ? e : new Error(String(e)) }
        }
    }
    const n = Math.max(1, Math.min(limit, tasks.length))
    await Promise.all(Array.from({ length: n }, worker))
    return results
}

/** 붙여넣기·끌어놓기에서 사진 파일만 골라낸다 (글자·다른 파일은 버림) */
export function pickImageFiles(items: { kind?: string; type: string; getAsFile?: () => File | null }[] | File[]): File[] {
    const out: File[] = []
    for (const it of items as unknown[]) {
        if (typeof File !== 'undefined' && it instanceof File) {
            if (it.type.startsWith('image/')) out.push(it)
            continue
        }
        const d = it as { kind?: string; type: string; getAsFile?: () => File | null }
        if (d.kind === 'file' && d.type.startsWith('image/') && d.getAsFile) {
            const f = d.getAsFile()
            if (f) out.push(f)
        }
    }
    return out
}
