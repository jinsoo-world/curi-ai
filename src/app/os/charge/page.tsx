'use client'

// 봇 팀 요금제 (/os/charge) = 무료 / 베이직 월 29,000원 / 프로 월 99,000원.
// 대표 확정 0923 「클로버를 충전하는 개념이고, 산 날동안 1년 쓸 수 있다 이런 문구는 빼.
//                 구독은 무료(기본) / 29,000원 / 99,000원 이렇게 2개 요금제로 해.」
// 내 팀 봇과의 대화는 클로버 0. 클로버 충전은 아래 부가 섹션으로 남긴다(봇 마켓의 다른 리더 봇, 한도 넘겨 더 쓰기).
// 대표 지시 0923 「클로버 충전은 워딩 바꿔. 사진이 주력이 아니다 이제」 → 사진 N장·1년·할인 배지 표기는 뺐다.
// ⚠️ 카드 안 혜택 구성은 부대표 추천(미확정), 대표 검수 필요 — 값은 src/domains/os/plan.ts PLANS.
// 손님 = 4060 강사, 작가, 크리에이터. 글자 17px 이상, 단추 52px 이상, 색은 [data-theme="os"] 토큰만.
// 어디서 왔는지(?from=/os/chat/…)를 기억해 「돌아가기」와 결제 뒤 도착지로 쓴다.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { resolveReturnPath, chargeReturnUrls, OS_RETURN_KEY } from '@/domains/credit/charge-flow'
import { CLOVER_PACKS } from '@/domains/credit/packs'
import { startCloverCharge } from '@/domains/credit/charge-client'
import { PLANS, isPaidPlanId, type PlanId } from '@/domains/os/plan'
import { startPlanPayment, planReturnUrls, fetchMyPlan } from './plan-client'
import { useOsTeam } from '@/components/os/OsShell'
import CloverIcon from '@/components/ui/CloverIcon'
import './charge.css'

