'use client'

// 증명사진 만들기 — 대표 확정 2026-09-15
// 「사진 넣는 곳은 페이지 접속하면 바로 있게」 → PhotoToolShell 이 그 차례를 맡는다.
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ID_BACKGROUNDS, ID_OUTFITS, ID_SIZES, ID_COST } from '@/domains/studio/idphoto'
import { AGES, DEFAULT_AGE_ID } from '@/domains/studio/photo'
import PhotoToolShell from '@/components/studio/PhotoToolShell'
import AppSidebar from '@/components/AppSidebar'
import AdSlot from '@/components/AdSlot'

function IdPhotoPage안쪽() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [preview, setPreview] = useState<string | null>(null)
    const [base64, setBase64] = useState<string | null>(null)
    const [mimeType, setMimeType] = useState('image/jpeg')
    const [sizeId, setSizeId] = useState(ID_SIZES[0].id)
    const [backgroundId, setBackgroundId] = useState(ID_BACKGROUNDS[0].id)
    const [outfitId, setOutfitId] = useState(ID_OUTFITS[0].id)
    const [ageId, setAgeId] = useState(DEFAULT_AGE_ID)
    const [result, setResult] = useState<string | null>(null)
    const [미리보기, set미리보기] = useState(false)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [needCharge, setNeedCharge] = useState(false)

    // 쇼케이스에서 고르고 온 것을 미리 골라둔다
    useEffect(() => {
        const b = searchParams?.get('bg')
        if (b && ID_BACKGROUNDS.some(x => x.id === b)) setBackgroundId(b)
        const o = searchParams?.get('outfit')
        if (o && ID_OUTFITS.some(x => x.id === o)) setOutfitId(o)
        const z = searchParams?.get('size')
        if (z && ID_SIZES.some(x => x.id === z)) setSizeId(z)
    }, [searchParams])

    const make = async () => {
        if (!base64) return
        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        try {
            const res = await fetch('/api/tools/id-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType, backgroundId, outfitId, sizeId, ageId }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.')
            }
            set미리보기(!!data.preview)
            setResult(`data:image/${data.preview ? 'jpeg' : 'png'};base64,${data.imageBase64}`)
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <PhotoToolShell
                title="증명사진 만들기"
                desc="여권·이력서·주민등록에 내는 규격 사진을 만듭니다. 정면·무표정·그림자 없는 배경까지 규격에 맞춰드려요."
                samples={[
                    { src: '/samples/id-m1.webp', label: '흰 배경·정장', pick: () => { setBackgroundId('white'); setOutfitId('suit') } },
                    { src: '/samples/id-w1.webp', label: '흰 배경·재킷', pick: () => { setBackgroundId('white'); setOutfitId('jacket') } },
                    { src: '/samples/id-m2.webp', label: '회색 배경·정장', pick: () => { setBackgroundId('lightgrey'); setOutfitId('suit') } },
                    { src: '/samples/id-w2.webp', label: '회색 배경·재킷', pick: () => { setBackgroundId('lightgrey'); setOutfitId('jacket') } },
                    { src: '/samples/id-m3.webp', label: '흰 배경·재킷', pick: () => { setBackgroundId('white'); setOutfitId('jacket') } },
                    { src: '/samples/id-w3.webp', label: '흰 배경·셔츠', pick: () => { setBackgroundId('white'); setOutfitId('shirt') } },
                    { src: '/samples/id-m4.webp', label: '회색 배경·정장', pick: () => { setBackgroundId('lightgrey'); setOutfitId('suit') } },
                    { src: '/samples/id-w4.webp', label: '회색 배경·셔츠', pick: () => { setBackgroundId('lightgrey'); setOutfitId('shirt') } },
                ]}
                share={{ path: "/tools/id-photo", title: "증명사진 만들기", description: "여권·이력서에 내는 규격 사진을 사진 한 장으로 만듭니다.", image: "/og/profile-photo.png" }}
                preview={preview}
                onPicked={(dataUrl, mt) => {
                    setPreview(dataUrl)
                    setBase64(dataUrl.split(',')[1] ?? null)
                    setMimeType(mt)
                    setResult(null)
                    setErrorMsg(null)
                }}
                onError={setErrorMsg}
                cost={ID_COST}
                canMake={!!base64}
                loading={loading}
                onMake={make}
                errorMsg={errorMsg}
                needCharge={needCharge}
                onCharge={() => router.push('/charge')}
                result={result}
                isPreviewResult={미리보기}
                onLogin={() => router.push('/login')}
                downloadName="증명사진.png"
            >
                <칸 제목="1. 규격">
                    <div style={{ display: 'grid', gap: 8 }}>
                        {ID_SIZES.map(s => (
                            <button key={s.id} onClick={() => setSizeId(s.id)} style={고름(sizeId === s.id, true)}>
                                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: '#18181b' }}>{s.label}</span>
                                <span style={{ display: 'block', fontSize: 13.5, color: '#71717a', marginTop: 2, wordBreak: 'keep-all' }}>{s.use}</span>
                            </button>
                        ))}
                    </div>
                </칸>

                <칸 제목="2. 배경">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                        {ID_BACKGROUNDS.map(b => (
                            <button key={b.id} onClick={() => setBackgroundId(b.id)} style={고름(backgroundId === b.id)}>
                                <span style={{
                                    display: 'block', width: '100%', height: 46, borderRadius: 10,
                                    background: b.swatch, border: '1px solid #e4e4e7', marginBottom: 8,
                                }} />
                                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{b.label}</span>
                                {b.desc && <span style={{ display: 'block', fontSize: 12, color: '#71717a', marginTop: 2 }}>{b.desc}</span>}
                            </button>
                        ))}
                    </div>
                </칸>

                <칸 제목="3. 차림새">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                        {ID_OUTFITS.map(o => (
                            <button key={o.id} onClick={() => setOutfitId(o.id)} style={고름(outfitId === o.id)}>
                                {o.sample ? (
                                    <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '4 / 5', borderRadius: 10, overflow: 'hidden', marginBottom: 8, background: '#f4f4f5' }}>
                                        <Image src={o.sample} alt="" fill sizes="130px" style={{ objectFit: 'cover', objectPosition: 'center 26%' }} />
                                    </span>
                                ) : (
                                    <span style={{ display: 'block', width: '100%', height: 46, borderRadius: 10, background: o.swatch, marginBottom: 8 }} />
                                )}
                                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{o.label}</span>
                            </button>
                        ))}
                    </div>
                </칸>

                <칸 제목="4. 나이">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {AGES.map(a => (
                            <button key={a.id} onClick={() => setAgeId(a.id)} style={{ ...고름(ageId === a.id), textAlign: 'center' }}>
                                <span style={{ fontSize: 14.5, fontWeight: 800, color: '#18181b' }}>{a.label}</span>
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

function 고름(on: boolean, 왼쪽 = false): React.CSSProperties {
    return {
        padding: 12, borderRadius: 14,
        border: on ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
        background: on ? '#f0fdf4' : '#fff',
        cursor: 'pointer', textAlign: 왼쪽 ? 'left' : 'center', width: '100%',
    }
}

/**
 * 주소에 붙은 값(?mood=…)을 읽으려면 useSearchParams 가 필요하고,
 * 그건 Suspense 안에 있어야 한다(없으면 빌드가 이 화면에서 멈춘다).
 */
export default function Page() {
    return (
        <Suspense fallback={null}>
            <IdPhotoPage안쪽 />
        </Suspense>
    )
}
