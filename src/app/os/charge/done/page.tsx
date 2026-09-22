'use client'

// 봇 팀 충전이 끝나고 토스가 돌려보내는 자리 (/os/charge/done).
// 서버(/api/credits/charge)가 토스에 직접 확인받고 클로버를 넣는다. 화면은 결과만 보여준다.
// 다 되면 어디서 왔는지(curi_os_back) 그 자리로 돌려보내고, 잔량은 그 화면이 다시 읽는다.
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { confirmCloverCharge } from '@/domains/credit/charge-client'
import { resolveReturnPath, OS_RETURN_KEY } from '@/domains/credit/charge-flow'
import CloverIcon from '@/components/ui/CloverIcon'
import '../charge.css'

function DoneInner() {
    const router = useRouter()
    const sp = useSearchParams()
    const [state, setState] = useState<'ing' | 'ok' | 'fail'>('ing')
    const [clovers, setClovers] = useState(0)
    const [balance, setBalance] = useState<number | null>(null)
    const [errorMsg, setErrorMsg] = useState('')

    const paymentKey = sp.get('paymentKey')
    const orderId = sp.get('orderId')
    const amount = sp.get('amount')
    const packId = sp.get('packId')
    const 빠짐 = !paymentKey || !orderId || !amount || !packId

    useEffect(() => {
        if (!paymentKey || !orderId || !amount || !packId) return
        confirmCloverCharge({ paymentKey, orderId, amount: Number(amount), packId })
            .then(r => { setClovers(r.clovers); setBalance(r.balance); setState('ok') })
            .catch(e => { setState('fail'); setErrorMsg(e instanceof Error ? e.message : '충전에 실패했어요.') })
    }, [paymentKey, orderId, amount, packId])

    const 상태 = 빠짐 ? 'fail' : state
    const 오류글 = 빠짐 ? '결제 정보가 모자랍니다.' : errorMsg

    const goBack = () => {
        let 곳 = '/os'
        try {
            곳 = resolveReturnPath(sessionStorage.getItem(OS_RETURN_KEY))
            sessionStorage.removeItem(OS_RETURN_KEY)
        } catch {}
        router.push(곳)
    }

    return (
        <div className="osc-done">
            <div className="osc-done-card">
                {상태 === 'ing' && (<><CloverIcon size={44} /><p>충전하고 있어요…</p></>)}
                {상태 === 'ok' && (
                    <>
                        <CloverIcon size={48} />
                        <h2>충전 완료</h2>
                        <p>클로버 <b style={{ color: 'var(--os-클로버)' }}>{clovers.toLocaleString()}개</b>가 들어왔어요.</p>
                        {balance !== null && <p>지금 가진 클로버 {balance.toLocaleString()}개</p>}
                        <button type="button" className="osc-pay" onClick={goBack}>봇 팀으로 돌아가기</button>
                    </>
                )}
                {상태 === 'fail' && (
                    <>
                        <h2>충전하지 못했어요</h2>
                        <p>{오류글}<br />돈이 빠져나갔는데 클로버가 안 들어왔다면 알려주세요. 바로 확인해 드립니다.</p>
                        <button type="button" className="osc-pay" onClick={() => router.push('/os/charge')}>다시 시도하기</button>
                        <button type="button" className="osc-sub" onClick={goBack}>돌아가기</button>
                    </>
                )}
            </div>
        </div>
    )
}

export default function OsChargeDonePage() {
    return <Suspense fallback={null}><DoneInner /></Suspense>
}
