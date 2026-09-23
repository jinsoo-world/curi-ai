'use client'

// 결제가 끝나고 토스가 돌려보내는 자리 (/os/charge/done). 두 갈래:
//  ① 요금제(주문번호 plan_basic_… / plan_pro_…, ?plan=) → 서버(/api/os/plan)가 토스에 확인받고 요금제를 시작한다.
//  ② 클로버 충전(주문번호 clover_…, ?packId=) → 서버(/api/credits/charge)가 확인받고 클로버를 넣는다(옛 흐름 그대로).
// 갈래는 주문번호 접두사로 가른다. 요금제 결제가 클로버 지급 쪽으로 흘러가지 않게 한다.
// 다 되면 어디서 왔는지(curi_os_back) 그 자리로 돌려보낸다.
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { confirmCloverCharge } from '@/domains/credit/charge-client'
import { resolveReturnPath, OS_RETURN_KEY } from '@/domains/credit/charge-flow'
import { getPlan, planIdFromOrderId } from '@/domains/os/plan'
import { confirmPlanPayment } from '../plan-client'
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
    // 요금제 결제인가 = 주문번호가 plan_ 으로 시작. 주소의 ?plan= 과 다르면 주문번호를 믿는다
    const planId = planIdFromOrderId(orderId)
    const isPlan = planId !== null
    const 빠짐 = !paymentKey || !orderId || !amount || (!isPlan && !packId)

    useEffect(() => {
        if (!paymentKey || !orderId || !amount) return
        if (planId) {
            confirmPlanPayment({ paymentKey, orderId, amount: Number(amount), planId })
                .then(() => setState('ok'))
                .catch(e => { setState('fail'); setErrorMsg(e instanceof Error ? e.message : '요금제를 시작하지 못했어요.') })
            return
        }
        if (!packId) return
        confirmCloverCharge({ paymentKey, orderId, amount: Number(amount), packId })
            .then(r => { setClovers(r.clovers); setBalance(r.balance); setState('ok') })
            .catch(e => { setState('fail'); setErrorMsg(e instanceof Error ? e.message : '충전에 실패했어요.') })
    }, [paymentKey, orderId, amount, packId, planId])

    const 상태 = 빠짐 ? 'fail' : state
    const 오류글 = 빠짐 ? '결제 정보가 모자랍니다.' : errorMsg
    const planName = planId ? getPlan(planId)?.name ?? '' : ''

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
                {상태 === 'ing' && (<><CloverIcon size={44} /><p>{isPlan ? '요금제를 시작하고 있어요…' : '충전하고 있어요…'}</p></>)}
                {상태 === 'ok' && isPlan && (
                    <>
                        <CloverIcon size={48} />
                        <h2>{planName} 요금제가 시작됐어요</h2>
                        <p>첫 달 결제가 끝났어요. 이제 봇을 더 많이 쓸 수 있어요.</p>
                        <p>다음 달부터 자동으로 갱신되는 정기 결제는 준비 중이에요.</p>
                        <button type="button" className="osc-pay" onClick={goBack}>봇 팀으로 돌아가기</button>
                    </>
                )}
                {상태 === 'ok' && !isPlan && (
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
                        <h2>{isPlan ? '요금제를 시작하지 못했어요' : '충전하지 못했어요'}</h2>
                        <p>{오류글}<br />돈이 빠져나갔는데 반영이 안 됐다면 알려주세요. 바로 확인해 드립니다.</p>
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
