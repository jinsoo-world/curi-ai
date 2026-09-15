'use client'

// 강사 프로필 만들기 — 대표 확정 2026-09-15
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { TEACHER_MOODS, TEACHER_PLACES, TEACHER_COST } from '@/domains/studio/teacher'
import { AGES, DEFAULT_AGE_ID } from '@/domains/studio/photo'
import { RATIOS, DEFAULT_RATIO_ID } from '@/domains/studio/ratios'
import PhotoToolShell from '@/components/studio/PhotoToolShell'
import AppSidebar from '@/components/AppSidebar'
import AdSlot from '@/components/AdSlot'
import { 센다 } from '@/lib/track'
import { 브라우저표식 } from '@/lib/browser-mark'
import { useSticky } from '@/components/studio/useSticky'
import { HERO_PHOTO_KEY } from '@/components/studio/PhotoHero'
import { HAIRS, DEFAULT_HAIR } from '@/domains/studio/hair'
import { 클로버알림, 클로버썼다, 클로버되돌림 } from '@/lib/clover-bus'

function TeacherPhotoPage안쪽() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [preview, setPreview] = useState<string | null>(null)
    const [base64, setBase64] = useState<string | null>(null)
    const [mimeType, setMimeType] = useState('image/jpeg')
    const [moodId, setMoodId] = useSticky<string | null>('teach-mood', null)
    const [placeId, setPlaceId] = useSticky<string | null>('teach-place', null)
    const [ageId, setAgeId] = useSticky<string>('age', DEFAULT_AGE_ID)
    const [ratioId, setRatioId] = useSticky<string>('teach-ratio', DEFAULT_RATIO_ID)
    const [성별, set성별] = useSticky<string>('gender', 'male')
    const [hairId, setHairId] = useSticky<string>('hair', DEFAULT_HAIR)
    const [result, setResult] = useState<string | null>(null)
    const [미리보기, set미리보기] = useState(false)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [needCharge, setNeedCharge] = useState(false)

    // 첫 화면에서 사진을 이미 올렸으면 그대로 받아 온다 — 다시 올리게 하지 않는다
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(HERO_PHOTO_KEY)
            if (!raw) return
            sessionStorage.removeItem(HERO_PHOTO_KEY)
            const { dataUrl, mimeType: mt } = JSON.parse(raw) as { dataUrl: string; mimeType: string }
            if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return
            setPreview(dataUrl)
            setBase64(dataUrl.split(',')[1] ?? null)
            setMimeType(mt || 'image/jpeg')
        } catch {
            // 저장소를 못 읽는 브라우저면 그냥 새로 올리게 둔다
        }
    }, [])

    // 쇼케이스에서 고르고 온 것을 미리 골라둔다 (대표 지적 0915 「저 버튼 누르면」)
    useEffect(() => {
        const m = searchParams?.get('mood')
        if (m && TEACHER_MOODS.some(x => x.id === m)) setMoodId(m)
        const p = searchParams?.get('bg')
        if (p && TEACHER_PLACES.some(x => x.id === p)) setPlaceId(p)
    }, [searchParams])

    const make = async () => {
        if (!base64 || !moodId || !placeId) return
        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        센다('photo_make_click', { tool: 'teacher-photo' })
        // 누른 순간 위 띠에서 먼저 뺀다 — 대표 지적 2026-09-15 「만들기 누르면 애니메이션 효과로 차감되어야지」
        const 낸값 = TEACHER_COST
        클로버썼다(낸값)
        try {
            const res = await fetch('/api/tools/profile-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType, styleId: moodId, backdropId: placeId, ratioId, ageId, kind: 'teacher', hairId, gender: 성별, 표식: 브라우저표식() }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.')
            }
            set미리보기(!!data.preview)
            setResult(data.url ?? `data:image/${data.preview ? 'jpeg' : 'png'};base64,${data.imageBase64}`)
            if (data.claimToken) { try { sessionStorage.setItem('curi_claim', data.claimToken) } catch {} }
            if (typeof data.balance === 'number') 클로버알림(data.balance)
            센다(data.preview ? 'photo_login_prompt' : 'photo_make_success', { tool: 'teacher-photo' })
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.')
            센다('photo_make_fail', { tool: 'teacher-photo' })
            클로버되돌림(낸값)  // 서버가 되돌려준다. 화면도 같이
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
                    { src: '/samples/teach-w1.webp', label: '믿음직하게', pick: () => { setMoodId('trust'); setPlaceId('bright') } },
                    { src: '/samples/teach-m1.webp', label: '편안하게', pick: () => { setMoodId('easy'); setPlaceId('room') } },
                    { src: '/samples/teach-w2.webp', label: '따뜻하게', pick: () => { setMoodId('warm'); setPlaceId('pastel') } },
                    { src: '/samples/teach-m2.webp', label: '전문가답게', pick: () => { setMoodId('expert'); setPlaceId('study') } },
                    { src: '/samples/teach-m3.webp', label: '편안하게', pick: () => { setMoodId('easy'); setPlaceId('bright') } },
                    { src: '/samples/teach-w3.webp', label: '따뜻하게', pick: () => { setMoodId('warm'); setPlaceId('pastel') } },
                    { src: '/samples/teach-m4.webp', label: '믿음직하게', pick: () => { setMoodId('trust'); setPlaceId('room') } },
                    { src: '/samples/teach-w4.webp', label: '전문가답게', pick: () => { setMoodId('expert'); setPlaceId('bright') } },
                ]}
                share={{ path: "/tools/teacher-photo", title: "강사 프로필 만들기", description: "사진 한 장만 올리면 얼굴은 그대로 두고 옷과 배경만 바꿔 드려요.", image: "/og/teacher-photo.png" }}
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
                onCharge={() => router.push(`/charge?back=${encodeURIComponent(window.location.pathname)}`)}
                result={result}
                isPreviewResult={미리보기}
                onLogin={() => router.push('/login')}
                downloadName="강사_프로필.png"
            >
                <칸 제목="1. 남성 여성">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                        {[{ id: 'male', label: '남성' }, { id: 'female', label: '여성' }].map(g => (
                            <button key={g.id} onClick={() => set성별(g.id)} style={{ ...고름(성별 === g.id), textAlign: 'center' }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: '#18181b' }}>{g.label}</span>
                            </button>
                        ))}
                    </div>
                </칸>

                <칸 제목="2. 어떤 이미지로 보이고 싶나요">
                    <그림칸 목록={TEACHER_MOODS} 고른={moodId} 고르기={setMoodId} 남성={성별 === 'male'} />
                </칸>
                <칸 제목="3. 어디서 찍은 것처럼">
                    <그림칸 목록={TEACHER_PLACES} 고른={placeId} 고르기={setPlaceId} />
                </칸>
                <칸 제목="4. 머리 모양">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                        {HAIRS.map(h => (
                            <button key={h.id} onClick={() => setHairId(h.id)} style={고름(hairId === h.id)}>
                                <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: '#18181b' }}>{h.label}</span>
                                <span style={{ display: 'block', fontSize: 13, color: '#71717a', marginTop: 2, wordBreak: 'keep-all' }}>{h.desc}</span>
                            </button>
                        ))}
                    </div>
                </칸>

                <칸 제목="5. 나이">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {AGES.map(a => (
                            <button key={a.id} onClick={() => setAgeId(a.id)} style={고름(ageId === a.id)}>
                                <span style={{ fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{a.label}</span>
                            </button>
                        ))}
                    </div>
                </칸>
                <칸 제목="6. 사진 모양">
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

            {/* 광고(애드센스) — 무료 화면에만, 본문 끝난 뒤 */}
            <AdSlot />
        </main>
    )
}

