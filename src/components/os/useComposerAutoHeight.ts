'use client'
// textarea 자동 높이 + 멘션 칩 미러 스크롤 동기화 (OsChat / OsGroupChat 공용)

import { useLayoutEffect, useCallback, type RefObject, type UIEvent } from 'react'
import {
    applyComposerAutoHeight,
    syncComposerMirrorScroll,
} from '@/domains/os/composer-height'

export function useComposerAutoHeight(
    inputRef: RefObject<HTMLTextAreaElement | null>,
    value: string,
) {
    const resize = useCallback(() => {
        const el = inputRef.current
        if (!el) return
        applyComposerAutoHeight(el)
        syncComposerMirrorScroll(el)
    }, [inputRef])

    useLayoutEffect(() => {
        resize()
    }, [value, resize])

    const onScroll = useCallback((e: UIEvent<HTMLTextAreaElement>) => {
        syncComposerMirrorScroll(e.currentTarget)
    }, [])

    return { resize, onScroll }
}