export default function OsChargePage() {
    const router = useRouter()
    const { guest, loading: teamLoading } = useOsTeam()
    const [userId, setUserId] = useState<string | null>(null)
    const [sessionChecked, setSessionChecked] = useState(false)
    const [balance, setBalance] = useState<number | null>(null)
    const [myPlan, setMyPlan] = useState<PlanId>('free')
    const [paying, setPaying] = useState<PlanId | null>(null)
    // 클로버 충전 (부가). 처음엔 가장 큰 묶음을 골라 둔다
    const [selectedPack, setSelectedPack] = useState(CLOVER_PACKS[CLOVER_PACKS.length - 1].id)
    const [packPaying, setPackPaying] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [returnTo, setReturnTo] = useState('/os')
    // 시연 모드 (/os/charge?demo=1) = 로그인 없이 요금제 카드를 볼 수 있게 (OsShell 의 ?demo=1 과 같은 규칙). 결제 단추는 로그인으로 보낸다
    const [demo, setDemo] = useState(false)

    // 세션 한 번 읽고 → ①어디서 왔는지 기억 ②클로버 잔량 ③지금 요금제. (effect 본문에서 바로 setState 하지 않는다 = 린트 규칙)
    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getSession().then(async ({ data }) => {
            try {
                const q = new URLSearchParams(window.location.search)
                if (q.get('demo') === '1') setDemo(true)
                const 저장된 = sessionStorage.getItem(OS_RETURN_KEY)
                const 곳 = resolveReturnPath(q.get('from') ?? 저장된)
                sessionStorage.setItem(OS_RETURN_KEY, 곳)
                setReturnTo(곳)
                if (q.get('failed') === '1') setErrorMsg('결제가 끝나지 않았어요. 다시 시도해 주세요.')
            } catch {}

            const uid = data.session?.user?.id ?? null
            setUserId(uid)
            setSessionChecked(true)
            if (uid) {
                const [{ data: row }, plan] = await Promise.all([
                    supabase.from('users').select('clovers').eq('id', uid).single(),
                    fetchMyPlan(),
                ])
                setBalance(row?.clovers ?? 0)
                setMyPlan(plan)
            }
        })
    }, [])

    const loginHref = `/login?next=${encodeURIComponent(`/os/charge?from=${returnTo}`)}`

    const handlePay = async (planId: PlanId) => {
        if (!isPaidPlanId(planId)) return
        if (!userId) { router.push(loginHref); return }
        setPaying(planId)
        setErrorMsg(null)
        try {
            await startPlanPayment({ userId, planId, ...planReturnUrls(window.location.origin, planId) })
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : '결제를 시작하지 못했어요.')
            setPaying(null)
        }
    }

    const pack = CLOVER_PACKS.find(p => p.id === selectedPack) ?? CLOVER_PACKS[0]
    const handlePackPay = async () => {
        if (!userId) { router.push(loginHref); return }
        setPackPaying(true)
        setErrorMsg(null)
        try {
            // 주문번호 clover_… 로 나가서 done 페이지가 클로버 지급 쪽으로 가른다(요금제 plan_… 과 섞이지 않는다)
            const urls = chargeReturnUrls(window.location.origin, '/os/charge/done', '/os/charge', pack.id)
            await startCloverCharge({ userId, pack, ...urls })
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : '결제를 시작하지 못했어요.')
            setPackPaying(false)
        }
    }

    // 손님 = 팀 API 가 손님이라 하거나, 세션을 봤는데 로그인이 없을 때
    const isGuest = !demo && ((!teamLoading && guest) || (sessionChecked && !userId))

    return (
        <div className="osc">
            <div className="osc-inner">
                <button type="button" className="osc-back" onClick={() => router.push(returnTo)}>
                    <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>←</span> 돌아가기
                </button>

                <h1 className="osc-h1">요금제</h1>
                <p className="osc-p">봇을 더 많이, 더 자주 쓰고 싶을 때 요금제를 올리면 돼요. 무료로도 시작할 수 있어요.</p>

                {isGuest ? (
                    <div className="osc-guest">
                        <p className="osc-p">로그인하면 내 요금제를 보고 바꿀 수 있어요.</p>
                        <Link href={loginHref} className="os-cta">로그인하고 요금제 보기</Link>
                    </div>
                ) : (
                    <>
                        {balance !== null && (
                            <div className="osc-balance">
                                <div className="osc-balance-row">
                                    <span className="osc-balance-label">지금 가진 클로버</span>
                                    <span className="osc-balance-num"><CloverIcon size={24} />{balance.toLocaleString()}개</span>
                                </div>
                                <p className="osc-balance-sub">내 팀 봇과의 대화는 클로버를 쓰지 않아요</p>
                            </div>
                        )}

                        <div className="osc-plans">
                            {PLANS.map(p => {
                                const current = myPlan === p.id
                                return (
                                    <section key={p.id} className={`osc-plan${p.recommended ? ' rec' : ''}${current ? ' now' : ''}`} aria-label={`${p.name} 요금제`}>
                                        <div className="osc-plan-head">
                                            <div>
                                                <div className="osc-plan-name">{p.name}{p.id === 'free' && <span className="osc-plan-tag">기본</span>}</div>
                                                <div className="osc-plan-price">
                                                    {p.price === 0 ? '0원' : <>월 {p.price.toLocaleString()}원</>}
                                                </div>
                                            </div>
                                            {current && <span className="osc-badge now">지금 쓰는 중</span>}
                                            {!current && p.recommended && <span className="osc-badge rec">가장 많이 골라요</span>}
                                        </div>
                                        <ul className="osc-perks">
                                            {p.perks.map(perk => <li key={perk}>{perk}</li>)}
                                        </ul>
                                        {isPaidPlanId(p.id) && !current && (
                                            <button type="button" className={`osc-pay${p.recommended ? '' : ' ghost'}`} onClick={() => handlePay(p.id)} disabled={paying !== null || packPaying}>
                                                {paying === p.id ? '결제창을 여는 중…' : `월 ${p.price.toLocaleString()}원으로 시작하기`}
                                            </button>
                                        )}
                                    </section>
                                )
                            })}
                        </div>

                        {errorMsg && <div className="osc-error" role="alert">{errorMsg}</div>}

                        <p className="osc-note">정기 결제는 준비 중이에요. 지금은 첫 달만 결제돼요.</p>

                        {/* 클로버 충전 (부가). 사진 N장·산 날부터 1년·할인 배지는 화면에서 뺐다(대표 지시 0923). 값은 0915 확정 그대로 */}
                        <section className="osc-clover" aria-label="클로버 충전">
                            <h2 className="osc-h2">클로버 충전</h2>
                            <p className="osc-p">봇 마켓의 다른 리더 봇과 대화하거나 한도를 넘겨 더 쓸 때 클로버를 써요. 내 팀 봇과의 대화는 클로버를 쓰지 않아요.</p>
                            <div className="osc-packs" role="radiogroup" aria-label="충전 상품">
                                {CLOVER_PACKS.map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        className="osc-pack"
                                        aria-pressed={selectedPack === p.id}
                                        onClick={() => setSelectedPack(p.id)}
                                    >
                                        <span className="osc-pack-left"><CloverIcon size={30} /><span className="osc-pack-clovers">클로버 {p.clovers.toLocaleString()}개</span></span>
                                        <span className="osc-pack-won">{p.won.toLocaleString()}원</span>
                                    </button>
                                ))}
                            </div>
                            <button type="button" className="osc-pay ghost" onClick={handlePackPay} disabled={packPaying || paying !== null}>
                                {packPaying ? '결제창을 여는 중…' : `클로버 ${pack.clovers.toLocaleString()}개 ${pack.won.toLocaleString()}원 충전하기`}
                            </button>
                            <p className="osc-note">한 번 사면 끝. 정기 결제가 아니에요.</p>
                        </section>

                        <p className="osc-note">
                            7일 안에 한 번도 안 쓰셨으면 전액 돌려드려요.{' '}
                            <Link href="/refund">자세히 보기</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