function 칸({ 제목, children }: { 제목: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>{제목}</div>
            {children}
        </div>
    )
}

function 그림칸({ 목록, 고른, 고르기, 남성 }: {
    목록: { id: string; label: string; swatch: string; bg?: string; sample?: string; sampleMale?: string }[]
    고른: string | null
    고르기: (id: string) => void
    /** 남성이면 남성 견본을 보여준다 — 대표 지적 0915 「남잔데 왜 여자가 있냐」 */
    남성?: boolean
}) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {목록.map(o => (
                <button key={o.id} onClick={() => 고르기(o.id)} style={고름(고른 === o.id)}>
                    {(남성 && o.sampleMale) || o.sample ? (
                        <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '3 / 4', borderRadius: 12, overflow: 'hidden', marginBottom: 8, background: '#f4f4f5' }}>
                            <Image src={((남성 && o.sampleMale) || o.sample)!} alt="" fill sizes="160px" style={{ objectFit: 'cover', objectPosition: 'center 22%' }} />
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

/**
 * 주소에 붙은 값(?mood=…)을 읽으려면 useSearchParams 가 필요하고,
 * 그건 Suspense 안에 있어야 한다(없으면 빌드가 이 화면에서 멈춘다).
 */
export default function Page() {
    return (
        <Suspense fallback={null}>
            <TeacherPhotoPage안쪽 />
        </Suspense>
    )
}
