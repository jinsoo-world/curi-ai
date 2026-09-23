'use client'

// 봇 팀 클로버 충전 (/os/charge) = 옛 /charge 와 결제 속은 같고 겉만 다크 OS.
// 손님 = 4060 강사, 작가, 크리에이터. 글자 17px 이상, 단추 52px 이상, 색은 [data-theme="os"] 토큰만.
// ⛔ 클로버 1개가 몇 원인지(원화 환산)는 화면에 적지 않는다(대표 확정 0915). 묶음 가격은 적는다.
// 어디서 왔는지(?from=/os/chat/…)를 기억해 「돌아가기」와 결제 뒤 도착지로 쓴다.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CLOVER_PACKS } from '@/domains/credit/packs'
import { packRows, isLowClover, resolveReturnPath, chargeReturnUrls, OS_RETURN_KEY } from '@/domains/credit/charge-flow'
import { startCloverCharge } from '@/domains/credit/charge-client'
import { useOsTeam } from '@/components/os/OsShell'
import CloverIcon from '@/components/ui/CloverIcon'
import './charge.css'

const ROWS = packRows()

export default function OsChargePage() {
    const router = useRouter()
    const { guest, loading: teamLoading } = useOsTeam()
    const [selected, setSelected] = useState(ROWS.find(r => r.recommended)?.id ?? ROWS[ROWS.length - 1].id)
    const [userId, setUserId] = useState<string | null>(null)
    const [sessionChecked, setSessionChecked] = useState(false)
    const [balance, setBalance] = useState<number | null>(null)
    const [paying, setPaying] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [returnTo, setReturnTo] = useState('/os')

    // 세션 한 번 읽고 → ①어디서 왔는지 기억 ②지금 잔량. (effect 본문에서 바로 setState 하지 않는다 = 린트 규칙)
    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getSession().then(async ({ data }) => {
            // 어디서 왔는지 기억한다. 주소에 없으면 앞서 적어 둔 것을 쓴다(새로고침, 결제창에서 돌아온 경우)
            try {
                const q = new URLSearchParams(window.location.search)
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
                const { data: row } = await supabase.from('users').select('clovers').eq('id', uid).single()
                setBalance(row?.clovers ?? 0)
            }
        })
    }, [])

    const pack = CLOVER_PACKS.find(p => p.id === selected) ?? CLOVER_PACKS[0]
    const loginHref = `/login?next=${encodeURIComponent(`/os/charge?from=${returnTo}`)}`

    const handlePay = async () => {
        if (!userId) { router.push(loginHref); return }
        setPaying(true)
        setErrorMsg(null)
        try {
            const urls = chargeReturnUrls(window.location.origin, '/os/charge/done', '/os/charge', pack.id)
            await startCloverCharge({ userId, pack, ...urls })
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : '결제를 시작하지 못했어요.')
            setPaying(false)
        }
    }

    // 손님 = 팀 API 가 손님이라 하거나, 세션을 봤는데 로그인이 없을 때
    const isGuest = (!teamLoading && guest) || (sessionChecked && !userId)

    return (
        <div className="osc">
            <div className="osc-inner">
                <button type="button" className="osc-back" onClick={() => router.push(returnTo)}>
                    <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>←</span> 돌아가기
                </button>

                <h1 className="osc-h1">클로버 충전</h1>
                <p className="osc-p">봇이 답하고 초안을 만들 때 클로버를 씁니다. 필요할 때 한 번만 사면 되고, 달마다 나가는 돈은 없어요.</p>

                {isGuest ? (
                    <div className="osc-guest">
                        <p className="osc-p">로그인하면 내 클로버를 보고 충전할 수 있어요.</p>
                        <Link href={loginHref} className="os-cta">로그인하고 충전하기</Link>
                    </div>
                ) : (
                    <>
                        {balance !== null && (
                            <div className="osc-balance">
                                <span className="osc-balance-label">지금 가진 클로버</span>
                                <span className="osc-balance-num"><CloverIcon size={24} />{balance.toLocaleString()}개</span>
                            </div>
                        )}
                        {isLowClover(balance) && (
                            <div className="osc-low" role="status">클로버가 거의 다 떨어졌어요. 충전해 두면 봇이 멈추지 않아요.</div>
                        )}

                        <div className="osc-packs" role="radiogroup" aria-label="충전 상품">
                            {ROWS.map(r => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className="osc-pack"
                                    aria-pressed={selected === r.id}
                                    onClick={() => setSelected(r.id)}
                                >
                                    <div className="osc-pack-left">
                                        <CloverIcon size={36} />
                                        <div>
                                            <div className="osc-pack-clovers">클로버 {r.clovers.toLocaleString()}개</div>
                                            <div className="osc-pack-sub">산 날부터 1년 동안 쓸 수 있어요</div>
                                        </div>
                                    </div>
                                    <div className="osc-pack-right">
                                        {r.discount > 0 && (
                                            <div><span className={`osc-badge${r.recommended ? ' rec' : ''}`}>{r.recommended ? `가장 많이 골라요 / ${r.discount}%` : `${r.discount}% 할인`}</span></div>
                                        )}
                                        <div className="osc-pack-won">{r.won.toLocaleString()}원</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {errorMsg && <div className="osc-error" role="alert">{errorMsg}</div>}

                        <button type="button" className="osc-pay" onClick={handlePay} disabled={paying}>
                            {paying ? '결제창을 여는 중…' : `${pack.won.toLocaleString()}원 결제하기`}
                        </button>
                        <p className="osc-note">한 번 사면 끝. 정기 결제가 아니에요.</p>
                        <p className="osc-note">
                            산 날부터 7일 안에 한 개도 안 쓰셨으면 전액 돌려드려요. 일부만 쓰셨다면 남은 만큼 돌려드립니다.{' '}
                            <Link href="/refund">자세히 보기</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
