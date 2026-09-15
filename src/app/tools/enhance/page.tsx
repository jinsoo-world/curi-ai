'use client'

// 사진 화질 개선하기 — 대표 확정 2026-09-15
// 「화질 개선도 하나 넣자… 사용자가 마우스나 드래그 하면 되도록」 (remini.ai 참고)
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ENHANCE_MODES, ENHANCE_COST } from '@/domains/studio/enhance'
import { PhotoDrop } from '@/components/studio/PhotoDrop'
import BeforeAfter from '@/components/studio/BeforeAfter'
import MakingBar from '@/components/studio/MakingBar'
import CloverIcon from '@/components/ui/CloverIcon'
import AppSidebar from '@/components/AppSidebar'
import ToolHero from '@/components/studio/ToolHero'
import Image from 'next/image'
import KeepNotice from '@/components/studio/KeepNotice'
import ShareTool from '@/components/studio/ShareTool'
import AdSlot from '@/components/AdSlot'
import { 센다 } from '@/lib/track'
import { 브라우저표식 } from '@/lib/browser-mark'
import { useSticky } from '@/components/studio/useSticky'
import { HERO_PHOTO_KEY } from '@/components/studio/PhotoHero'
import { 클로버알림 } from '@/lib/clover-bus'

export default function EnhancePage() {
    const router = useRouter()
    const [preview, setPreview] = useState<string | null>(null)
    const [base64, setBase64] = useState<string | null>(null)
    const [mimeType, setMimeType] = useState('image/jpeg')
    const [modeId, setModeId] = useSticky<string | null>('enhance-mode', null)
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

    const make = async () => {
        if (!base64 || !modeId) return
        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        센다('photo_make_click', { tool: 'enhance' })
        try {
            const res = await fetch('/api/tools/enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType, modeId, 표식: 브라우저표식() }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '사진을 고치지 못했어요.')
            }
            set미리보기(!!data.preview)
            setResult(data.url ?? `data:image/${data.preview ? 'jpeg' : 'png'};base64,${data.imageBase64}`)
            if (data.claimToken) { try { sessionStorage.setItem('curi_claim', data.claimToken) } catch {} }
            if (typeof data.balance === 'number') 클로버알림(data.balance)
            센다(data.preview ? 'photo_login_prompt' : 'photo_make_success', { tool: 'enhance' })
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '사진을 고치지 못했어요.')
        } finally {
            setLoading(false)
        }
    }

    const 준비됨 = !!base64 && !!modeId

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div className="tool-page">


                <div>
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>1. 고칠 사진 올리기</div>
                        <PhotoDrop
                            preview={preview}
                            onPicked={(dataUrl, mt) => {
                                setPreview(dataUrl)
                                setBase64(dataUrl.split(',')[1] ?? null)
                                setMimeType(mt)
                                setResult(null)
                                setErrorMsg(null)
                            }}
                            onError={setErrorMsg}
                        />
                    </div>

                    {!preview && (
                <ToolHero
                            title="사진 화질 개선하기"
                            desc="흐릿하거나 오래된 사진을 살립니다. 같은 사진을 더 좋은 카메라로 찍은 것처럼요."
                            samples={[{ src: '/samples/act-m3.webp', label: '흐릿한 사진' }, { src: '/samples/act-w2.webp', label: '오래된 사진' }, { src: '/samples/act-m8.webp', label: '어두운 사진' }, { src: '/samples/act-w1.webp', label: '인쇄용으로' }]}
                        />
                    )}

                    <div style={{ opacity: base64 ? 1 : 0.4, pointerEvents: base64 ? 'auto' : 'none', marginBottom: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>2. 어떻게 고칠까요</div>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {ENHANCE_MODES.map(m => (
                                <button key={m.id} onClick={() => setModeId(m.id)} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                                    borderRadius: 14,
                                    border: modeId === m.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: modeId === m.id ? '#f0fdf4' : '#fff',
                                    cursor: 'pointer', textAlign: 'left',
                                }}>
                                    {m.sample && (
                                        <span style={{ position: 'relative', width: 56, height: 56, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: '#f4f4f5' }}>
                                            <Image src={m.sample} alt="" fill sizes="56px" style={{ objectFit: 'cover', objectPosition: 'center 20%' }} />
                                        </span>
                                    )}
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: '#18181b' }}>{m.label}</span>
                                        <span style={{ display: 'block', fontSize: 15, color: '#71717a', marginTop: 2, wordBreak: 'keep-all' }}>{m.desc}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div>
                    {errorMsg && (
                        <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 15, padding: '12px 16px', borderRadius: 12, marginBottom: 14, lineHeight: 1.6 }}>
                            {errorMsg}
                            {needCharge && (
                                <button onClick={() => router.push(`/charge?back=${encodeURIComponent(window.location.pathname)}`)} style={{
                                    display: 'block', marginTop: 10, background: '#dc2626', color: '#fff', border: 'none',
                                    borderRadius: 10, padding: '9px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                                }}>충전하러 가기</button>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <MakingBar 예상초={25} />
                    ) : (
                        <button onClick={make} disabled={!준비됨} style={{
                            width: '100%', padding: 16, borderRadius: 16, border: 'none',
                            background: !준비됨 ? '#d4d4d8' : '#22c55e',
                            color: '#fff', fontSize: 16, fontWeight: 700,
                            cursor: !준비됨 ? 'default' : 'pointer',
                        }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                사진 고치기 <CloverIcon size={17} color="#fff" /> {ENHANCE_COST}개
                            </span>
                        </button>
                    )}

                    {result && preview && (
                        <div style={{ marginTop: 26 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#18181b', marginBottom: 4 }}>다 됐어요</div>
                            <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 12px' }}>
                                가운데 손잡이를 좌우로 끌어보세요.
                            </p>
                            <BeforeAfter before={preview} after={result} ratio="1 / 1" />

                            {미리보기 ? (
                                <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, padding: '18px 18px 16px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>선명한 사진은 회원만 받을 수 있어요</div>
                                    <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6 }}>
                                        지금 보이는 건 미리보기라 흐릿해요. 로그인하면 원본을 바로 내려받습니다.
                                    </p>
                                    <button onClick={() => router.push('/login')} style={{
                                        width: '100%', padding: 14, borderRadius: 14, border: 'none',
                                        background: '#1C2321', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                    }}>로그인하고 원본 받기</button>
                                </div>
                            ) : (
                                <>
                                <a href={result} download="화질_개선_사진.png" style={{
                                    display: 'block', marginTop: 12, padding: 14, borderRadius: 14,
                                    background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700,
                                    textAlign: 'center', textDecoration: 'none',
                                }}>사진 내려받기</a>
                            <KeepNotice />
                                <ShareTool path="/tools/enhance" title="사진 화질 개선하기" description="흐릿하고 오래된 사진을 또렷하게 되살립니다." image="/og/enhance.png" />
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* 광고(애드센스) — 무료 화면에만, 본문 끝난 뒤 */}
                <AdSlot />
            </div>
        </main>
    )
}
