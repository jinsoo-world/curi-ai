// 관리자 「광고 효과」 (대표 지시 2026-10-05): 어디서 온 사람이 가입하고 결제하나 → 광고비를 어디에 쓸지 정한다.
// 기간(한국 시간)을 고르면 채널, 캠페인, 기기, 가입 설문 답별로 방문, 가입, 결제, 전환율을 보여 준다.
// 관리자 전용 숫자라 사람 수와 퍼센트를 그대로 적는다 (고객 화면에는 쓰지 않는다).
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSummary } from '@/domains/acquisition/query'
import { PRESETS, pickPeriod } from '@/domains/acquisition/period'
import { FULL_VISIT_TRACKING_SINCE } from '@/domains/acquisition/labels'
import { fmtRate, rate, type Cell, type Totals } from '@/domains/acquisition/summarize'

export const dynamic = 'force-dynamic'

const card: React.CSSProperties = { background: 'var(--color-white, #fff)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }
const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-neutral-500, #737373)', fontSize: 13, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const n = (v: number) => v.toLocaleString('ko-KR')
const accent = 'var(--color-primary-700, #02891a)'

function change(cur: number, prev: number): string {
    if (prev === 0) return cur === 0 ? '' : '새로 생김'
    const d = Math.round(((cur - prev) / prev) * 100)
    return `${d > 0 ? '+' : ''}${d}%`
}

function Table({ title, hint, rows, withVisits = true }: { title: string; hint?: string; rows: Cell[]; withVisits?: boolean }) {
    return (
        <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>{title}</div>
            {hint && <div style={{ color: 'var(--color-neutral-500, #737373)', fontSize: 13, marginBottom: 10 }}>{hint}</div>}
            {rows.length === 0 ? <div style={{ color: 'var(--color-neutral-500, #737373)', padding: '8px 0' }}>이 기간에는 기록이 없어요</div> : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-neutral-200, #e5e5e5)' }}>
                                <th style={{ ...th, textAlign: 'left' }}>이름</th>
                                {withVisits && <th style={th}>방문</th>}
                                {withVisits && <th style={th}>방문한 사람</th>}
                                <th style={th}>가입</th>
                                {withVisits && <th style={th}>가입률</th>}
                                <th style={th}>결제</th>
                                <th style={th}>가입 대비 결제율</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.key} style={{ borderTop: '1px solid var(--color-neutral-100, #f5f5f5)' }}>
                                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{r.key}</td>
                                    {withVisits && <td style={td}>{n(r.visits)}</td>}
                                    {withVisits && <td style={td}>{n(r.visitors)}</td>}
                                    <td style={{ ...td, fontWeight: 700 }}>{n(r.signups)}</td>
                                    {withVisits && <td style={td}>{fmtRate(rate(r.signups, r.visitors))}</td>}
                                    <td style={{ ...td, fontWeight: 800, color: r.paid > 0 ? accent : undefined }}>{n(r.paid)}</td>
                                    <td style={td}>{fmtRate(rate(r.paid, r.signups))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function TopLine({ cur, prev }: { cur: Totals; prev: Totals }) {
    const rows: [string, number | string, number | string, string][] = [
        ['방문(창을 연 횟수)', cur.visits, prev.visits, change(cur.visits, prev.visits)],
        ['방문한 사람', cur.visitors, prev.visitors, change(cur.visitors, prev.visitors)],
        ['가입', cur.signups, prev.signups, change(cur.signups, prev.signups)],
        ['결제로 이어진 사람(처음 결제)', cur.paid, prev.paid, change(cur.paid, prev.paid)],
        ['가입률(가입 ÷ 방문한 사람)', fmtRate(rate(cur.signups, cur.visitors)) || '해당 없음', fmtRate(rate(prev.signups, prev.visitors)) || '해당 없음', ''],
        ['결제율(결제 ÷ 가입)', fmtRate(rate(cur.paid, cur.signups)) || '해당 없음', fmtRate(rate(prev.paid, prev.signups)) || '해당 없음', ''],
    ]
    return (
        <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>한눈에 보기</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-neutral-200, #e5e5e5)' }}>
                        <th style={{ ...th, textAlign: 'left' }}>지표</th>
                        <th style={th}>이 기간</th>
                        <th style={th}>바로 앞 같은 기간</th>
                        <th style={th}>달라진 정도</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([name, a, b, c]) => (
                        <tr key={name} style={{ borderTop: '1px solid var(--color-neutral-100, #f5f5f5)' }}>
                            <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{name}</td>
                            <td style={{ ...td, fontWeight: 800, color: accent }}>{typeof a === 'number' ? n(a) : a}</td>
                            <td style={td}>{typeof b === 'number' ? n(b) : b}</td>
                            <td style={{ ...td, color: 'var(--color-neutral-500, #737373)' }}>{c}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default async function AcquisitionPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
    await requireAdmin()
    const sp = await searchParams
    const p = pickPeriod(sp)
    const activeDays = sp.days && PRESETS.some(x => String(x.days) === sp.days) ? Number(sp.days) : null

    let error = ''
    let cur: Awaited<ReturnType<typeof loadSummary>> | null = null
    let prev: Awaited<ReturnType<typeof loadSummary>> | null = null
    try {
        const db = createAdminClient()
        ;[cur, prev] = await Promise.all([loadSummary(db, p), loadSummary(db, p.prev)])
    } catch (e) {
        error = e instanceof Error ? e.message : '읽지 못했어요'
    }

    const startsBeforeFull = p.from < FULL_VISIT_TRACKING_SINCE

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>📣 광고 효과</h1>
            <p style={{ color: 'var(--color-neutral-600, #525252)', marginBottom: 16 }}>
                어디서 들어온 사람이 가입하고 결제하는지 봅니다. 광고비를 어디에 더 쓸지 정할 때 쓰세요. 기간은 한국 시간 기준입니다.
            </p>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                {PRESETS.map(x => {
                    const on = activeDays === x.days
                    return (
                        <Link key={x.days} href={`/admin/acquisition?days=${x.days}`} style={{
                            padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: 'none',
                            border: `1px solid ${on ? '#1a1a2e' : 'var(--color-neutral-200, #e5e5e5)'}`,
                            background: on ? '#1a1a2e' : '#fff', color: on ? '#fff' : 'var(--color-neutral-600, #525252)',
                        }}>{x.label}</Link>
                    )
                })}
                <form method="get" style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8, flexWrap: 'wrap' }}>
                    <input type="date" name="from" defaultValue={p.from} style={{ padding: 7, borderRadius: 8, border: '1px solid var(--color-neutral-300, #d4d4d4)' }} />
                    <span>부터</span>
                    <input type="date" name="to" defaultValue={p.to} style={{ padding: 7, borderRadius: 8, border: '1px solid var(--color-neutral-300, #d4d4d4)' }} />
                    <span>까지</span>
                    <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: '#1a1a2e', color: '#fff', fontWeight: 700 }}>보기</button>
                </form>
            </div>
            <div style={{ color: 'var(--color-neutral-500, #737373)', fontSize: 13, marginBottom: 16 }}>
                보는 기간 {p.from} 부터 {p.to} 까지 ({p.days}일)
            </div>

            {error && <div style={{ ...card, color: 'var(--color-red-600, #dc2626)', marginBottom: 16 }}>읽기 오류: {error}</div>}

            {cur && prev && (
                <>
                    <div style={{
                        background: 'var(--color-amber-50, #fffbeb)', border: '1px solid var(--color-amber-200, #fde68a)', color: 'var(--color-amber-800, #92400e)',
                        borderRadius: 12, padding: '12px 16px', fontSize: 13, lineHeight: 1.6, marginBottom: 16,
                    }}>
                        {startsBeforeFull && <div>방문 숫자는 {FULL_VISIT_TRACKING_SINCE} 부터 주소 표식이나 링크 없이 직접 들어온 방문까지 모두 쌓습니다. 그 전 기간의 방문은 표식이나 바깥 링크가 있던 것만 들어 있어서 가입률이 실제보다 높게 보입니다.</div>}
                        {cur.totals.untrackedSignups > 0 && <div>가입 {n(cur.totals.signups)}명 중 {n(cur.totals.untrackedSignups)}명은 출처 기록을 시작하기 전에 가입했거나 기록이 비어 있어 「추적 전 가입」으로 따로 묶었습니다.</div>}
                        <div>가입과 결제의 출처는 그 사람이 처음 들어온 길 기준입니다. 결제는 처음 결제한 사람만 한 번 셉니다. 아직 결제가 없으면 0으로 보입니다.</div>
                    </div>

                    <TopLine cur={cur.totals} prev={prev.totals} />
                    <Table title="어디서 왔나 (채널별)" hint="표식(utm_source)이 있으면 그 이름, 추천 링크, 바깥 사이트, 직접 들어옴 순서로 이름을 붙입니다" rows={cur.channel} />
                    <Table title="캠페인별" hint="채널 / 캠페인 이름 (utm_campaign)" rows={cur.campaign} />
                    <Table title="기기별" hint="PC, 모바일 웹, 앱. 처음 들어온 기기 기준" rows={cur.device} />
                    <Table title="가입할 때 답한 알게 된 경로" hint="회원이 직접 고른 답입니다. 방문 숫자는 없습니다" rows={cur.survey} withVisits={false} />
                </>
            )}
        </div>
    )
}
