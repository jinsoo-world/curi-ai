'use client'

// 인스타 프로필 사진 만들기 — 대표 지시 2026-09-14
// 전문가용과 다른 점 = 정사각형이고 화면에서 동그랗게 잘려 보인다.
// 그래서 결과를 **동그란 모습으로 미리 보여준다**. 그게 실제로 보이는 모습이다.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MOODS, TONES } from '@/domains/studio/insta'
import { CURI_MODELS, DEFAULT_MODEL_ID, getModel } from '@/domains/studio/models'
import { CLOVER_UNIT_WON } from '@/domains/credit/packs'
import { PickCard } from '@/components/studio/PickCard'
import { PhotoDrop } from '@/components/studio/PhotoDrop'
import AppSidebar from '@/components/AppSidebar'

export default function InstaProfilePage() {
    const router = useRouter()
    const [preview, setPreview] = useState<string | null>(null)
    const [base64, setBase64] = useState<string | null>(null)
    const [mimeType, setMimeType] = useState('image/jpeg')
    const [modelId, setModelId] = useState(DEFAULT_MODEL_ID)
    const [moodId, setMoodId] = useState<string | null>(null)
    const [toneId, setToneId] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [needCharge, setNeedCharge] = useState(false)

    const make = async () => {
        if (!base64 || !moodId || !toneId) return
        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        try {
            const res = await fetch('/api/tools/profile-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType, styleId: moodId, backdropId: toneId, modelId, kind: 'insta' }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '사진을 만들지 못했어요.')
            }
            setResult(`data:image/png;base64,${data.imageBase64}`)
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '사진을 만들지 못했어요.')
        } finally { setLoading(false) }
    }

    const 준비됨 = !!base64 && !!moodId && !!toneId
    const cost = getModel(modelId)!.cost


    return (
        <main style={{ minHeight: '100dvh', background: '#fafafa' }}>
            <AppSidebar />
            <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 18px 90px' }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#18181b', margin: '0 0 6px', wordBreak: 'keep-all' }}>
                    인스타 프로필 사진 만들기
                </h1>
                <p style={{ fontSize: 14, color: '#71717a', margin: '0 0 24px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    인스타에서는 사진이 동그랗게 잘려 보여요. 그에 맞춰 얼굴이 잘 나오게 만들어드립니다.
                </p>

                <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>1. 내 사진 올리기</div>
                    <PhotoDrop
                        preview={preview}
                        onPicked={(dataUrl, mt) => {
                            setPreview(dataUrl)
                            setBase64(dataUrl.split(',')[1] ?? null)
                            setMimeType(mt)
                            setErrorMsg(null)
                        }}
                        onError={setErrorMsg}
                    />
                </div>

                <div style={{ opacity: base64 ? 1 : 0.4, pointerEvents: base64 ? 'auto' : 'none' }}>
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
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>3. 분위기</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {MOODS.map(o => (
                                <PickCard key={o.id} option={o} selected={moodId === o.id} onSelect={setMoodId} kind="backdrop" />
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>4. 배경색</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {TONES.map(o => (
                                <PickCard key={o.id} option={o} selected={toneId === o.id} onSelect={setToneId} kind="backdrop" />
                            ))}
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 14, padding: '12px 16px', borderRadius: 12, marginBottom: 14, lineHeight: 1.6 }}>
                        {errorMsg}
                        {needCharge && (
                            <button onClick={() => router.push('/charge')} style={{
                                display: 'block', marginTop: 10, background: '#dc2626', color: '#fff', border: 'none',
                                borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            }}>클로버 충전하러 가기</button>
                        )}
                    </div>
                )}

                <button onClick={make} disabled={!준비됨 || loading} style={{
                    width: '100%', padding: '16px', borderRadius: 16, border: 'none',
                    background: (!준비됨 || loading) ? '#d4d4d8' : '#22c55e',
                    color: '#fff', fontSize: 16, fontWeight: 700, cursor: (!준비됨 || loading) ? 'default' : 'pointer',
                }}>
                    {loading ? '만드는 중... (20초쯤 걸려요)' : `사진 만들기 (🍀 ${cost}개 · ${(cost * CLOVER_UNIT_WON).toLocaleString()}원)`}
                </button>

                {result && (
                    <div style={{ marginTop: 26 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#18181b', marginBottom: 12 }}>완성됐어요</div>
                        {/* 실제로 보이는 모습 = 동그랗게 잘린 것 */}
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14 }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={result} alt="인스타에서 보이는 모습" style={{
                                width: 104, height: 104, objectFit: 'cover', borderRadius: '50%',
                                border: '3px solid #fff', boxShadow: '0 0 0 2px #e4e4e7', flexShrink: 0,
                            }} />
                            <div style={{ fontSize: 13, color: '#71717a', lineHeight: 1.7, wordBreak: 'keep-all' }}>
                                인스타에서는 이렇게 동그랗게 보여요.<br />
                                아래는 원본 정사각형입니다.
                            </div>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result} alt="만든 프로필 사진" style={{ width: '100%', borderRadius: 16, border: '1px solid #e4e4e7' }} />
                        <a href={result} download="인스타_프로필_사진.png" style={{
                            display: 'block', marginTop: 12, padding: '14px', borderRadius: 14,
                            background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700, textAlign: 'center', textDecoration: 'none',
                        }}>사진 내려받기</a>
                    </div>
                )}
            </div>
        </main>
    )
}
