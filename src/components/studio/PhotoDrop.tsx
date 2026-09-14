'use client'

// 사진 올리는 자리 — 끌어다 놓기 · 눌러서 고르기 · 붙여넣기 세 가지를 다 받는다.
// 대표 지적 2026-09-14 「파일 끌어다놓는 방식은 왜 안돼」
// 컴퓨터에서는 끌어다 놓는 게 파일 창을 여는 것보다 빠르고, 화면을 캡처해
// 바로 붙여넣는 사람도 많다.
import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_BYTES = 4 * 1024 * 1024

export function PhotoDrop({
    preview,
    onPicked,
    onError,
}: {
    preview: string | null
    /** 고른 사진을 dataURL 과 종류로 돌려준다 */
    onPicked: (dataUrl: string, mimeType: string) => void
    onError: (msg: string) => void
}) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [dragging, setDragging] = useState(false)

    const handleFile = useCallback((f: File | null | undefined) => {
        if (!f) return
        if (!/^image\//.test(f.type)) { onError('사진 파일만 올릴 수 있어요.'); return }
        if (f.size > MAX_BYTES) { onError('사진은 4MB 이하만 올려주세요.'); return }
        const reader = new FileReader()
        reader.onload = () => onPicked(String(reader.result), f.type || 'image/jpeg')
        reader.readAsDataURL(f)
    }, [onPicked, onError])

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
        >
            <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; handleFile(f) }}
                style={{ display: 'none' }}
            />

            {preview ? (
                <div style={{
                    padding: 14, borderRadius: 18,
                    border: dragging ? '2px dashed #22c55e' : '1.5px solid #e4e4e7',
                    background: dragging ? '#f0fdf4' : '#fff',
                }}>
                    {/* 올린 사진은 크게 보여준다. 작은 네모로 두면 올라갔는지 모르고 다시 누른다
                        (대표 지시 0915 「업로드 된걸 알아야지. 중장년 인지 규칙 적용해」) */}
                    {/* 사진을 눌러도 바꿀 수 있다. 아래 단추는 그대로 둔다 */}
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        aria-label="다른 사진으로 바꾸기"
                        style={{
                            position: 'relative', display: 'block', width: '100%',
                            padding: 0, border: 'none', background: 'none',
                            cursor: 'pointer', marginBottom: 12,
                        }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview} alt="올린 사진" style={{
                            width: '100%', aspectRatio: '1 / 1', objectFit: 'cover',
                            borderRadius: 14, display: 'block',
                        }} />
                        <span style={{
                            position: 'absolute', right: 10, bottom: 10,
                            background: 'rgba(0,0,0,0.62)', color: '#fff',
                            fontSize: 13.5, fontWeight: 700,
                            padding: '8px 14px', borderRadius: 999,
                        }}>
                            눌러서 바꾸기
                        </span>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
                            <span style={{
                                width: 24, height: 24, borderRadius: 999, background: '#1C2321', color: '#fff',
                                display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 900,
                            }} aria-hidden>✓</span>
                            사진을 올렸어요
                        </span>
                        <button onClick={() => fileRef.current?.click()} style={{
                            background: '#f4f4f5', border: 'none', borderRadius: 12,
                            padding: '12px 18px', fontSize: 15, color: '#3f3f46', cursor: 'pointer', fontWeight: 700,
                        }}>다른 사진으로</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                        width: '100%', minHeight: 320, padding: '48px 24px', borderRadius: 20,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        border: dragging ? '3px dashed #22c55e' : '2.5px dashed #d4d4d8',
                        background: dragging ? '#f0fdf4' : '#fff',
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}
                >
                    <div style={{ fontSize: 52, marginBottom: 16 }}>{dragging ? '📥' : '📷'}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: dragging ? '#166534' : '#18181b', marginBottom: 10 }}>
                        {dragging ? '여기에 놓으세요' : '사진을 끌어다 놓으세요'}
                    </div>
                    <div style={{ fontSize: 15.5, color: '#71717a', lineHeight: 1.7, wordBreak: 'keep-all' }}>
                        눌러서 고르셔도 되고, 복사한 사진을 붙여넣어도 돼요<br />
                        <span style={{ fontSize: 14, color: '#a1a1aa' }}>얼굴이 잘 보이는 밝은 사진 · 4MB 이하</span>
                    </div>
                </button>
            )}
        </div>
    )
}
