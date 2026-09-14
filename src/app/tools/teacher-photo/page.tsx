'use client'

// 강사 프로필 만들기 — 대표 확정 2026-09-15
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { TEACHER_MOODS, TEACHER_PLACES, TEACHER_COST } from '@/domains/studio/teacher'
import { AGES, DEFAULT_AGE_ID } from '@/domains/studio/photo'
import { RATIOS, DEFAULT_RATIO_ID } from '@/domains/studio/ratios'
import PhotoToolShell from '@/components/studio/PhotoToolShell'
import AppSidebar from '@/components/AppSidebar'

export default function TeacherPhotoPage() {
    const router = useRouter()
    const [preview, setPreview] = useState<string | null>(null)
    const [base64, setBase64] = useState<string | null>(null)
    const [mimeType, setMimeType] = useState('image/jpeg')
    const [moodId, setMoodId] = useState<string | null>(null)
    const [placeId, setPlaceId] = useState<string | null>(null)
    const [ageId, setAgeId] = useState(DEFAULT_AGE_ID)
    const [ratioId, setRatioId] = useState(DEFAULT_RATIO_ID)
    const [result, setResult] = useState<string | null>(null)
    const [미리보기, set미리보기] = useState(false)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [needCharge, setNeedCharge] = useState(false)

    const make = async () => {
        if (!base64 || !moodId || !placeId) return
        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        try {
            const res = await fetch('/api/tools/profile-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType, styleId: moodId, backdropId: placeId, ratioId, ageId, kind: 'teacher' }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '사진을 만들지 못했어요.')
            }
            set미리보기(!!data.preview)
            setResult(`data:image/${data.preview ? 'jpeg' : 'png'};base64,${data.imageBase64}`)
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '사진을 만들지 못했어요.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <PhotoToolShell
                title="강사 프로필 만들기"
                desc="강의 소개에 거는 사진을 만듭니다. 믿음직하면서도 말 걸기 편해 보이게요."
                samples={[
                    { src: '/samples/teach-w1.webp', label: '믿음직하게' },
                    { src: '/samples/teach-m1.webp', label: '편안하게' },
                    { src: '/samples/teach-w2.webp', label: '따뜻하게' },
                    { src: '/samples/teach-m2.webp', label: '전문가답게' },
                ]}
                preview={preview}
                onPicked={(dataUrl, mt) => {
                    setPreview(dataUrl); setBase64(dataUrl.split(',')[1] ?? null)
                    setMimeType(mt); setResult(null); setErrorMsg(null)
                }}
                onError={setErrorMsg}
                cost={TEACHER_COST}
                canMake={!!base64 && !!moodId && !!placeId}
                loading={loading}
                onMake={make}
                errorMsg={errorMsg}
                needCharge={needCharge}
                onCharge={() => router.push('/charge')}
                result={result}
                isPreviewResult={미리보기}
                onLogin={() => router.push('/login')}
                downloadName="강사_프로필.png"
            >
                <칸 제목="1. 어떤 선생으로 보이고 싶나요">
                    <그림칸 목록={TEACHER_MOODS} 고른={moodId} 고르기={setMoodId} />
                </칸>
                <칸 제목="2. 어디서 찍은 것처럼">
                    <그림칸 목록={TEACHER_PLACES} 고른={placeId} 고르기={setPlaceId} />
                </칸>
                <칸 제목="3. 나이">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {AGES.map(a => (
                            <button key={a.id} onClick={() => setAgeId(a.id)} style={고름(ageId === a.id)}>
                                <span style={{ fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{a.label}</span>
                            </button>
                        ))}
                    </div>
                </칸>
                <칸 제목="4. 사진 모양">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
                        {RATIOS.map(r => (
                            <button key={r.id} onClick={() => setRatioId(r.id)} style={고름(ratioId === r.id)}>
                                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{r.label}</span>
                                <span style={{ display: 'block', fontSize: 11.5, color: '#71717a', marginTop: 3, wordBreak: 'keep-all', lineHeight: 1.4 }}>{r.use}</span>
                            </button>
                        ))}
                    </div>
                </칸>
            </PhotoToolShell>
        </main>
    )
}

function 칸({ 제목, children }: { 제목: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>{제목}</div>
            {children}
        </div>
    )
}

function 그림칸({ 목록, 고른, 고르기 }: {
    목록: { id: string; label: string; swatch: string; bg?: string; sample?: string }[]
    고른: string | null
    고르기: (id: string) => void
}) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {목록.map(o => (
                <button key={o.id} onClick={() => 고르기(o.id)} style={고름(고른 === o.id)}>
                    {o.sample ? (
                        <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '3 / 4', borderRadius: 12, overflow: 'hidden', marginBottom: 8, background: '#f4f4f5' }}>
                            <Image src={o.sample} alt="" fill sizes="160px" style={{ objectFit: 'cover', objectPosition: 'center 18%' }} />
                        </span>
                    ) : (
                        <span style={{ display: 'block', width: '100%', height: 64, borderRadius: 12, background: o.bg || o.swatch, marginBottom: 8 }} />
                    )}
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{o.label}</span>
                </button>
            ))}
        </div>
    )
}

function 고름(on: boolean): React.CSSProperties {
    return {
        padding: 10, borderRadius: 14,
        border: on ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
        background: on ? '#f0fdf4' : '#fff',
        cursor: 'pointer', textAlign: 'center', width: '100%',
    }
}
