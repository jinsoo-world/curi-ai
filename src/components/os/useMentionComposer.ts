'use client'
// 입력창 @ 멘션 상태. OsChat / OsGroupChat 이 같이 쓴다.

import { useCallback, useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import {
    applyMentionInsertion,
    detectMentionQuery,
    filterMentionBots,
    resolveMentionCursor,
} from '@/domains/os/mentions'
import type { MentionPickerItem } from './MentionPicker'

export function useMentionComposer(bots: MentionPickerItem[]) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [start, setStart] = useState(0)
    const [activeIndex, setActiveIndex] = useState(0)

    const items = useMemo(() => filterMentionBots(bots, query), [bots, query])

    const syncFromInput = useCallback((text: string, cursor: number) => {
        const hit = detectMentionQuery(text, cursor)
        if (!hit) {
            setOpen(false)
            setQuery('')
            return
        }
        setOpen(true)
        setStart(hit.start)
        // 검색어가 바뀔 때만 하이라이트를 처음으로 (rAF 재동기화가 화살표 선택을 덮어쓰지 않게)
        setQuery(prev => {
            if (prev !== hit.query) setActiveIndex(0)
            return hit.query
        })
    }, [])

    /**
     * onChange 직후: selectionStart=0 버그(모바일·IME)를 resolveMentionCursor 로 고치고,
     * rAF 로 textarea 실제 selection 을 한 번 더 읽는다.
     * (클릭/화살표 동기화는 syncFromInput 을 그대로 써서 커서 0 = 「@ 앞」 의미를 지킨다.)
     */
    const syncAfterChange = useCallback((
        text: string,
        reportedCursor: number,
        inputRef: RefObject<HTMLTextAreaElement | null>,
    ) => {
        syncFromInput(text, resolveMentionCursor(text, reportedCursor))
        requestAnimationFrame(() => {
            const ta = inputRef.current
            if (!ta) return
            syncFromInput(text, resolveMentionCursor(text, ta.selectionStart ?? text.length))
        })
    }, [syncFromInput])

    const close = useCallback(() => {
        setOpen(false)
        setQuery('')
    }, [])

    const insert = useCallback((text: string, cursor: number, item: MentionPickerItem) => {
        const fixed = resolveMentionCursor(text, cursor)
        const next = applyMentionInsertion(text, start, Math.max(fixed, start), item.name)
        close()
        return next
    }, [start, close])

    const onKeyWhileOpen = useCallback((e: KeyboardEvent): 'handled' | 'pass' | 'select' => {
        if (!open) return 'pass'
        if (e.key === 'Escape') {
            e.preventDefault()
            close()
            return 'handled'
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (items.length) setActiveIndex(i => (i + 1) % items.length)
            return 'handled'
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (items.length) setActiveIndex(i => (i - 1 + items.length) % items.length)
            return 'handled'
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && items.length > 0) {
            // IME 조합 중 Enter 는 넘긴다
            if (e.nativeEvent.isComposing) return 'pass'
            e.preventDefault()
            return 'select'
        }
        return 'pass'
    }, [open, close, items])

    return {
        open,
        items,
        activeIndex,
        setActiveIndex,
        syncFromInput,
        syncAfterChange,
        close,
        insert,
        onKeyWhileOpen,
        activeItem: items[activeIndex] ?? null,
        query,
    }
}
