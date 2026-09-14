'use client'

// 전문가 프로필 사진 만들기 — 대표 지시 2026-09-14
// 구조는 ai.pfpmaker.com 을 참고했다. 다만 중장년 대상이라 고를 것을 줄이고,
// 값(클로버)을 버튼에 그대로 박았다.
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { STYLES, BACKDROPS } from '@/domains/studio/photo'
import { CURI_MODELS, DEFAULT_MODEL_ID, getModel } from '@/domains/studio/models'
import { CLOVER_UNIT_WON } from '@/domains/credit/packs'
import { PickCard } from '@/components/studio/PickCard'
import AppSidebar from '@/components/AppSidebar'

export default function ProfilePhotoPage() {
    const router = useRouter()
    const fileRef = useRef<HTMLInputElement>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [base64, setBase64] = useState<string | null>(null)
    const [mimeType, setMimeType] = useState('image/jpeg')
    const [modelId, setModelId] = useState(DEFAULT_MODEL_ID)
    const [styleId, setStyleId] = useState<string | null>(null)
    const [backdropId, setBackdropId] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [needCharge, setNeedCharge] = useState(false)

    const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (!f) return
        if (f.size > 4 * 1024 * 1024) { setErrorMsg('사진은 4MB 이하만 올려주세요.'); return }
        setErrorMsg(null)
        setMimeType(f.type || 'image/jpeg')
        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = String(reader.result)
            setPreview(dataUrl)
            setBase64(dataUrl.split(',')[1] ?? null)
        }
        reader.readAsDataURL(f)
    }

    const make = async () => {
        if (!base64 || !styleId || !backdropId) return
        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        try {
            const res = await fetch('/api/tools/profile-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType, styleId, backdropId, modelId }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '사진을 만들지 못했어요.')
            }
            setResult(`data:image/png;base64,${data.imageBase64}`)
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '사진을 만들지 못했어요.')
        } finally {
            setLoading(false)
        }
    }

    const 준비됨 = !!base64 && !!styleId && !!backdropId


    return (
        <main style={{ minHeight: '100dvh', background: '#fafafa' }}>
            <AppSidebar />
            <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 18px 90px' }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#18181b', margin: '0 0 6px', wordBreak: 'keep-all' }}>
                    전문가 프로필 사진 만들기
                </h1>
                <p style={{ fontSize: 14, color: '#71717a', margin: '0 0 24px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    내 사진 한 장만 올리면 됩니다. 얼굴은 그대로 두고 옷과 배경만 바꿔요.
                </p>

                {/* 1단계 사진 */}
                <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>1. 내 사진 올리기</div>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} style={{ display: 'none' }} />
                    {preview ? (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview} alt="올린 사진" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 14, border: '1px solid #e4e4e7' }} />
                            <button onClick={() => fileRef.current?.click()} style={{
                                background: '#f4f4f5', border: 'none', borderRadius: 10,
                                padding: '9px 14px', fontSize: 14, color: '#3f3f46', cursor: 'pointer', fontWeight: 600,
                            }}>다른 사진으로</button>
                        </div>
                    ) : (
                        <button onClick={() => fileRef.current?.click()} style={{
                            width: '100%', padding: '26px', borderRadius: 14,
                            border: '1.5px dashed #d4d4d8', background: '#fff',
                            fontSize: 15, color: '#52525b', cursor: 'pointer',
                        }}>
                            📷 사진 고르기<br />
                            <span style={{ fontSize: 12, color: '#a1a1aa' }}>얼굴이 잘 보이는 밝은 사진이 좋아요</span>
                        </button>
                    )}
                </div>

                {/* 2·3단계 — 사진을 올려야 열린다 */}
                <div style={{ opacity: base64 ? 1 : 0.4, pointerEvents: base64 ? 'auto' : 'none' }}>
                    {/* 모델 고르기 — 우리 이름으로 판다 */}
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>2. 어떤 모델로 만들까요</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {CURI_MODELS.map(m => {
                                const 못씀 = !!m.comingSoon
                                return (
                                    <button key={m.id} onClick={() => !못씀 && setModelId(m.id)} disabled={못씀} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '12px 14px', borderRadius: 14,
                                        border: modelId === m.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                        background: 못씀 ? '#fafafa' : '#fff',
                                        cursor: 못씀 ? 'default' : 'pointer', textAlign: 'left',
                                        opacity: 못씀 ? 0.6 : 1,
                                    }}>
                                        <span style={{
                                            flexShrink: 0, width: 38, height: 38, borderRadius: 11,
                                            background: m.tint, display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', fontSize: 17,
                                        }}>{m.id === 'curi-v1' ? '🍀' : m.id === 'nano-banana-2' ? '🍌' : '🤖'}</span>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 15, fontWeight: 700, color: '#18181b' }}>{m.label}</span>
                                            <span style={{
                                                marginLeft: 6, fontSize: 11, fontWeight: 700,
                                                color: 못씀 ? '#71717a' : '#166534',
                                                background: 못씀 ? '#f4f4f5' : '#dcfce7',
                                                padding: '2px 7px', borderRadius: 7,
                                            }}>{m.badge}</span>
                                            <span style={{ display: 'block', fontSize: 12.5, color: '#71717a', marginTop: 3, wordBreak: 'keep-all' }}>
                                                {m.comingSoon || m.desc}
                                            </span>
                                        </span>
                                        {!못씀 && (
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#3f3f46', flexShrink: 0 }}>🍀 {m.cost}</span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>3. 차림새</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {STYLES.map(o => (
                                <PickCard key={o.id} option={o} selected={styleId === o.id} onSelect={setStyleId} kind="outfit" />
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>4. 배경</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {BACKDROPS.map(o => (
                                <PickCard key={o.id} option={o} selected={backdropId === o.id} onSelect={setBackdropId} kind="backdrop" />
                            ))}
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 14, padding: '12px 16px', borderRadius: 12, marginBottom: 14, lineHeight: 1.6 }}>
                        {errorMsg}
                        {needCharge && (
                            <button onClick={() => router.push('/charge')} style={{
                                display: 'block', marginTop: 10, background: '#dc2626', color: '#fff',
                                border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            }}>클로버 충전하러 가기</button>
                        )}
                    </div>
                )}

                <button onClick={make} disabled={!준비됨 || loading} style={{
                    width: '100%', padding: '16px', borderRadius: 16, border: 'none',
                    background: (!준비됨 || loading) ? '#d4d4d8' : '#22c55e',
                    color: '#fff', fontSize: 16, fontWeight: 700,
                    cursor: (!준비됨 || loading) ? 'default' : 'pointer',
                }}>
                    {loading ? '만드는 중... (20초쯤 걸려요)' : `사진 만들기 (🍀 ${getModel(modelId)!.cost}개 · ${(getModel(modelId)!.cost * CLOVER_UNIT_WON).toLocaleString()}원)`}
                </button>

                {/* 결과 */}
                {result && (
                    <div style={{ marginTop: 26 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#18181b', marginBottom: 10 }}>완성됐어요</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result} alt="만든 프로필 사진" style={{ width: '100%', borderRadius: 16, border: '1px solid #e4e4e7' }} />
                        <a href={result} download="내_프로필_사진.png" style={{
                            display: 'block', marginTop: 12, padding: '14px', borderRadius: 14,
                            background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700,
                            textAlign: 'center', textDecoration: 'none',
                        }}>사진 내려받기</a>
                    </div>
                )}

                {/* 어떻게 되나 */}
                <div style={{ marginTop: 30, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16, padding: '18px 20px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#3f3f46', marginBottom: 10 }}>어떻게 되나요</div>
                    {['얼굴이 잘 보이는 사진 한 장을 올려요', '옷과 배경을 고릅니다', '얼굴은 그대로 두고 나머지만 바뀌어요'].map((t, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i === 2 ? 0 : 8 }}>
                            <span style={{
                                flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                                background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{i + 1}</span>
                            <span style={{ fontSize: 14, color: '#52525b', lineHeight: 1.6, wordBreak: 'keep-all' }}>{t}</span>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    )
}
