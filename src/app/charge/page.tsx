'use client'

// 클로버 충전 화면 — 대표 확정 2026-09-14 「충전식이면 좋을듯해」
// ⚠️ 클로버 개수만 보이면 안 된다. 원화를 항상 같이 적는다.
//    중장년은 「지금 얼마 쓰는지 모르는 상태」를 가장 싫어한다(시장 조사 0914).
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CLOVER_PACKS, discountPercent } from '@/domains/credit/packs'
import AppSidebar from '@/components/AppSidebar'
import CloverIcon from '@/components/ui/CloverIcon'

export default function ChargePage() {
    const router = useRouter()
    const [selected, setSelected] = useState(CLOVER_PACKS[2].id)
    const [userId, setUserId] = useState<string | null>(null)
    const [balance, setBalance] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    // 어디서 충전하러 왔는지 기억했다가 끝나면 그 자리로 돌려보낸다 (전수조사 4번)
    useEffect(() => {
        try {
            const b = new URLSearchParams(window.location.search).get('back')
            if (b && b.startsWith('/')) sessionStorage.setItem('curi_back', b)
        } catch {}
    }, [])

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getUser().then(async ({ data }) => {
            const uid = data.user?.id ?? null
            setUserId(uid)
            if (uid) {
                const { data: row } = await supabase.from('users').select('clovers').eq('id', uid).single()
                setBalance(row?.clovers ?? 0)
            }
        })
    }, [])

    const pack = CLOVER_PACKS.find(p => p.id === selected)!

    const handleCharge = async () => {
        if (!userId) {
            router.push('/login?redirect=/charge')
            return
        }
        setLoading(true)
        setErrorMsg(null)
        try {
            const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
            if (!clientKey) throw new Error('결제 설정이 아직 안 됐어요. 잠시 뒤 다시 시도해 주세요.')

            const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
            const tossPayments = await loadTossPayments(clientKey)
            const payment = tossPayments.payment({ customerKey: userId })

            const orderId = `clover_${pack.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

            await payment.requestPayment({
                method: 'CARD',
                amount: { currency: 'KRW', value: pack.won },
                orderId,
                orderName: `클로버 ${pack.clovers.toLocaleString()}개`,
                successUrl: `${window.location.origin}/charge/done?packId=${pack.id}`,
                failUrl: `${window.location.origin}/charge?failed=1`,
                card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false },
            })
        } catch (error) {
            const msg = error instanceof Error ? error.message : '결제를 시작하지 못했어요.'
            setErrorMsg(msg)
            setLoading(false)
        }
    }

    return (
        <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 40%)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px 80px' }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: '#18181b', margin: '0 0 6px' }}>
                    클로버 충전
                </h1>
                <p style={{ fontSize: 15, color: '#52525b', lineHeight: 1.7, margin: '0 0 8px', wordBreak: 'keep-all' }}>
                    사진을 만들 때 클로버를 씁니다. 쓴 만큼만 냅니다.
                </p>
                <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 24px' }}>
                    많이 담을수록 최대 {Math.max(...CLOVER_PACKS.map(discountPercent))}% 싸집니다
                </p>

                {/* 지금 잔액 */}
                {balance !== null && (
                    <div style={{
                        background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14,
                        padding: '14px 18px', marginBottom: 18,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontSize: 14, color: '#52525b' }}>지금 가진 클로버</span>
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#18181b' }}>
                            {balance.toLocaleString()}개
                        </span>
                    </div>
                )}

                {/* 상품 고르기 — 원화를 항상 같이 보여준다 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                    {CLOVER_PACKS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setSelected(p.id)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '20px 20px',
                                borderRadius: 16,
                                gap: 12,
                                border: selected === p.id ? '2px solid #22c55e' : '1.5px solid #e4e4e7',
                                background: selected === p.id ? '#f0fdf4' : '#fff',
                                cursor: 'pointer',
                                textAlign: 'left',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                <CloverIcon size={34} />
                                <div style={{ minWidth: 0 }}>
                                    {/* 대표 확정 0915 「10장 50장 100장 만드는 걸로 가자」 — 장수를 앞에 크게 */}
                                    <div style={{ fontSize: 21, fontWeight: 900, color: '#18181b', letterSpacing: '-0.02em' }}>
                                        사진 {Math.floor(p.clovers / 20).toLocaleString()}장
                                    </div>
                                    <div style={{ fontSize: 15, color: '#71717a', marginTop: 3 }}>
                                        클로버 {p.clovers.toLocaleString()}개
                                    </div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                {discountPercent(p) > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, marginBottom: 2 }}>
                                        <span style={{
                                            background: '#22c55e', color: '#fff',
                                            fontSize: 12, fontWeight: 800,
                                            padding: '3px 8px', borderRadius: 7,
                                        }}>
                                            {discountPercent(p)}%
                                        </span>
                                    </div>
                                )}
                                <div style={{ fontSize: 21, fontWeight: 900, color: '#18181b', letterSpacing: '-0.02em' }}>
                                    {p.won.toLocaleString()}원
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {errorMsg && (
                    <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 14, padding: '12px 16px', borderRadius: 12, marginBottom: 14 }}>
                        {errorMsg}
                    </div>
                )}

                <button
                    onClick={handleCharge}
                    disabled={loading}
                    style={{
                        width: '100%', padding: '16px', borderRadius: 16, border: 'none',
                        background: loading ? '#a1a1aa' : '#22c55e', color: '#fff',
                        fontSize: 16, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
                    }}
                >
                    {loading ? '결제창을 여는 중...' : `${pack.won.toLocaleString()}원 결제하기`}
                </button>
                <p style={{ fontSize: 12, color: '#a1a1aa', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.6 }}>
                    충전한 클로버는 사라지지 않아요. 쓸 때마다 하나씩 줄어듭니다.
                </p>
            </div>
        </main>
    )
}
