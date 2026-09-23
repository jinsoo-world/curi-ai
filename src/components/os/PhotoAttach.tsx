'use client'
// 사진 붙이기 — ＋ 메뉴(사진 / 자료) + 입력창 위 미리보기 띠 + 올리기 상태.
// 규칙(장 수·크기·종류·격자)은 domains/os/photos.ts 에만 있다. 올리기는 기존 /api/chat/upload-image 를 장당 부른다(동시 3).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    checkPhotoFiles, runLimited, pickImageFiles, PHOTO_MAX_COUNT, PHOTO_TYPES,
} from '@/domains/os/photos'

export interface PhotoItem {
    id: string
    file: File
    /** 화면에 보여줄 임시 주소 (URL.createObjectURL) */
    preview: string
    state: 'uploading' | 'done' | 'error'
    /** 올린 뒤 서버가 준 공개 주소 */
    url?: string
    /** 실패 이유 (한 줄) */
    error?: string
}

async function uploadOne(file: File): Promise<string> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/chat/upload-image', { method: 'POST', body: form })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d?.url) throw new Error(String(d?.error ?? '사진을 올리지 못했어요'))
    return d.url as string
}

/** 붙인 사진 목록과 올리기를 맡는다. OsChat 은 이 훅의 값만 쓴다. */
export function usePhotoAttach() {
    const [items, setItems] = useState<PhotoItem[]>([])
    const itemsRef = useRef<PhotoItem[]>([])          // 콜백 안에서 최신 목록을 보려고 거울로 든다
    const [notice, setNotice] = useState<string | null>(null)
    useEffect(() => { itemsRef.current = items }, [items])

    // 안내는 3초 뒤 사라진다
    useEffect(() => {
        if (!notice) return
        const t = setTimeout(() => setNotice(null), 3000)
        return () => clearTimeout(t)
    }, [notice])

    const patch = useCallback((id: string, p: Partial<PhotoItem>) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, ...p } : it))
    }, [])

    const upload = useCallback(async (targets: PhotoItem[]) => {
        await runLimited(targets.map(it => async () => {
            try {
                const url = await uploadOne(it.file)
                patch(it.id, { state: 'done', url, error: undefined })
            } catch (e) {
                patch(it.id, { state: 'error', error: e instanceof Error ? e.message : '사진을 올리지 못했어요' })
            }
        }))
    }, [patch])

    const add = useCallback((files: File[]) => {
        if (files.length === 0) return
        const r = checkPhotoFiles(files, itemsRef.current.length)
        if (r.notice) setNotice(r.notice)
        const fresh: PhotoItem[] = r.ok.map(f => ({
            id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file: f, preview: URL.createObjectURL(f), state: 'uploading',
        }))
        if (fresh.length === 0) return
        itemsRef.current = [...itemsRef.current, ...fresh]
        setItems(itemsRef.current)
        void upload(fresh)
    }, [upload])

    const remove = useCallback((id: string) => {
        const it = itemsRef.current.find(x => x.id === id)
        if (it) URL.revokeObjectURL(it.preview)
        itemsRef.current = itemsRef.current.filter(x => x.id !== id)
        setItems(itemsRef.current)
    }, [])

    const retry = useCallback((id: string) => {
        const it = itemsRef.current.find(x => x.id === id)
        if (!it) return
        patch(id, { state: 'uploading', error: undefined })
        void upload([it])
    }, [patch, upload])

    const clear = useCallback(() => {
        itemsRef.current.forEach(it => URL.revokeObjectURL(it.preview))
        itemsRef.current = []
        setItems([])
    }, [])

    /** 끌어놓기·붙여넣기에서 사진만 골라 넣는다 */
    const addFromData = useCallback((dt: DataTransfer | null) => {
        if (!dt) return false
        const files = pickImageFiles(Array.from(dt.items ?? []))
        const picked = files.length > 0 ? files : pickImageFiles(Array.from(dt.files ?? []))
        if (picked.length === 0) return false
        add(picked)
        return true
    }, [add])

    const uploading = items.some(it => it.state === 'uploading')
    const failed = items.some(it => it.state === 'error')
    const urls = items.filter(it => it.state === 'done' && it.url).map(it => it.url as string)

    return { items, notice, add, addFromData, remove, retry, clear, uploading, failed, urls }
}

/* ---------- ＋ 메뉴 ---------- */

interface MenuProps {
    /** 자료 넣기 시트를 열 수 있나 (내 팀 봇일 때만) */
    canKnowledge: boolean
    onPickPhotos: (files: File[]) => void
    onKnowledge: () => void
}

export function PhotoPlusMenu({ canKnowledge, onPickPhotos, onKnowledge }: MenuProps) {
    const [open, setOpen] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const camRef = useRef<HTMLInputElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    // 카메라 항목은 손가락 화면(폰)에서만. 메뉴는 누른 뒤에만 그려지니 서버 렌더와 어긋나지 않는다
    const touch = open && typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false)

    // 바깥을 누르면 닫힌다
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onEsc)
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
    }, [open])

    const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        setOpen(false)
        if (files.length > 0) onPickPhotos(files)
    }

    return (
        <div ref={wrapRef} className="os-plus-wrap">
            <button className="os-icon-btn" aria-label="붙이기" aria-haspopup="menu" aria-expanded={open}
                title="사진·자료 붙이기" onClick={() => setOpen(v => !v)}>＋</button>
            {open && (
                <div className="os-plus-menu" role="menu">
                    <button role="menuitem" className="os-plus-item" onClick={() => fileRef.current?.click()}>
                        📷 사진 붙이기 <small>최대 {PHOTO_MAX_COUNT}장</small>
                    </button>
                    {touch && (
                        <button role="menuitem" className="os-plus-item" onClick={() => camRef.current?.click()}>
                            📸 카메라로 찍기
                        </button>
                    )}
                    <button role="menuitem" className="os-plus-item" disabled={!canKnowledge}
                        title={canKnowledge ? undefined : '내 팀의 봇에만 자료를 넣을 수 있어요'}
                        onClick={() => { setOpen(false); onKnowledge() }}>
                        📎 자료 넣기 <small>PDF·글·링크</small>
                    </button>
                </div>
            )}
            <input ref={fileRef} type="file" multiple accept={PHOTO_TYPES.join(',')} onChange={onFiles}
                style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onFiles}
                style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
        </div>
    )
}

/* ---------- 미리보기 띠 ---------- */

interface StripProps {
    items: PhotoItem[]
    notice: string | null
    onRemove: (id: string) => void
    onRetry: (id: string) => void
}

export function PhotoStrip({ items, notice, onRemove, onRetry }: StripProps) {
    if (items.length === 0 && !notice) return null
    return (
        <div className="os-photo-strip-wrap">
            {notice && <div className="os-photo-notice" role="status">{notice}</div>}
            {items.length > 0 && (
                <div className="os-photo-strip" aria-label={`붙인 사진 ${items.length}장`}>
                    {items.map(it => (
                        <div key={it.id} className="os-photo-thumb" data-state={it.state}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={it.preview} alt="" />
                            {it.state === 'uploading' && <span className="os-photo-spin" aria-label="올리는 중" />}
                            {it.state === 'error' && (
                                <button className="os-photo-retry" title={it.error ?? '다시 시도'} onClick={() => onRetry(it.id)}>다시</button>
                            )}
                            <button className="os-photo-x" aria-label="이 사진 빼기" onClick={() => onRemove(it.id)}>×</button>
                        </div>
                    ))}
                    <span className="os-photo-count">{items.length}/{PHOTO_MAX_COUNT}</span>
                </div>
            )}
        </div>
    )
}
