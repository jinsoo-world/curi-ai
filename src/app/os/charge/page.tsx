'use client'

// 봇 팀 요금제 (/os/charge) = 무료 / 베이직 월 9,900원 / 프로 월 39,000원 (가격 대표 결정 1002).
// 대표 확정 0923 「클로버를 충전하는 개념이고, 산 날동안 1년 쓸 수 있다 이런 문구는 빼.
//                 구독은 무료(기본) / 유료 2개 요금제로 해.」
// 결제 단추는 지금보다 위 요금제에만 보인다(canBuyPlan). 프로를 쓰는 중에 베이직을 사면 남은 프로 기간을 날린다.
// 대화는 월간 한도로 센다(서버 /api/chat 기준). 한도를 다 쓰면 가진 클로버로 이어 쓴다.
// 대표 결정 1002 「웹 요금도 이거에 맞게 수정해줘. 클로버는 없애구.」 → 클로버 충전 칸은 뺐다. 파는 것은 월 요금제뿐.
// 이미 가진 클로버는 「모아 둔 대화 N번」으로 보이고, 하나도 없으면 안 보인다. 새 클로버 주문은 서버(/api/credits/charge)도 막는다.
// ⚠️ 카드 안 혜택 구성은 부대표 추천(미확정), 대표 검수 필요 — 값은 src/domains/os/plan.ts PLANS.
// 손님 = 4060 강사, 작가, 크리에이터. 글자 17px 이상, 단추 52px 이상, 색은 [data-theme="os"] 토큰만.
// 어디서 왔는지(?from=/os/chat/…)를 기억해 「돌아가기」와 결제 뒤 도착지로 쓴다.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { resolveReturnPath, OS_RETURN_KEY } from '@/domains/credit/charge-flow'
import { PLANS, STORE_SUBSCRIBED_MESSAGE, canBuyPlan, isPaidPlanId, planPriceText, upgradeNotice, type PlanId, type PlanSource } from '@/domains/os/plan'
import { PLAN_REASON, REFUND_NOTICE, cloverBalanceNote, cloverChatsText } from '@/domains/os/usage-config'
import { startPlanPayment, planReturnUrls, fetchMyPlan } from './plan-client'
import { useOsTeam } from '@/components/os/OsShell'
import { useIosApp } from '@/hooks/useIosApp'
import { APP_PLAN_NOTE } from '@/lib/app-shell'
import CloverIcon from '@/components/ui/CloverIcon'
import './charge.css'

