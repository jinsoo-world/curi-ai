'use client'
// Grok 식 @ 멘션 픽커 — 봇 아이콘+이름 목록. 플러그인은 연결 API와 말 라우팅이 준비되기 전이라 「준비 중」만 보여 준다.
// 가운뎃점·긴 줄표 금지.

import { useEffect, useId, useRef } from 'react'
import BotAvatar from './BotAvatar'
import type { BotColor, BotShape } from '@/domains/os/types'

export interface MentionPickerItem {
    mentorId: string
    name: string
    shape?: BotShape | string
    color?: BotColor | string
    avatarUrl?: string | null
}

interface Props {
    items: MentionPickerItem[]
    activeIndex: number
    onHover: (index: number) => void
    onSelect: (item: MentionPickerItem) => void
    onClose: () => void
    /** 플러그인 칸을 「준비 중」으로 보여 줄지 (가짜 연결 목록은 안 넣는다) */
    showPluginStub?: boolean
}

export default function MentionPicker({
    items, activeIndex, onHover, onSelect, onClose, showPluginStub = true,
}: Props) {
    const listId = useId()
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
        el?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node | null
            if (listRef.current && t && !listRef.current.contains(t)) onClose()
        }
        document.addEventListener('mousedown', onDoc)
        return () => document.removeEventListener('mousedown', onDoc)
    }, [onClose])

    if (items.length === 0 && !showPluginStub) return null

    return (
        <div
            ref={listRef}
            className="os-mention-pop"
            role="listbox"
            id={listId}
            aria-label="멘션할 봇"
        >
            {items.length > 0 && (
                <div className="os-mention-section" role="group" aria-label="봇">
                    {items.map((it, i) => {
                        const active = i === activeIndex
                        return (
                            <button
                                key={it.mentorId}
                                type="button"
                                role="option"
                                data-idx={i}
                                aria-selected={active}
                                className={`os-mention-row${active ? ' active' : ''}`}
                                onMouseEnter={() => onHover(i)}
                                onMouseDown={e => { e.preventDefault(); onSelect(it) }}
                            >
                                <span className="os-mention-face" aria-hidden>
                                    <BotAvatar
                                        shape={(it.shape ?? 'circle') as BotShape}
                                        color={(it.color ?? 'white') as BotColor}
                                        state="idle"
                                        size={28}
                                        faceUrl={it.avatarUrl ?? null}
                                        name={it.name}
                                    />
                                </span>
                                <span className="os-mention-name">{it.name}</span>
                                <span className="os-mention-kind">Bot</span>
                            </button>
                        )
                    })}
                </div>
            )}
            {items.length === 0 && (
                <div className="os-mention-empty">맞는 봇이 없어요</div>
            )}
            {showPluginStub && (
                <div className="os-mention-section os-mention-plugins" role="group" aria-label="플러그인">
                    <div className="os-mention-stub" aria-disabled="true">
                        <span className="os-mention-name">플러그인</span>
                        <span className="os-mention-kind">준비 중</span>
                    </div>
                </div>
            )}
        </div>
    )
}
