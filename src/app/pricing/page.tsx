'use client'

/**
 * 얼마인가요 — 사진 기준으로 다시 씀 (대표 지시 2026-09-15 「요금제 화면은 사진 기준으로 다시 짜」)
 *
 * 전에는 「하루 20회 무료 대화」 「텍스트 + 음성 멘토링」이었다. 옛 제품(대화) 얘기다.
 * 지금 우리가 파는 것은 사진이고, 값은 클로버로 매긴다.
 *
 * 숫자는 전부 실제 코드에서 읽는다. 화면에 손으로 적으면 갈라진다
 * (실제로 화면 9,900원 / 청구 7,900원으로 갈려 있던 적이 있다).
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AppSidebar from '@/components/AppSidebar'
import CloverIcon from '@/components/ui/CloverIcon'
import { CLOVER_PACKS, discountPercent } from '@/domains/credit/packs'
import { ID_COST } from '@/domains/studio/idphoto'
import { TEACHER_COST } from '@/domains/studio/teacher'
import { PHOTO_COST } from '@/domains/studio/photo'
import { ENHANCE_COST } from '@/domains/studio/enhance'
import { THUMBNAIL_COST } from '@/domains/studio/thumbnail'
import { TRIAL_CLOVERS, TRIAL_DAYS, SIGNUP_CLOVERS } from '@/domains/trial'

const 값표: { 이름: string; 클로버: number; 어디: string }[] = [
    { 이름: '증명사진 만들기', 클로버: ID_COST, 어디: '/tools/id-photo' },
    { 이름: '강사 프로필 만들기', 클로버: TEACHER_COST, 어디: '/tools/teacher-photo' },
    { 이름: '배우 프로필 만들기', 클로버: PHOTO_COST, 어디: '/tools/actor-photo' },
    { 이름: '콘텐츠 썸네일 만들기', 클로버: THUMBNAIL_COST, 어디: '/tools/thumbnail' },
    { 이름: '사진 화질 개선하기', 클로버: ENHANCE_COST, 어디: '/tools/enhance' },
]

export default function PricingPage() {
    const router = useRouter()
    const [구독중, set구독중] = useState(false)

    useEffect(() => {
        void (async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: row } = await supabase
                .from('users').select('subscription_tier').eq('id', user.id).single()
            set구독중(row?.subscription_tier === 'premium')
        })()
    }, [])

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />

            <div style={{ maxWidth: 680, margin: '0 auto', padding: '30px 18px 90px' }}>
                <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
                    얼마인가요
                </h1>
                <p style={{ fontSize: 16, color: 'var(--먹연)', margin: '0 0 26px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    쓴 만큼만 냅니다. 달마다 나가는 돈은 없습니다.
                </p>

                {/* 사진 한 장에 얼마 */}
                <section style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '20px 18px', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>사진 한 장에 얼마</h2>
                    <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 16px' }}>
                        사진을 만들 때 클로버를 씁니다.
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {값표.map((v) => (
                            <li key={v.이름}>
                                <Link
                                    href={v.어디}
                                    style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        gap: 10, textDecoration: 'none', color: 'inherit',
                                    }}
                                >
                                    <span style={{ fontSize: 16, fontWeight: 700 }}>{v.이름}</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                        <CloverIcon size={16} />
                                        <span style={{ fontSize: 16, fontWeight: 800 }}>{v.클로버}개</span>

                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <p style={{ fontSize: 14.5, color: '#a1a1aa', margin: '14px 0 0', lineHeight: 1.6 }}>
                        나를 닮은 AI 만들기는 무료입니다.
                    </p>
                </section>

                {/* 공짜로 할 수 있는 것 */}
                <section style={{ background: '#F4F6F3', border: '1px solid #e4e4e7', borderRadius: 18, padding: '20px 18px', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>돈 안 내고 할 수 있는 것</h2>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                            '가입 안 해도 하루 3장까지 만들어 볼 수 있어요 (흐린 미리보기)',
                            `가입하면 클로버 ${SIGNUP_CLOVERS}개를 드려요 (사진 ${Math.floor(SIGNUP_CLOVERS / ID_COST)}장)`,
                            `무료 체험권을 받으면 ${TRIAL_DAYS}일 동안 쓸 수 있고 클로버 ${TRIAL_CLOVERS}개를 더 드려요`,
                            '친구가 내 링크로 가입하면 클로버 100개를 받아요',
                        ].map((t) => (
                            <li key={t} style={{ fontSize: 15.5, color: '#3f3f46', lineHeight: 1.6, display: 'flex', gap: 8, wordBreak: 'keep-all' }}>
                                <CloverIcon size={15} />
                                <span>{t}</span>
                            </li>
                        ))}
                    </ul>
                    <Link
                        href="/missions"
                        style={{
                            display: 'inline-block', marginTop: 14, fontSize: 15.5, fontWeight: 800,
                            color: '#166534', textDecoration: 'none',
                        }}
                    >
                        클로버 모으는 법 보기
                    </Link>
                </section>

                {/* 클로버 담기 */}
                <section style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '20px 18px', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>클로버 담기</h2>
                    <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 16px' }}>
                        많이 담을수록 한 장당 값이 내려갑니다.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {CLOVER_PACKS.map((p) => (
                            <div
                                key={p.id}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    gap: 10, padding: '14px 16px', border: '1px solid #e4e4e7', borderRadius: 14,
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 17, fontWeight: 800 }}>
                                        클로버 {p.clovers.toLocaleString()}개
                                    </div>
                                    <div style={{ fontSize: 14.5, color: '#71717a', marginTop: 2 }}>
                                        사진 {Math.floor(p.clovers / ID_COST).toLocaleString()}장을 만들 수 있어요
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 18, fontWeight: 900 }}>{p.won.toLocaleString()}원</div>
                                    {discountPercent(p) > 0 && (
                                        <div style={{ fontSize: 13.5, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>
                                            {discountPercent(p)}% 싸게
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => router.push('/charge')}
                        style={{
                            width: '100%', marginTop: 14, padding: 16, borderRadius: 16, border: 'none',
                            background: '#1C2321', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer',
                        }}
                    >
                        클로버 충전하러 가기
                    </button>
                    <p style={{ fontSize: 14.5, color: '#a1a1aa', margin: '10px 0 0', textAlign: 'center' }}>
                        충전한 클로버는 사라지지 않습니다. 쓸 때마다 하나씩 줄어듭니다.
                    </p>
                </section>

                {/* 이미 구독 중인 분에게만 */}
                {구독중 && (
                    <section style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '18px' }}>
                        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>구독 중이신 분</h2>
                        <p style={{ fontSize: 15, color: '#71717a', margin: 0, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            예전에 시작하신 구독은 그대로 쓰실 수 있습니다. 사진은 구독과 별개로 클로버로 만듭니다.
                            바꾸거나 그만두시려면 마이페이지에서 하실 수 있어요.
                        </p>
                        <Link href="/profile" style={{ display: 'inline-block', marginTop: 10, fontSize: 15.5, fontWeight: 800, color: '#166534', textDecoration: 'none' }}>
                            마이페이지로 가기
                        </Link>
                    </section>
                )}
            </div>
        </main>
    )
}
