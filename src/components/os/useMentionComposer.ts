'use client'
// 입력창 @ 멘션 상태 — OsChat / OsGroupChat 이 같이 쓴다.

import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import {
    applyMentionInsertion,
    detectMentionQuery,
    filterMentionBots,
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
        setQuery(hit.query)
        setActiveIndex(0)
    }, [])

    const close = useCallback(() => {
        setOpen(false)
        setQuery('')
    }, [])

    const insert = useCallback((text: string, cursor: number, item: MentionPickerItem) => {
        const next = applyMentionInsertion(text, start, cursor, item.name)
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
        close,
        insert,
        onKeyWhileOpen,
        activeItem: items[activeIndex] ?? null,
    }
}
