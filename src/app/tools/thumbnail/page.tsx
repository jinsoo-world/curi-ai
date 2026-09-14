'use client'

// 썸네일 만들기 — 대표 확정 2026-09-15 「썸네일 만들기 (유튜브, 어울림, 멤버십, 디콘 등)」
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { THUMB_PLACES, THUMB_LOOKS, THUMBNAIL_COST, MAX_TITLE, MAX_SUB } from '@/domains/studio/thumbnail'
import MakingBar from '@/components/studio/MakingBar'
import CloverIcon from '@/components/ui/CloverIcon'
import ThumbnailCanvas, { type 글자값 } from '@/components/studio/ThumbnailCanvas'
import AppSidebar from '@/components/AppSidebar'
import ToolHero from '@/components/studio/ToolHero'

export default function ThumbnailPage() {
    const router = useRouter()
    const [placeId, setPlaceId] = useState(THUMB_PLACES[0].id)
    const [lookId, setLookId] = useState<string | null>(null)
    const [제목, set제목] = useState('')
    const [부제, set부제] = useState('')
    const [result, setResult] = useState<string | null>(null)
    const [미리보기, set미리보기] = useState(false)
    const [글자, set글자] = useState<글자값 | null>(null)
    const [완성본, set완성본] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [needCharge, setNeedCharge] = useState(false)

    const make = async () => {
        if (!lookId || !제목.trim()) return
        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        try {
            const res = await fetch('/api/tools/thumbnail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ placeId, lookId, title: 제목, subtitle: 부제 }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '썸네일을 만들지 못했어요.')
            }
            set미리보기(!!data.preview)
            set글자(data.text ?? null)
            set완성본(null)
            setResult(`data:image/${data.preview ? 'jpeg' : 'png'};base64,${data.imageBase64}`)
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '썸네일을 만들지 못했어요.')
        } finally {
            setLoading(false)
        }
    }

    const 준비됨 = !!lookId && !!제목.trim()

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div className="tool-page">
                <ToolHero
                    title="썸네일 만들기"
                    desc="유튜브·어울림·멤버십·디지털 콘텐츠 표지를 만듭니다. 제목은 또렷하게 얹어드려요."
                    samples={[{ src: '/samples/act-w7.webp', label: '눈에 띄는' }, { src: '/samples/act-m5.webp', label: '깔끔한' }, { src: '/samples/act-w5.webp', label: '따뜻한' }, { src: '/samples/act-m2.webp', label: '종이 느낌' }]}
                />

                <div>
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>1. 어디에 쓸까요</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                            {THUMB_PLACES.map(p => (
                                <button key={p.id} onClick={() => setPlaceId(p.id)} style={{
                                    padding: '14px 10px', borderRadius: 14,
                                    border: placeId === p.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: placeId === p.id ? '#f0fdf4' : '#fff', cursor: 'pointer',
                                }}>
                                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{p.label}</span>
                                    <span style={{ display: 'block', fontSize: 12, color: '#71717a', marginTop: 3 }}>{p.use}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>2. 제목</div>
                        <input
                            value={제목}
                            onChange={(e) => set제목(e.target.value.slice(0, MAX_TITLE))}
                            placeholder="예) 60에 시작한 블로그"
                            style={칸(17, 800)}
                        />
                        <input
                            value={부제}
                            onChange={(e) => set부제(e.target.value.slice(0, MAX_SUB))}
                            placeholder="작은 글씨 (없어도 돼요)"
                            style={{ ...칸(15, 600), marginTop: 8 }}
                        />
                    </div>

                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>3. 느낌</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                            {THUMB_LOOKS.map(l => (
                                <button key={l.id} onClick={() => setLookId(l.id)} style={{
                                    padding: '14px 10px', borderRadius: 14,
                                    border: lookId === l.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: lookId === l.id ? '#f0fdf4' : '#fff', cursor: 'pointer',
                                    fontSize: 14.5, fontWeight: 800, color: '#18181b',
                                }}>
                                    {l.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div>
                    {errorMsg && (
                        <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 14, padding: '12px 16px', borderRadius: 12, marginBottom: 14, lineHeight: 1.6 }}>
                            {errorMsg}
                            {needCharge && (
                                <button onClick={() => router.push('/charge')} style={{
                                    display: 'block', marginTop: 10, background: '#dc2626', color: '#fff', border: 'none',
                                    borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                }}>충전하러 가기</button>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <MakingBar 예상초={18} />
                    ) : (
                        <button onClick={make} disabled={!준비됨} style={{
                            width: '100%', padding: 16, borderRadius: 16, border: 'none',
                            background: !준비됨 ? '#d4d4d8' : '#22c55e',
                            color: '#fff', fontSize: 16, fontWeight: 700,
                            cursor: !준비됨 ? 'default' : 'pointer',
                        }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                썸네일 만들기 <CloverIcon size={17} color="#fff" /> {THUMBNAIL_COST}개
                            </span>
                        </button>
                    )}

                    {result && (
                        <div style={{ marginTop: 26 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#18181b', marginBottom: 10 }}>다 됐어요</div>
                            {글자 ? (
                                <ThumbnailCanvas background={result} text={글자} onReady={set완성본} />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={result} alt="만든 썸네일" style={{ width: '100%', borderRadius: 16, border: '1px solid #e4e4e7' }} />
                            )}
                            {미리보기 ? (
                                <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, padding: '18px 18px 16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>선명한 그림은 회원만 받을 수 있어요</div>
                                    <p style={{ fontSize: 13.5, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6 }}>
                                        지금 보이는 건 미리보기라 흐릿해요. 로그인하면 원본을 바로 내려받습니다.
                                    </p>
                                    <button onClick={() => router.push('/login')} style={{
                                        width: '100%', padding: 14, borderRadius: 14, border: 'none',
                                        background: '#22c55e', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                    }}>로그인하고 원본 받기</button>
                                </div>
                            ) : (
                                <a href={완성본 ?? result} download="썸네일.png" style={{
                                    display: 'block', marginTop: 12, padding: 14, borderRadius: 14,
                                    background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700,
                                    textAlign: 'center', textDecoration: 'none',
                                }}>썸네일 내려받기</a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}

function 칸(크기: number, 굵기: number): React.CSSProperties {
    return {
        width: '100%', height: 52, borderRadius: 14,
        border: '1.5px solid #e4e4e7', background: '#fff',
        padding: '0 15px', fontSize: 크기, fontWeight: 굵기,
        color: '#18181b', outline: 'none', fontFamily: 'inherit',
    }
}