export default function OsChargePage() {
    const router = useRouter()
    const iosApp = useIosApp()   // 아이폰 앱 안이면 true: 카드결제와 가격을 보이지 않는다(앱스토어 3.1.1). 웹은 false
    const { guest, loading: teamLoading } = useOsTeam()
    const [userId, setUserId] = useState<string | null>(null)
    const [sessionChecked, setSessionChecked] = useState(false)
    const [balance, setBalance] = useState<number | null>(null)
    const [myPlan, setMyPlan] = useState<PlanId>('free')
    const [planSrc, setPlanSrc] = useState<PlanSource | null>(null)
    const [paying, setPaying] = useState<PlanId | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    // 결제 단추 앞 필수 확인 (청약철회 안내). 체크 전에는 결제 단추가 안 눌린다
    const [planAgreed, setPlanAgreed] = useState(!REFUND_NOTICE.agree)
    const [returnTo, setReturnTo] = useState('/os')
    // 시연 모드 (/os/charge?demo=1) = 로그인 없이 요금제 카드를 볼 수 있게 (OsShell 의 ?demo=1 과 같은 규칙). 결제 단추는 로그인으로 보낸다
    const [demo, setDemo] = useState(false)

    // 세션 한 번 읽고 → ①어디서 왔는지 기억 ②클로버 잔량(모아 둔 대화) ③지금 요금제. (effect 본문에서 바로 setState 하지 않는다 = 린트 규칙)
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
                const [{ data: row }, mine] = await Promise.all([
                    supabase.from('users').select('clovers').eq('id', uid).single(),
                    fetchMyPlan(),
                ])
                setBalance(row?.clovers ?? 0)
                setMyPlan(mine.plan)
                setPlanSrc(mine.source)
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

    // 손님 = 팀 API 가 손님이라 하거나, 세션을 봤는데 로그인이 없을 때.
    // 가상 리더 사용시험(0929): 가격을 못 보면 가입도 안 한다 → 손님에게도 요금제 카드를 그대로 보여 주고, 결제 단추만 로그인으로 보낸다(handlePay)
    const isGuest = !demo && ((!teamLoading && guest) || (sessionChecked && !userId))
    // 앱(레비뉴캣)에서 연 유료 요금제가 살아 있다
    const storeSub = !isGuest && myPlan !== 'free' && planSrc === 'revenuecat'

    return (
        <div className="osc">
            <div className="osc-inner">
                {/* 「대화로 돌아가기」는 OsShell 한 장 화면 줄이 그린다 (U14). returnTo 는 로그인, 결제 뒤 도착지로 계속 쓴다 */}
                <h1 className="osc-h1">요금제</h1>
                {/* 아이폰 앱: 결제 단추, 가격, 로그인 유도 없이 한 줄만. 링크도 없다 */}
                {iosApp === true && <p className="osc-p" data-testid="osc-app-note">{APP_PLAN_NOTE}</p>}
                {iosApp === false && (<>
                <p className="osc-p">봇을 더 많이, 더 자주 쓰고 싶을 때 요금제를 올리면 돼요. 무료로도 시작할 수 있어요.</p>

                {isGuest && (
                    <div className="osc-guest">
                        <p className="osc-p">가격은 그대로 둘러보세요. 결제할 때만 로그인하면 돼요.</p>
                        <Link href={loginHref} className="os-cta">로그인</Link>
                    </div>
                )}
                <>
                        {cloverChatsText(balance) && (
                            <div className="osc-balance">
                                <div className="osc-balance-row">
                                    <span className="osc-balance-label">모아 둔 대화</span>
                                    <span className="osc-balance-num"><CloverIcon size={24} />{cloverChatsText(balance)}</span>
                                </div>
                                <p className="osc-balance-sub">{cloverBalanceNote()}</p>
                            </div>
                        )}

                        {/* 청약철회 안내와 필수 확인 (요금 정책 rev5 B-2). 요금제 결제 단추보다 먼저 읽히게 카드 위에 둔다 */}
                        {(REFUND_NOTICE.plan || REFUND_NOTICE.agree) && (
                            <div className="osc-refund">
                                {REFUND_NOTICE.plan && <p className="osc-precheck">{REFUND_NOTICE.plan} <Link href="/refund">자세히 보기</Link></p>}
                                {REFUND_NOTICE.agree && (
                                    <label className="osc-agree">
                                        <input type="checkbox" checked={planAgreed} onChange={e => setPlanAgreed(e.target.checked)} />
                                        <span>{REFUND_NOTICE.agree}</span>
                                    </label>
                                )}
                            </div>
                        )}

                        {/* 앱에서 구독 중이면 웹 결제 단추 대신 안내 (이중 결제 막기, 서버도 409 로 막는다) */}
                        {storeSub && <p className="osc-error" role="status">{STORE_SUBSCRIBED_MESSAGE}</p>}

                        <div className="osc-plans">
                            {PLANS.map(p => {
                                const current = !isGuest && myPlan === p.id   // 손님에겐 「지금 요금제」 표시를 안 붙인다
                                return (
                                    <section key={p.id} className={`osc-plan${p.recommended ? ' rec' : ''}${current ? ' now' : ''}`} aria-label={`${p.name} 요금제`}>
                                        <div className="osc-plan-head">
                                            <div>
                                                <div className="osc-plan-name">{p.name}{p.id === 'free' && <span className="osc-plan-tag">기본</span>}</div>
                                                <div className="osc-plan-price">
                                                    {planPriceText(p)}
                                                </div>
                                            </div>
                                            {current && <span className="osc-badge now">지금 쓰는 중</span>}
                                            {!current && p.recommended && <span className="osc-badge rec">가장 많이 골라요</span>}
                                        </div>
                                        {PLAN_REASON[p.id] && <p className="osc-plan-reason">{PLAN_REASON[p.id]}</p>}
                                        <ul className="osc-perks">
                                            {p.perks.map(perk => <li key={perk}>{perk}</li>)}
                                        </ul>
                                        {canBuyPlan(isGuest ? 'free' : myPlan, p.id) && !storeSub && upgradeNotice(myPlan, p.id) && (
                                            <p className="osc-precheck">{upgradeNotice(myPlan, p.id)}</p>
                                        )}
                                        {canBuyPlan(isGuest ? 'free' : myPlan, p.id) && !storeSub && (
                                            <button type="button" className={`osc-pay${p.recommended ? '' : ' ghost'}`} onClick={() => handlePay(p.id)} disabled={paying !== null || !planAgreed}>
                                                {paying === p.id ? '결제창을 여는 중…' : `${planPriceText(p)}으로 시작하기`}
                                            </button>
                                        )}
                                    </section>
                                )
                            })}
                        </div>

                        {errorMsg && <div className="osc-error" role="alert">{errorMsg}</div>}

                        <p className="osc-note">정기 결제는 준비 중이에요. 지금은 첫 달만 결제돼요.</p>


                    </>
                </>)}
            </div>
        </div>
    )
}
