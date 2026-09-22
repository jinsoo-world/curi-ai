'use client'

// 충전 결제가 끝나고 토스가 돌려보내는 자리.
// 여기서 서버에 확인을 받아야 클로버가 들어간다(화면이 아니라 서버가 토스에 직접 묻는다).
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { confirmCloverCharge } from '@/domains/credit/charge-client'

function ChargeDoneInner() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [state, setState] = useState<'ing' | 'ok' | 'fail'>('ing')
    const [clovers, setClovers] = useState(0)
    const [balance, setBalance] = useState<number | null>(null)
    const [errorMsg, setErrorMsg] = useState('')

    const paymentKey = searchParams.get('paymentKey')
    const orderId = searchParams.get('orderId')
    const amount = searchParams.get('amount')
    const packId = searchParams.get('packId')
    // 값이 빠졌으면 그릴 때 바로 실패로 본다 (effect 본문에서 setState 하지 않는 린트 규칙)
    const 빠짐 = !paymentKey || !orderId || !amount || !packId

    useEffect(() => {
        if (!paymentKey || !orderId || !amount || !packId) return

        confirmCloverCharge({ paymentKey, orderId, amount: Number(amount), packId })
            .then(data => {
                setClovers(data.clovers)
                setBalance(data.balance)
                setState('ok')
            })
            .catch(e => {
                setState('fail')
                setErrorMsg(e instanceof Error ? e.message : '충전에 실패했어요.')
            })
    }, [paymentKey, orderId, amount, packId])

    const 상태 = 빠짐 ? 'fail' : state
    const 오류글 = 빠짐 ? '결제 정보가 모자랍니다.' : errorMsg

    return (
        <main style={{
            minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 40%)',
        }}>
            <div style={{
                width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20,
                padding: '36px 28px', textAlign: 'center', border: '1px solid #e4e4e7',
            }}>
                {상태 === 'ing' && (
                    <>
                        <div style={{ fontSize: 40, marginBottom: 14 }}>🍀</div>
                        <p style={{ fontSize: 16, color: '#52525b', margin: 0 }}>충전하고 있어요...</p>
                    </>
                )}

                {상태 === 'ok' && (
                    <>
                        <div style={{ fontSize: 44, marginBottom: 14 }}>🎉</div>
                        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#18181b', margin: '0 0 8px' }}>
                            충전 완료!
                        </h2>
                        <p style={{ fontSize: 15, color: '#52525b', margin: '0 0 6px', lineHeight: 1.7 }}>
                            클로버 <strong style={{ color: '#16a34a' }}>{clovers.toLocaleString()}개</strong>가 들어왔어요.
                        </p>
                        {balance !== null && (
                            <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 28px' }}>
                                지금 가진 클로버 {balance.toLocaleString()}개
                            </p>
                        )}
                        <button
                            onClick={() => {
                                let 돌아갈곳 = '/mentors'
                                try {
                                    const b = sessionStorage.getItem('curi_back')
                                    if (b && b.startsWith('/')) { 돌아갈곳 = b; sessionStorage.removeItem('curi_back') }
                                } catch {}
                                router.push(돌아갈곳)
                            }}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                                background: '#1C2321', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
                            }}
                        >
                            이어서 만들러 가기
                        </button>
                    </>
                )}

                {상태 === 'fail' && (
                    <>

                        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#18181b', margin: '0 0 8px' }}>
                            충전하지 못했어요
                        </h2>
                        <p style={{ fontSize: 14, color: '#71717a', margin: '0 0 24px', lineHeight: 1.7, wordBreak: 'keep-all' }}>
                            {오류글}<br />
                            돈이 빠져나갔는데 클로버가 안 들어왔다면 알려주세요. 바로 확인해 드립니다.
                        </p>
                        <button
                            onClick={() => router.push('/charge')}
                            style={{
                                width: '100%', padding: '14px', borderRadius: 14,
                                border: '1px solid #e4e4e7', background: '#fff',
                                fontSize: 15, fontWeight: 600, color: '#3f3f46', cursor: 'pointer',
                            }}
                        >
                            다시 시도하기
                        </button>
                    </>
                )}
            </div>
        </main>
    )
}

export default function ChargeDonePage() {
    return (
        <Suspense fallback={null}>
            <ChargeDoneInner />
        </Suspense>
    )
}
