'use client'

// 배우 프로필 사진 만들기 — 대표 확정 2026-09-15
// 재취업용과 고르는 것이 다르다. 옷·배경이 아니라 「어떤 역할이 보이는가」를 고른다.
// 참고 = jactors.kr · plfil.com
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AGES, DEFAULT_AGE_ID } from '@/domains/studio/photo'
import { ACTOR_MOODS, ACTOR_BACKDROPS } from '@/domains/studio/actor'
import { CURI_MODELS, DEFAULT_MODEL_ID, getModel } from '@/domains/studio/models'
import { RATIOS, DEFAULT_RATIO_ID } from '@/domains/studio/ratios'
import { PickCard } from '@/components/studio/PickCard'
import { PhotoDrop } from '@/components/studio/PhotoDrop'
import AppSidebar from '@/components/AppSidebar'
import ToolHero from '@/components/studio/ToolHero'
import MakingBar from '@/components/studio/MakingBar'
import CloverIcon from '@/components/ui/CloverIcon'
import Image from 'next/image'
import Link from 'next/link'
import { HERO_PHOTO_KEY } from '@/components/studio/PhotoHero'
import { useStickyPhoto } from '@/components/studio/useStickyPhoto'
import KeepNotice from '@/components/studio/KeepNotice'
import ShareTool from '@/components/studio/ShareTool'
import AdSlot from '@/components/AdSlot'
import { 센다 } from '@/lib/track'
import { useGuest } from '@/components/studio/useGuest'
import { useClover } from '@/components/studio/useClover'
import { GUEST_CLOVERS, SIGNUP_CLOVERS } from '@/domains/trial'
import { 브라우저표식 } from '@/lib/browser-mark'
import { useSticky } from '@/components/studio/useSticky'
import { HAIRS, DEFAULT_HAIR } from '@/domains/studio/hair'
import { SKINS, DEFAULT_SKIN } from '@/domains/studio/skin'
import { 클로버알림, 클로버썼다, 클로버되돌림, 지금클로버 } from '@/lib/clover-bus'
import { 옵션기억, 요약만들기 } from '@/lib/photo-opts'

