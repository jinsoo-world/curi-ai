'use client'
// Grok 식 @ 멘션 픽커. 봇 아이콘+이름 목록. 플러그인은 연결 API와 말 라우팅이 준비되기 전이라 「준비 중」만 보여 준다.
// 제품 카피에 가운뎃점·긴 줄표 금지.
// document.body 포털 + fixed 위치: .os-chat-wrap overflow:hidden / sticky dock 에 안 잘린다.

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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
    /** 입력칸(.os-input-wrap) — getBoundingClientRect 로 fixed 위치 */
    anchorRef: RefObject<HTMLElement | null>
    /** 플러그인 칸을 「준비 중」으로 보여 줄지 (가짜 연결 목록은 안 넣는다) */
    showPluginStub?: boolean
    /** 빈 검색어일 때 팀 자체가 비었는지 (필터 실패와 구분) */
    emptyQuery?: boolean
}

interface PopBox {
    left: number
    width: number
    bottom: number
}

export default function MentionPicker({
    items, activeIndex, onHover, onSelect, onClose, anchorRef,
    showPluginStub = true, emptyQuery = false,
}: Props) {
    const listId = useId()
    const listRef = useRef<HTMLDivElement>(null)
    const [box, setBox] = useState<PopBox | null>(null)
    const [mounted, setMounted] = useState(false)
    /** body 포털은 .os-shell 밖이라 light/os 토큰을 직접 이어 받는다 */
    const [chromeTheme, setChromeTheme] = useState<'light' | 'dark'>('dark')

    useEffect(() => {
        setMounted(true)
        const root = document.querySelector('[data-os-root]')
        const t = root?.getAttribute('data-theme')
        setChromeTheme(t === 'light' ? 'light' : 'dark')
    }, [])

    useLayoutEffect(() => {
        const place = () => {
            const a = anchorRef.current
            if (!a) return
            const r = a.getBoundingClientRect()
            setBox({
                left: Math.round(r.left),
                width: Math.round(r.width),
                bottom: Math.round(window.innerHeight - r.top + 8),
            })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
        }
    }, [anchorRef, items.length])

    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
        el?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node | null
            if (!t) return
            // 픽커 안·입력칸(textarea/wrap)에서 온 클릭은 닫지 않는다 (같은 제스처로 바로 닫히는 것 방지)
            if (listRef.current?.contains(t)) return
            const wrap = anchorRef.current
            if (wrap?.contains(t)) return
            onClose()
        }
        document.addEventListener('mousedown', onDoc)
        return () => document.removeEventListener('mousedown', onDoc)
    }, [onClose, anchorRef])

    if (!mounted || !box) return null

    const emptyCopy = emptyQuery
        ? '부를 봇이 없어요'
        : '맞는 봇이 없어요'

    const pop = (
        <div data-theme={chromeTheme} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1200 }}>
        <div
            ref={listRef}
            className="os-mention-pop"
            data-theme="os"
            role="listbox"
            id={listId}
            aria-label="멘션할 봇"
            style={{
                position: 'fixed',
                left: box.left,
                width: box.width,
                bottom: box.bottom,
                zIndex: 1200,
                pointerEvents: 'auto',
            }}
        >
            <div className="os-mention-heading">내 팀 봇들</div>
            {items.length > 0 && (
                <div className="os-mention-section" role="group" aria-label="내 팀 봇들">
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
                <div className="os-mention-empty">{emptyCopy}</div>
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
        </div>
    )

    return createPortal(pop, document.body)
}
