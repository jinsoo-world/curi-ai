'use client'
// textarea 자동 높이 + 멘션 칩 미러 스크롤 동기화 (OsChat / OsGroupChat 공용)

import { useLayoutEffect, useCallback, type RefObject, type UIEvent } from 'react'
import {
    applyComposerAutoHeight,
    syncComposerMirrorScroll,
    COMPOSER_MIN_PX,
} from '@/domains/os/composer-height'

export function useComposerAutoHeight(
    inputRef: RefObject<HTMLTextAreaElement | null>,
    value: string,
) {
    const resize = useCallback(() => {
        const el = inputRef.current
        if (!el) return
        const h = applyComposerAutoHeight(el)
        syncComposerMirrorScroll(el)
        // 1줄이면 ＋/보내기/placeholder 세로 가운데, 여러 줄이면 아래 정렬
        const bar = el.closest('.os-input-bar')
        if (bar) bar.classList.toggle('is-multi', h > COMPOSER_MIN_PX + 2)
    }, [inputRef])

    useLayoutEffect(() => {
        resize()
    }, [value, resize])

    const onScroll = useCallback((e: UIEvent<HTMLTextAreaElement>) => {
        syncComposerMirrorScroll(e.currentTarget)
    }, [])

    return { resize, onScroll }
}
