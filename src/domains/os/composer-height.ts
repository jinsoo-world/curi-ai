// 채팅 입력창 높이: 1줄에서 시작해 내용만큼 늘리고, 상한 이후만 스크롤.
// 제품 카피에 가운뎃점·긴 줄표 금지.

/** 최소 높이 (CSS .os-input min-height(44) · 보내기 단추와 맞춤) */
export const COMPOSER_MIN_PX = 44
/** 대략 6~8줄. 이보다 크면 overflow-y auto */
export const COMPOSER_MAX_PX = 180

/** scrollHeight 를 min~max 로 자른다 (순수). */
export function clampComposerHeight(
    scrollHeight: number,
    minPx: number = COMPOSER_MIN_PX,
    maxPx: number = COMPOSER_MAX_PX,
): number {
    const min = Math.max(0, minPx)
    const max = Math.max(min, maxPx)
    const h = Number.isFinite(scrollHeight) ? scrollHeight : min
    return Math.min(max, Math.max(min, h))
}

/**
 * textarea 높이를 내용에 맞춘다.
 * 측정 전 height=auto 로 리셋한 뒤 scrollHeight 를 쓰고, 상한이면 세로 스크롤만 켠다.
 */
export function applyComposerAutoHeight(
    el: HTMLTextAreaElement,
    opts?: { minPx?: number; maxPx?: number },
): number {
    const minPx = opts?.minPx ?? COMPOSER_MIN_PX
    const maxPx = opts?.maxPx ?? COMPOSER_MAX_PX
    el.style.height = 'auto'
    el.style.overflowY = 'hidden'
    const full = el.scrollHeight
    const next = clampComposerHeight(full, minPx, maxPx)
    el.style.height = `${next}px`
    el.style.overflowY = full > maxPx ? 'auto' : 'hidden'
    return next
}

/** 고스트 미러(멘션 칩) 스크롤을 textarea 와 맞춘다. */
export function syncComposerMirrorScroll(textarea: HTMLTextAreaElement): void {
    const host = textarea.parentElement
    if (!host) return
    const mirror = host.querySelector('.os-input-chip-mirror') as HTMLElement | null
    if (!mirror) return
    mirror.scrollTop = textarea.scrollTop
}
