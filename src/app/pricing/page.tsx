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
import { CLOVER_PACKS } from '@/domains/credit/packs'
import { PLANS } from '@/domains/os/plan'
import { TEACHER_COST } from '@/domains/studio/teacher'
import { PHOTO_COST } from '@/domains/studio/photo'
import { ENHANCE_COST } from '@/domains/studio/enhance'
import { TOOLS } from '@/domains/studio/tools'
import { TRIAL_CLOVERS, TRIAL_DAYS, SIGNUP_CLOVERS } from '@/domains/trial'

// 요금표는 만들기 목록(TOOLS) 한 표만 본다 — 대표 지시 2026-09-16
// 「만들기는 4개로 정리하자」 「각 페이지에는 해당하는 내용만 있게 해」
// 손으로 또 적어두면 목록에서 뺀 도구가 요금표에만 남는다(썸네일이 그랬다).
const 값표 = TOOLS
    .filter((t) => t.cost !== 'free')
    .map((t) => ({ 이름: t.title, 클로버: t.cost as number, 어디: t.href }))

export default function PricingPage() {
    const router = useRouter()
    const [구독중, set구독중] = useState(false)

    useEffect(() => {
        void (async () => {
            const supabase = createClient()
            // 화면을 여는 신원 확인은 getSession 으로 — getUser 는 부를 때마다 서버에 다녀온다(2026-09-16 실측 수 초)
            const { data: { session } } = await supabase.auth.getSession()
            const user = session?.user ?? null
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
                    봇 팀은 무료로 시작할 수 있어요. 더 많이 쓰고 싶을 때 요금제를 올리면 됩니다.
                </p>

                {/* 요금제 (대표 확정 0923: 무료 / 월 29,000원 / 월 99,000원). 값은 src/domains/os/plan.ts PLANS 한 표만 본다 */}
                <section style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '20px 18px', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>봇 팀 요금제</h2>
                    <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 16px' }}>
                        내 팀 봇과의 대화는 클로버를 쓰지 않아요.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {PLANS.map((p) => (
                            <div key={p.id} style={{ padding: '14px 16px', border: p.recommended ? '2px solid #22c55e' : '1px solid #e4e4e7', borderRadius: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                    <div style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</div>
                                    <div style={{ fontSize: 18, fontWeight: 900, flexShrink: 0 }}>{p.price === 0 ? '0원' : `월 ${p.price.toLocaleString()}원`}</div>
                                </div>
                                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {p.perks.map((perk) => (
                                        <li key={perk} style={{ fontSize: 14.5, color: '#3f3f46', lineHeight: 1.6, wordBreak: 'keep-all' }}>{perk}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => router.push('/os/charge')}
                        style={{
                            width: '100%', marginTop: 14, padding: 16, borderRadius: 16, border: 'none',
                            background: '#1C2321', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer',
                        }}
                    >
                        요금제 보기
                    </button>
                    <p style={{ fontSize: 14.5, color: '#a1a1aa', margin: '10px 0 0', textAlign: 'center' }}>
                        정기 결제는 준비 중이에요. 지금은 첫 달만 결제돼요.
                    </p>
                </section>

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
                            `가입하면 클로버 ${SIGNUP_CLOVERS}개를 드려요 (사진 ${Math.floor(SIGNUP_CLOVERS / TEACHER_COST)}장)`,
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

                {/* 클로버 충전 (부가). 사진 N장·할인 표기는 뺐다(대표 지시 0923). 값은 0915 확정 그대로 */}
                <section style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '20px 18px', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 4px' }}>클로버 충전</h2>
                    <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 16px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                        봇 마켓의 다른 리더 봇과 대화하거나 한도를 넘겨 더 쓸 때, 그리고 사진을 만들 때 클로버를 써요. 내 팀 봇과의 대화는 클로버를 쓰지 않아요.
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
                                <div style={{ fontSize: 17, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <CloverIcon size={18} /> 클로버 {p.clovers.toLocaleString()}개
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 900, flexShrink: 0 }}>{p.won.toLocaleString()}원</div>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => router.push('/os/charge')}
                        style={{
                            width: '100%', marginTop: 14, padding: 16, borderRadius: 16, border: '1.5px solid #1C2321',
                            background: '#fff', color: '#1C2321', fontSize: 17, fontWeight: 800, cursor: 'pointer',
                        }}
                    >
                        클로버 충전하러 가기
                    </button>
                    <p style={{ fontSize: 14.5, color: '#a1a1aa', margin: '10px 0 0', textAlign: 'center' }}>
                        한 번 사면 끝. 정기 결제가 아니에요.
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