function ActorPhotoPage안쪽() {
    const router = useRouter()
    const searchParams = useSearchParams()
    // 올린 사진도 기억한다 — 파파님 피드백 2026-09-16
    // 충전하러 갔다 오면 사진이 날아가 처음부터 다시 올려야 했다
    const [보관사진, set보관사진] = useStickyPhoto('actor')
    const preview = 보관사진?.dataUrl ?? null
    const base64 = 보관사진 ? (보관사진.dataUrl.split(',')[1] ?? null) : null
    const mimeType = 보관사진?.mimeType ?? 'image/jpeg'
    const [modelId, setModelId] = useState(DEFAULT_MODEL_ID)
    const [ratioId, setRatioId] = useSticky<string>('actor-ratio', DEFAULT_RATIO_ID)
    const [ageId, setAgeId] = useSticky<string>('age', DEFAULT_AGE_ID)
    const [styleId, setStyleId] = useSticky<string | null>('actor-style', null)
    const [backdropId, setBackdropId] = useSticky<string | null>('actor-bg', null)
    // 대표 지적 2026-09-15 「성별 고르기도 넣고 머리 지시문도 넣어」
    const [성별, set성별] = useSticky<string>('gender', 'male')
    const [hairId, setHairId] = useSticky<string>('hair', DEFAULT_HAIR)
    // 피부 손보기 — 파파님 피드백 2026-09-16
    const [skinId, setSkinId] = useSticky<string>('skin', DEFAULT_SKIN)
    const [result, setResult] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [needCharge, setNeedCharge] = useState(false)
    const 있는클로버 = useClover()
    const [미리보기, set미리보기] = useState(false)   // 손님에게 준 흐린 그림인가

    // 첫 화면에서 사진을 이미 올렸으면 그대로 받아 온다 (대표 지시 0914 「이게 메인으로」)
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(HERO_PHOTO_KEY)
            if (!raw) return
            sessionStorage.removeItem(HERO_PHOTO_KEY)
            const { dataUrl, mimeType: mt } = JSON.parse(raw) as { dataUrl: string; mimeType: string }
            if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return
            set보관사진({ dataUrl, mimeType: mt || 'image/jpeg' })
        } catch {
            // 저장소를 못 읽는 브라우저면 그냥 새로 올리게 둔다
        }
    }, [])

    // 쇼케이스에서 고르고 온 것을 미리 골라둔다
    useEffect(() => {
        const m = searchParams?.get('mood')
        if (m && ACTOR_MOODS.some(x => x.id === m)) setStyleId(m)
        const b = searchParams?.get('bg')
        if (b && ACTOR_BACKDROPS.some(x => x.id === b)) setBackdropId(b)
    }, [searchParams])

    const make = async () => {
        if (!base64 || !styleId || !backdropId) return
        // 클로버가 모자라면 서버까지 가지 않는다 — 2026-09-15 손님으로 끝까지 돌려보다 찾았다.
        // 서버에 갔다 거절당하면 그 사이 애써 만든 사진이 화면에서 지워진다.
        const 있는값 = 지금클로버()
        if (있는값 !== null && 있는값 < getModel(modelId)!.cost) { setNeedCharge(true); return }

        setLoading(true); setErrorMsg(null); setNeedCharge(false); setResult(null)
        센다('photo_make_click', { tool: 'actor-photo' })
        // 누른 순간 위 띠에서 먼저 뺀다 — 대표 지적 2026-09-15 「만들기 누르면 애니메이션 효과로 차감되어야지」
        const 낸값 = getModel(modelId)!.cost
        클로버썼다(낸값)
        try {
            const res = await fetch('/api/tools/profile-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64, mimeType, styleId, backdropId, modelId, ratioId, ageId, kind: 'actor', hairId, skinId, gender: 성별, 표식: 브라우저표식() }),
            })
            const data = await res.json()
            if (!res.ok) {
                if (data.needCharge) setNeedCharge(true)
                throw new Error(data.error || '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.')
            }
            set미리보기(!!data.preview)
            setResult(data.url ?? `data:image/${data.preview ? 'jpeg' : 'png'};base64,${data.imageBase64}`)
            옵션기억(data.url, 요약만들기(
                ACTOR_MOODS.find(x => x.id === styleId)?.label,
                ACTOR_BACKDROPS.find(x => x.id === backdropId)?.label,
            ))
            if (data.claimToken) { try { sessionStorage.setItem('curi_claim', data.claimToken) } catch {} }
            if (typeof data.balance === 'number') 클로버알림(data.balance)
            센다(data.preview ? 'photo_login_prompt' : 'photo_make_success', { tool: 'actor-photo' })
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.')
            센다('photo_make_fail', { tool: 'actor-photo' })
            클로버되돌림(낸값)  // 서버가 되돌려준다. 화면도 같이
        } finally {
            setLoading(false)
        }
    }

    const 준비됨 = !!base64 && !!styleId && !!backdropId
    // 무엇이 빠졌는지 이름으로 알려준다 — 파파님 피드백 2026-09-16
    // 「1~6번 중 체크가 안 된 항목이 있다면 몇 번이 미체크인지 안내되면 좋겠습니다」
    const 빠진것 = [
        !base64 && '1. 내 사진 올리기',
        !styleId && '4. 어떤 느낌으로',
        !backdropId && '5. 스튜디오 바탕',
    ].filter(Boolean) as string[]


    const { 손님 } = useGuest()
    const 모자람 = needCharge || (있는클로버 !== null && 있는클로버 < getModel(modelId)!.cost)

    return (
        <main style={{ minHeight: '100dvh', background: '#fafafa' }}>
            <AppSidebar />
            <div className="tool-page">
                <ToolHero
                    title="배우 프로필 사진 만들기"
                    desc="캐스팅에 내는 프로필 사진을 만듭니다. 실물과 달라 보이지 않게, 사진관에서 찍은 것처럼요."
                    samples={[
                        { src: '/samples/act-m1.webp', label: '단단한 인물', pick: () => { setStyleId('strong'); setBackdropId('dark') } },
                        { src: '/samples/act-w1.webp', label: '기품 있는', pick: () => { setStyleId('elegant'); setBackdropId('dark') } },
                        { src: '/samples/act-m3.webp', label: '창가 빛', pick: () => { setStyleId('warm'); setBackdropId('window') } },
                        { src: '/samples/act-w5.webp', label: '따뜻한 어른', pick: () => { setStyleId('warm'); setBackdropId('white') } },
                        { src: '/samples/act-m7.webp', label: '기품 있는', pick: () => { setStyleId('elegant'); setBackdropId('grey') } },
                        { src: '/samples/act-w7.webp', label: '검은 배경', pick: () => { setStyleId('strong'); setBackdropId('dark') } },
                        { src: '/samples/act-m5.webp', label: '밝고 친근한', pick: () => { setStyleId('bright'); setBackdropId('white') } },
                        { src: '/samples/act-w3.webp', label: '밝고 친근한', pick: () => { setStyleId('bright'); setBackdropId('grey') } },
                    ]}
                />

                {/* 만들기 전에도 공유할 수 있게 — 대표 지적 2026-09-15 「여기 왜 카톡공유 없냐?」 */}
                {!result && <ShareTool path="/tools/actor-photo" title="배우 프로필 사진 만들기" description="캐스팅에 내는 프로필 사진을 사진 한 장으로 만듭니다." image="/og/actor-photo.png" />}

                {/* 1단계 사진 */}
                <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>1. 내 사진 올리기</div>
                    <PhotoDrop
                        preview={preview}
                        onPicked={(dataUrl, mt) => {
                            set보관사진({ dataUrl, mimeType: mt })
                            setErrorMsg(null)
                        }}
                        onError={setErrorMsg}
                    />
                </div>

                {/* 2·3단계 — 사진을 올려야 열린다 */}
                <div style={{ opacity: base64 ? 1 : 0.4, pointerEvents: base64 ? 'auto' : 'none' }}>
                    {/* 모델 고르기 — 우리 이름으로 판다 */}
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>2. 어떤 모델로 만들까요</div>
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
                                        }}>
                                            {m.logo ? (
                                                <Image src={m.logo} alt="" width={26} height={26} style={{ borderRadius: 7 }} />
                                            ) : m.label.slice(0, 1)}
                                        </span>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: 15, fontWeight: 700, color: '#18181b' }}>{m.label}</span>
                                            <span style={{
                                                marginLeft: 6, fontSize: 11, fontWeight: 700,
                                                color: 못씀 ? '#71717a' : '#166534',
                                                background: 못씀 ? '#f4f4f5' : '#dcfce7',
                                                padding: '2px 7px', borderRadius: 7,
                                            }}>{m.badge}</span>
                                            <span style={{ display: 'block', fontSize: 13.5, color: '#71717a', marginTop: 3, wordBreak: 'keep-all' }}>
                                                {m.comingSoon || m.desc}
                                            </span>
                                        </span>
                                        {!못씀 && (
                                            <span style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', flexShrink: 0 }}><CloverIcon size={13} color="#3f3f46" /> {m.cost}개</span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* 성별 — 대표 지적 2026-09-15 「남잔데 왜 여자가 있냐」 */}
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>3. 남성 여성</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                            {[{ id: 'male', label: '남성' }, { id: 'female', label: '여성' }].map(g => (
                                <button key={g.id} onClick={() => set성별(g.id)} style={{
                                    padding: '14px 8px', borderRadius: 14,
                                    border: 성별 === g.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: 성별 === g.id ? '#f0fdf4' : '#fff', cursor: 'pointer',
                                    fontSize: 16, fontWeight: 800, color: '#18181b',
                                }}>{g.label}</button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>4. 어떤 느낌으로</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                            {ACTOR_MOODS.map(o => (
                                <PickCard key={o.id} option={o} selected={styleId === o.id} onSelect={setStyleId} kind="outfit" />
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>5. 스튜디오 바탕</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                            {ACTOR_BACKDROPS.map(o => (
                                <PickCard key={o.id} option={o} selected={backdropId === o.id} onSelect={setBackdropId} kind="backdrop" />
                            ))}
                        </div>
                    </div>

                    {/* 머리 — 대표 지적 2026-09-15 「머리를 왜 까는거야」 「옵션으로 하게 해」 */}
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>6. 머리 모양</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                            {HAIRS.map(h => (
                                <button key={h.id} onClick={() => setHairId(h.id)} style={{
                                    padding: '12px 10px', borderRadius: 14, textAlign: 'left',
                                    border: hairId === h.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: hairId === h.id ? '#f0fdf4' : '#fff', cursor: 'pointer',
                                }}>
                                    <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: '#18181b' }}>{h.label}</span>
                                    <span style={{ display: 'block', fontSize: 13, color: '#71717a', marginTop: 2, wordBreak: 'keep-all' }}>{h.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* 나이 — 대표 지시 0914 「나이도 조정할 수 있도록」 「-10살까지」 */}
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>7. 나이</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {AGES.map(a => (
                                <button key={a.id} onClick={() => setAgeId(a.id)} style={{
                                    padding: '14px 8px', borderRadius: 14,
                                    border: ageId === a.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: ageId === a.id ? '#f0fdf4' : '#fff', cursor: 'pointer',
                                    fontSize: 15, fontWeight: 700, color: '#18181b',
                                }}>
                                    <span style={{ display: 'block' }}>{a.label}</span>
                                    {/* 많이 젊게 할수록 얼굴이 달라진다 — 파파님 피드백 2026-09-16 */}
                                    {a.note && (
                                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: a.id === 'm10' ? '#b45309' : '#71717a', marginTop: 3, wordBreak: 'keep-all' }}>
                                            {a.note}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <p style={{ fontSize: 13.5, color: '#71717a', marginTop: 8, lineHeight: 1.5 }}>
                            얼굴은 그대로 두고 피부와 머리숱만 손봐요. 너무 티 나지 않게요.
                        </p>
                    </div>

                    {/* 피부 — 파파님 피드백 2026-09-16 「피부 보정 기능도 있으면 좋겠습니다」 */}
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>8. 피부</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {SKINS.map(k => (
                                <button key={k.id} onClick={() => setSkinId(k.id)} style={{
                                    padding: '14px 8px', borderRadius: 14,
                                    border: skinId === k.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: skinId === k.id ? '#f0fdf4' : '#fff', cursor: 'pointer',
                                }}>
                                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#18181b' }}>{k.label}</span>
                                    <span style={{ display: 'block', fontSize: 12.5, color: '#71717a', marginTop: 3, wordBreak: 'keep-all', lineHeight: 1.4 }}>{k.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 비율 — 어디에 쓸 사진인지에 따라 다르다 */}
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 8 }}>9. 사진 모양</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
                            {RATIOS.map(r => (
                                <button key={r.id} onClick={() => setRatioId(r.id)} style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                                    padding: '14px 8px', borderRadius: 14,
                                    border: ratioId === r.id ? '2.5px solid #22c55e' : '1.5px solid #e4e4e7',
                                    background: ratioId === r.id ? '#f0fdf4' : '#fff', cursor: 'pointer',
                                }}>
                                    <span style={{
                                        width: r.w / r.h >= 1 ? 34 : 34 * (r.w / r.h),
                                        height: r.w / r.h >= 1 ? 34 / (r.w / r.h) : 34,
                                        background: ratioId === r.id ? '#22c55e' : '#d4d4d8',
                                        borderRadius: 4, display: 'block',
                                    }} />
                                    <span style={{ fontSize: 15, fontWeight: 700, color: '#18181b' }}>{r.label}</span>
                                    <span style={{ fontSize: 11, color: '#71717a', textAlign: 'center', wordBreak: 'keep-all', lineHeight: 1.4 }}>{r.use}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {errorMsg && !모자람 && (
                    <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 15, padding: '12px 16px', borderRadius: 12, marginBottom: 14, lineHeight: 1.6 }}>
                        {errorMsg}
                    </div>
                )}

                {/* 클로버가 모자랄 때 — 손님에게 「충전하러 가기」는 막다른 길이다. 2026-09-15 */}
                {모자람 && (
                    <div style={{ background: '#fff', border: '1.5px solid #e4e4e7', borderRadius: 14, padding: '16px 18px', marginBottom: 14, textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
                            {손님 ? '오늘 몫을 다 쓰셨어요' : '클로버가 모자라요'}
                        </div>
                        <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            {손님
                                ? `로그인하시면 클로버 ${SIGNUP_CLOVERS}개를 바로 드려요. 만드신 사진도 그대로 받으실 수 있습니다.`
                                : '클로버를 채우시면 바로 이어서 만드실 수 있어요.'}
                        </p>
                        <button onClick={() => (손님 ? router.push('/login') : router.push(`/charge?back=${encodeURIComponent(window.location.pathname)}`))} style={{
                            width: '100%', padding: 14, borderRadius: 14, border: 'none',
                            background: '#1C2321', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                        }}>
                            {손님 ? `로그인하고 클로버 ${SIGNUP_CLOVERS}개 받기` : '클로버 충전하기'}
                        </button>
                    </div>
                )}

                {!loading && !모자람 && 빠진것.length > 0 && (
                    <div style={{
                        background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14,
                        padding: '14px 16px', marginBottom: 12,
                    }}>
                        <div style={{ fontSize: 15.5, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
                            {빠진것.length}가지만 더 고르시면 됩니다
                        </div>
                        <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'grid', gap: 4 }}>
                            {빠진것.map(이름 => (
                                <li key={이름} style={{ fontSize: 15, color: '#78350f', lineHeight: 1.6, wordBreak: 'keep-all' }}>{이름}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {loading ? (
                    <MakingBar />
                ) : (
                    <button onClick={make} disabled={!준비됨 || 모자람} style={{
                        width: '100%', padding: '16px', borderRadius: 16, border: 'none',
                        background: (!준비됨 || 모자람) ? '#d4d4d8' : '#22c55e',
                        color: '#fff', fontSize: 16, fontWeight: 700,
                        cursor: (!준비됨 || 모자람) ? 'default' : 'pointer',
                    }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {모자람
                                ? '클로버가 모자라요'
                                : 빠진것.length > 0
                                    ? `${빠진것.length}가지를 더 고르시면 만들 수 있어요`
                                    : <>사진 만들기 <CloverIcon size={17} color="#fff" /> {getModel(modelId)!.cost}개</>}
                        </span>
                    </button>
                )}

                {!loading && 손님 && (
                    <p style={{ fontSize: 15, color: '#71717a', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                        가입 안 하셔도 클로버 {GUEST_CLOVERS}개로 한 장 만들어 보실 수 있어요.{' '}
                        <Link href="/login" style={{ color: 'var(--진초록)', fontWeight: 800, textDecoration: 'underline' }}>로그인하시면 {SIGNUP_CLOVERS}개를 더 드립니다.</Link>
                    </p>
                )}

                {/* 결과 */}
                {result && (
                    <div style={{ marginTop: 26 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#18181b', marginBottom: 10 }}>완성됐어요</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result} alt="만든 프로필 사진" style={{ width: '100%', borderRadius: 16, border: '1px solid #e4e4e7' }} />
                        {미리보기 ? (
                            <div style={{
                                marginTop: 12, background: '#fff', border: '1px solid #e4e4e7',
                                borderRadius: 14, padding: '18px 18px 16px', textAlign: 'center',
                            }}>
                                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
                                    선명한 사진은 회원만 받을 수 있어요
                                </div>
                                <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6 }}>
                                    지금 보이는 건 미리보기라 흐릿해요. 로그인하면 원본을 바로 내려받습니다.
                                </p>
                                <button onClick={() => router.push('/login')} style={{
                                    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                                    background: '#1C2321', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                }}>로그인하고 원본 받기</button>
                            </div>
                        ) : (
                            <>
                            <a href={result} download="배우_프로필_사진.png" style={{
                                display: 'block', marginTop: 12, padding: '14px', borderRadius: 14,
                                background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700,
                                textAlign: 'center', textDecoration: 'none',
                            }}>사진 내려받기</a>
                            <KeepNotice />
                                <ShareTool path="/tools/actor-photo" title="배우 프로필 사진 만들기" description="캐스팅에 내는 프로필 사진을 사진 한 장으로 만듭니다." image="/og/actor-photo.png" />
                            </>
                        )}
                    </div>
                )}

                {/* 어떻게 되나 */}
                <div style={{ marginTop: 30, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16, padding: '18px 20px' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#3f3f46', marginBottom: 10 }}>어떻게 되나요</div>
                    {['얼굴이 잘 보이는 사진 한 장을 올려요', '느낌과 바탕을 고릅니다', '실물과 같은 얼굴로 나옵니다'].map((t, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i === 2 ? 0 : 8 }}>
                            <span style={{
                                flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                                background: '#1C2321', color: '#fff', fontSize: 12, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{i + 1}</span>
                            <span style={{ fontSize: 15, color: '#52525b', lineHeight: 1.6, wordBreak: 'keep-all' }}>{t}</span>
                        </div>
                    ))}
                </div>

                {/* 광고(애드센스) — 무료 화면에만, 본문 끝난 뒤 */}
                <AdSlot />
            </div>
        </main>
    )
}

/**
 * 주소에 붙은 값(?mood=…)을 읽으려면 useSearchParams 가 필요하고,
 * 그건 Suspense 안에 있어야 한다(없으면 빌드가 이 화면에서 멈춘다).
 */
export default function Page() {
    return (
        <Suspense fallback={null}>
            <ActorPhotoPage안쪽 />
        </Suspense>
    )
}
