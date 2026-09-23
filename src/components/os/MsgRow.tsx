'use client'
// 말풍선 줄. 누르면 아래에 시각 + 복사 단추가 열린다 (밀어서 시각 드러내기는 없앤다).

import {
    createContext, useCallback, useContext, useEffect, useId, useRef, useState,
    type MouseEvent, type ReactNode,
} from 'react'
import { formatMessageTime } from '@/domains/os/message-time'
import { plainMessageCopyText } from '@/domains/os/copy-text'

type MetaCtx = {
    openId: string | null
    setOpenId: (id: string | null) => void
}

const MsgMetaContext = createContext<MetaCtx | null>(null)

/** 목록을 감싸면 한 번에 한 줄만 메타(시각, 복사)가 열린다. 없어도 MsgRow 단독으로 동작한다. */
export function MsgMetaProvider({ children }: { children: ReactNode }) {
    const [openId, setOpenId] = useState<string | null>(null)
    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            const t = e.target as HTMLElement | null
            if (t?.closest('.os-msg-row')) return
            setOpenId(null)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [])
    return (
        <MsgMetaContext.Provider value={{ openId, setOpenId }}>
            {children}
        </MsgMetaContext.Provider>
    )
}

/** @deprecated 밀어서 시각 드러내기는 클릭 메타로 대체. 호환용 빈 훅. */
export function useRevealTimestamps(): {
    ref: { current: null }
    style: undefined
    className: undefined
    reveal: number
} {
    return { ref: { current: null }, style: undefined, className: undefined, reveal: 0 }
}

export function MsgRow({
    side,
    createdAt,
    copyText,
    rowId,
    children,
}: {
    side: 'me' | 'bot'
    createdAt?: string | null
    /** 복사할 평문. 없으면 복사 단추 숨김 */
    copyText?: string | null
    /** 한 줄만 열리게 할 때 쓰는 안정 id. 없으면 내부 id */
    rowId?: string
    children: ReactNode
}) {
    const autoId = useId()
    const id = rowId ?? autoId
    const ctx = useContext(MsgMetaContext)
    const [localOpen, setLocalOpen] = useState(false)
    const open = ctx ? ctx.openId === id : localOpen
    const rowRef = useRef<HTMLDivElement>(null)
    const [copied, setCopied] = useState(false)
    const label = formatMessageTime(createdAt)
    const canCopy = !!(copyText && copyText.trim())

    const setOpen = useCallback((next: boolean) => {
        if (ctx) ctx.setOpenId(next ? id : null)
        else setLocalOpen(next)
    }, [ctx, id])

    // Provider 없을 때 바깥 클릭으로 닫기
    useEffect(() => {
        if (ctx || !open) return
        const onPointerDown = (e: PointerEvent) => {
            const t = e.target as Node | null
            if (t && rowRef.current?.contains(t)) return
            setLocalOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => document.removeEventListener('pointerdown', onPointerDown)
    }, [ctx, open])

    const onRowClick = (e: MouseEvent) => {
        const t = e.target as HTMLElement | null
        // 링크, 단추, 입력은 토글하지 않는다 (복사 단추는 아래에서 stop)
        if (t?.closest('a, button, input, textarea, [contenteditable="true"]')) return
        setOpen(!open)
    }

    const onCopy = async (e: MouseEvent) => {
        e.stopPropagation()
        if (!canCopy) return
        const plain = plainMessageCopyText(copyText)
        try {
            await navigator.clipboard.writeText(plain)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
        } catch {
            // 클립보드 거부 시 조용히 무시
        }
    }

    return (
        <div
            ref={rowRef}
            className={`os-msg-row ${side}${open ? ' is-open' : ''}`}
            data-side={side}
            onClick={onRowClick}
        >
            <div className="os-msg-main">{children}</div>
            {open && (label || canCopy) && (
                <div className={`os-msg-meta ${side}`} role="group" aria-label="메시지 정보">
                    {label ? (
                        <time className="os-msg-time" dateTime={createdAt || undefined}>{label}</time>
                    ) : <span className="os-msg-time" />}
                    {canCopy && (
                        <button
                            type="button"
                            className="os-msg-copy"
                            onClick={onCopy}
                            aria-label={copied ? '복사됨' : '메시지 복사'}
                        >
                            {copied ? '복사됨' : '복사'}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
