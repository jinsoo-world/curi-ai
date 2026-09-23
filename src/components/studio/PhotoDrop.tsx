'use client'

// 사진 올리는 자리 — 끌어다 놓기 · 눌러서 고르기 · 붙여넣기 세 가지를 다 받는다.
// 대표 지적 2026-09-14 「파일 끌어다놓는 방식은 왜 안돼」
// 컴퓨터에서는 끌어다 놓는 게 파일 창을 여는 것보다 빠르고, 화면을 캡처해
// 바로 붙여넣는 사람도 많다.
import { useState, useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from 'react'
import { cropSquareJpeg } from '@/domains/os/compress-photo'

const MAX_BYTES = 4 * 1024 * 1024

export function PhotoDrop({
    preview,
    onPicked,
    onError,
    maxBytes = MAX_BYTES,
    showCamera = true,
    privacyNote,
    emptyTitle = '사진을 올려주세요',
    emptyHint,
    successLabel = '사진을 올렸어요',
    /** avatar: 프로필용 작은 1:1 정방형. default: 도구용 큰 드롭존 */
    variant = 'default',
}: {
    preview: string | null
    /** 고른 사진을 dataURL 과 종류로 돌려준다 */
    onPicked: (dataUrl: string, mimeType: string) => void
    onError: (msg: string) => void
    /** 기본 4MB. 프로필 등에서만 늘릴 때 쓴다 */
    maxBytes?: number
    /** false 면 카메라 단추를 숨긴다 */
    showCamera?: boolean
    /** null 이면 안내 문구를 숨긴다. undefined 면 기본 안내 */
    privacyNote?: string | null
    emptyTitle?: string
    emptyHint?: ReactNode
    successLabel?: string
    variant?: 'default' | 'avatar'
}) {
    const isAvatar = variant === 'avatar'
    // 프로필은 작은 1:1 크롬(~160px). 파일학습/도구 드롭은 기존 큰 칸 유지
    const avatarSize = 160
    const fileRef = useRef<HTMLInputElement>(null)
    const cameraRef = useRef<HTMLInputElement>(null)
    const [dragging, setDragging] = useState(false)
    // 아바타 1:1 미리보기에서 사진을 끌어 얼굴 위치를 맞춘다 (object-position %)
    const [pos, setPos] = useState({ x: 50, y: 50 })
    const posRef = useRef(pos)
    const pan = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean; id: number } | null>(null)
    const frameRef = useRef<HTMLDivElement>(null)
    const cropBusy = useRef(false)

    // 새 사진을 고르면 가운데로 되돌린다
    useEffect(() => {
        const next = { x: 50, y: 50 }
        posRef.current = next
        setPos(next)
    }, [preview])

    const handleFile = useCallback((f: File | null | undefined) => {
        if (!f) return
        if (!/^image\//.test(f.type)) { onError('사진 파일만 올릴 수 있어요.'); return }
        if (f.size > maxBytes) {
            const mb = Math.round(maxBytes / (1024 * 1024))
            onError(`사진은 ${mb}MB 이하만 올려주세요.`)
            return
        }
        const reader = new FileReader()
        reader.onload = () => onPicked(String(reader.result), f.type || 'image/jpeg')
        reader.readAsDataURL(f)
    }, [onPicked, onError, maxBytes])

    // 화면을 캡처해 바로 붙여넣는 경우
    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'))
            if (item) handleFile(item.getAsFile())
        }
        window.addEventListener('paste', onPaste)
        return () => window.removeEventListener('paste', onPaste)
    }, [handleFile])

    return (
        <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={e => { e.preventDefault(); setDragging(false) }}
            onDrop={e => {
                e.preventDefault(); setDragging(false)
                handleFile(e.dataTransfer.files?.[0])
            }}
            style={isAvatar ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' } : undefined}
        >
            <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleFile(f) }}
                style={{ display: 'none' }}
            />
            {/* 휴대폰에서 바로 찍기 — 중장년은 파일 창보다 카메라가 쉽다 */}
            <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleFile(f) }}
                style={{ display: 'none' }}
            />

            {preview ? (
                <div style={{
                    padding: isAvatar ? 10 : 14,
                    borderRadius: isAvatar ? 16 : 18,
                    border: dragging ? '2px dashed #22c55e' : '1.5px solid #e4e4e7',
                    background: dragging ? '#f0fdf4' : '#fff',
                    width: isAvatar ? avatarSize + 20 : '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                }}>
                    {/* avatar: 1:1 크롬에서 끌어 위치 맞춤. default: 크게 보여 올린 걸 바로 알게 함 */}
                    <div
                        ref={frameRef}
                        role={isAvatar ? 'img' : undefined}
                        aria-label={isAvatar ? '프로필 사진. 끌어서 위치를 맞춰요' : undefined}
                        onClick={!isAvatar ? () => fileRef.current?.click() : undefined}
                        onPointerDown={isAvatar ? (e) => {
                            if (e.button !== 0 && e.pointerType === 'mouse') return
                            pan.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y, moved: false, id: e.pointerId }
                            e.currentTarget.setPointerCapture(e.pointerId)
                        } : undefined}
                        onPointerMove={isAvatar ? (e) => {
                            const p = pan.current
                            if (!p || p.id !== e.pointerId) return
                            const dx = e.clientX - p.x
                            const dy = e.clientY - p.y
                            if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true
                            const box = frameRef.current?.getBoundingClientRect()
                            const w = box?.width || avatarSize
                            const h = box?.height || avatarSize
                            // 끄는 방향과 사진이 같이 움직이게 (cover 잘림 안에서 %)
                            const nx = Math.max(0, Math.min(100, p.ox - (dx / w) * 100))
                            const ny = Math.max(0, Math.min(100, p.oy - (dy / h) * 100))
                            posRef.current = { x: nx, y: ny }
                            setPos(posRef.current)
                        } : undefined}
                        onPointerUp={isAvatar ? async (e) => {
                            const p = pan.current
                            if (!p || p.id !== e.pointerId) return
                            pan.current = null
                            try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* */ }
                            if (!p.moved) return
                            if (cropBusy.current || !preview) return
                            cropBusy.current = true
                            try {
                                const file = await cropSquareJpeg(preview, posRef.current.x, posRef.current.y, 1024, 0.88)
                                if (!file) return
                                const url = URL.createObjectURL(file)
                                // dataURL 대신 blob URL 을 읽혀 onPicked 가 File 로 바꾸게 한다
                                const reader = new FileReader()
                                reader.onload = () => {
                                    onPicked(String(reader.result), 'image/jpeg')
                                    URL.revokeObjectURL(url)
                                }
                                reader.readAsDataURL(file)
                            } finally {
                                cropBusy.current = false
                            }
                        } : undefined}
                        onPointerCancel={isAvatar ? () => { pan.current = null } : undefined}
                        style={{
                            position: 'relative', display: 'block',
                            width: isAvatar ? avatarSize : '100%',
                            maxWidth: '100%',
                            padding: 0, border: 'none', background: 'none',
                            cursor: isAvatar ? 'grab' : 'pointer',
                            marginBottom: isAvatar ? 8 : 12,
                            touchAction: isAvatar ? 'none' : undefined,
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                        } as CSSProperties}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview} alt="올린 사진" draggable={false} style={{
                            width: '100%',
                            aspectRatio: '1 / 1',
                            height: isAvatar ? avatarSize : undefined,
                            objectFit: 'cover',
                            objectPosition: `${pos.x}% ${pos.y}%`,
                            borderRadius: isAvatar ? 12 : 14,
                            display: 'block',
                            pointerEvents: 'none',
                        }} />
                        <span style={{
                            position: 'absolute', right: isAvatar ? 6 : 10, bottom: isAvatar ? 6 : 10,
                            background: 'rgba(0,0,0,0.62)', color: '#fff',
                            fontSize: isAvatar ? 12 : 15, fontWeight: 700,
                            padding: isAvatar ? '5px 10px' : '8px 14px', borderRadius: 999,
                            pointerEvents: 'none',
                        }}>
                            {isAvatar ? '끌어서 맞춤' : '눌러서 바꾸기'}
                        </span>
                    </div>
                    <div style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 8,
                        flexWrap: 'wrap',
                    }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: isAvatar ? 13 : 16, fontWeight: 800, color: '#16a34a',
                        }}>
                            <span style={{
                                width: isAvatar ? 20 : 24, height: isAvatar ? 20 : 24, borderRadius: 999,
                                background: '#1C2321', color: '#fff',
                                display: 'grid', placeItems: 'center',
                                fontSize: isAvatar ? 12 : 15, fontWeight: 900,
                            }} aria-hidden>✓</span>
                            {successLabel}
                        </span>
                        <button type="button" onClick={() => fileRef.current?.click()} style={{
                            background: '#f4f4f5', border: 'none', borderRadius: 12,
                            padding: isAvatar ? '8px 12px' : '12px 18px',
                            fontSize: isAvatar ? 13 : 15, color: '#3f3f46',
                            cursor: 'pointer', fontWeight: 700,
                        }}>다른 사진으로</button>
                    </div>
                    {isAvatar && (
                        <p style={{
                            margin: '8px 0 0', fontSize: 12, color: '#71717a',
                            lineHeight: 1.45, wordBreak: 'keep-all',
                        }}>사진을 끌어 얼굴 위치를 맞출 수 있어요</p>
                    )}
                </div>
            ) : (
                <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                        width: isAvatar ? avatarSize : '100%',
                        height: isAvatar ? avatarSize : undefined,
                        maxWidth: '100%',
                        minHeight: isAvatar ? avatarSize : 320,
                        aspectRatio: isAvatar ? '1 / 1' : undefined,
                        padding: isAvatar ? '12px 10px' : '48px 24px',
                        borderRadius: isAvatar ? 16 : 20,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        border: dragging
                            ? (isAvatar ? '2.5px dashed #22c55e' : '3px dashed #22c55e')
                            : (isAvatar ? '2px dashed #d4d4d8' : '2.5px dashed #d4d4d8'),
                        background: dragging ? '#f0fdf4' : '#fff',
                        cursor: 'pointer', transition: 'all 0.15s',
                        boxSizing: 'border-box',
                    }}
                >
                    <svg
                        width={isAvatar ? 36 : 56}
                        height={isAvatar ? 36 : 56}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={dragging ? '#166534' : '#3f3f46'}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ marginBottom: isAvatar ? 8 : 16 }}
                        aria-hidden
                    >
                        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 9.8 3.7h4.4a1 1 0 0 1 .83.45l.94 1.4a1 1 0 0 0 .83.45h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
                        <circle cx="12" cy="13" r="3.6" />
                    </svg>
                    <div style={{
                        fontSize: isAvatar ? 13 : 22,
                        fontWeight: 800,
                        color: dragging ? '#166534' : '#18181b',
                        marginBottom: isAvatar ? 4 : 10,
                        textAlign: 'center',
                        lineHeight: 1.35,
                        wordBreak: 'keep-all',
                        padding: isAvatar ? '0 4px' : 0,
                    }}>
                        {dragging ? '여기에 놓으세요' : emptyTitle}
                    </div>
                    {!isAvatar && (
                        <div style={{ fontSize: 16, color: '#71717a', lineHeight: 1.7, wordBreak: 'keep-all' }}>
                            {emptyHint ?? (
                                <>
                                    눌러서 고르셔도 되고, 끌어다 놓거나 붙여넣어도 돼요<br />
                                    <span style={{ fontSize: 15, color: '#a1a1aa' }}>얼굴이 잘 보이는 밝은 사진, 4MB 이하</span>
                                </>
                            )}
                        </div>
                    )}
                    {isAvatar && emptyHint && (
                        <div style={{
                            fontSize: 11, color: '#a1a1aa', lineHeight: 1.4,
                            wordBreak: 'keep-all', textAlign: 'center', marginTop: 2,
                        }}>
                            {emptyHint}
                        </div>
                    )}
                </button>
            )}

            {!preview && (
                <>
                    {showCamera && (
                        <button
                            type="button"
                            onClick={() => cameraRef.current?.click()}
                            className="photo-drop-camera"
                            style={{
                                width: '100%', marginTop: 10, padding: '15px 12px', borderRadius: 14,
                                border: '1px solid #e4e4e7', background: '#fff',
                                fontSize: 16, fontWeight: 800, color: '#18181b', cursor: 'pointer',
                            }}
                        >
                            휴대폰 카메라로 찍기
                        </button>
                    )}
                    {/* 얼굴 사진을 올리는 서비스라 가장 무서운 지점이다. 올리는 칸 바로 밑에 적는다 */}
                    {privacyNote !== null && (
                        <p style={{ fontSize: 15, color: '#71717a', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            {privacyNote ?? '올린 사진은 이 사진을 만드는 데에만 씁니다. AI 학습에 쓰지 않고, 만든 뒤 48시간 안에 지웁니다.'}
                        </p>
                    )}
                </>
            )}
        </div>
    )
}
