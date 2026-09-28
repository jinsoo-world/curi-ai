// 관리자 「가입 온보딩」 (대표 승인 0928). 기간(KST) 안 가입자의 흐름: 가입 → 온보딩 시작 → 완료 → 첫 봇 → 첫 메시지,
// 그리고 알게 된 경로, 기기, 앱 여부, 업종, 나이대, 맡길 일, 강의나 모임 운영, utm 나눔. CSV 로 내려받는다.
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { kstRange, loadOnboarding, summarizeOnboarding, type Breakdown } from '@/domains/os/onboarding-admin'
import { ACQUISITION, USE_CASES, AGE_BANDS, OCCUPATIONS, RUNS, labelOf } from '@/domains/os/onboarding'

export const dynamic = 'force-dynamic'

const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '')

function Table({ title, data }: { title: string; data: Breakdown }) {
    const total = data.reduce((s, x) => s + x.count, 0)
    return (
        <div style={card}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
            {data.length === 0 ? <div style={{ color: '#888' }}>아직 없어요</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <tbody>
                        {data.map(x => (
                            <tr key={x.key} style={{ borderTop: '1px solid #f0f0f0' }}>
                                <td style={{ padding: '6px 0' }}>{x.label}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{x.count}</td>
                                <td style={{ textAlign: 'right', color: '#888', width: 56 }}>{pct(x.count, total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}

export default async function OnboardingAdminPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
    await requireAdmin()
    const sp = await searchParams
    const range = kstRange(sp.from, sp.to)
    let error = ''
    let d: Awaited<ReturnType<typeof loadOnboarding>> = { users: [], rows: [], botOwners: new Set(), chatUsers: new Set() }
    try {
        d = await loadOnboarding(createAdminClient(), range.startIso, range.endIso)
    } catch (e) {
        error = e instanceof Error ? e.message : '읽지 못했어요'
    }
    const s = summarizeOnboarding(d.users, d.rows, d.botOwners, d.chatUsers)
    const f = s.funnel
    const steps: [string, number][] = [['가입', f.signups], ['온보딩 시작', f.started], ['온보딩 완료', f.done], ['첫 봇', f.firstBot], ['첫 메시지', f.firstMessage]]
    const byId = new Map(d.rows.map(r => [r.user_id, r]))
    const q = `from=${range.from}&to=${range.to}`

    return (
        <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>🧭 가입 온보딩</h1>
            <p style={{ color: '#666', marginBottom: 18 }}>기간 안에 가입한 분 기준 (KST). 온보딩은 2026-09-28 23시 이후 가입자에게만 떠요.</p>
            <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                <input type="date" name="from" defaultValue={range.from} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <span>부터</span>
                <input type="date" name="to" defaultValue={range.to} style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                <span>까지</span>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#1a1a2e', color: '#fff', fontWeight: 700 }}>보기</button>
                <a href={`/api/admin/onboarding/csv?${q}`} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', color: '#1a1a2e', fontWeight: 700, textDecoration: 'none' }}>CSV 내려받기</a>
            </form>
            {error && <div style={{ ...card, color: '#c00', marginBottom: 16 }}>읽기 오류: {error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
                {steps.map(([label, n], i) => (
                    <div key={label} style={card}>
                        <div style={{ color: '#666', fontSize: 13 }}>{label}</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{n}</div>
                        <div style={{ color: '#888', fontSize: 12 }}>{i === 0 ? '' : `가입 대비 ${pct(n, f.signups) || '0%'}`}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
                <Table title="알게 된 경로" data={s.bySource} />
                <Table title="기기" data={s.byDevice} />
                <Table title="앱 여부" data={s.byShell} />
                <Table title="업종" data={s.byOccupation} />
                <Table title="나이대" data={s.byAge} />
                <Table title="먼저 맡길 일" data={s.byUseCase} />
                <Table title="강의나 모임 운영" data={s.byRuns} />
                <Table title="utm_source" data={s.byUtm} />
            </div>

            <div style={card}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>가입자 ({d.users.length})</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, whiteSpace: 'nowrap' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#666' }}>
                                {['가입(KST)', '이름', '온보딩', '경로', '초대', '맡길 일', '나이대', '업종', '강의모임', '기기', '앱', 'utm', '첫 봇', '첫 메시지'].map(h => <th key={h} style={{ padding: '6px 8px' }}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {d.users.map(u => {
                                const r = byId.get(u.id)
                                return (
                                    <tr key={u.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '6px 8px' }}>{new Date(Date.parse(u.created_at) + 9 * 3600_000).toISOString().replace('T', ' ').slice(5, 16)}</td>
                                        <td style={{ padding: '6px 8px' }} title={u.email || ''}>{u.display_name || u.email || u.id.slice(0, 8)}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.status ?? ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.acquisition_source ? labelOf(ACQUISITION, r.acquisition_source) : ''}{r?.acquisition_detail ? ` (${r.acquisition_detail})` : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.referral_code ? `${r.referral_code} ${r.referral_via ?? ''}` : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{(r?.use_cases ?? []).map(x => labelOf(USE_CASES, x)).join(', ')}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.age_band ? labelOf(AGE_BANDS, r.age_band) : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.occupation ? labelOf(OCCUPATIONS, r.occupation) : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.runs_class_or_group ? labelOf(RUNS, r.runs_class_or_group) : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.device ?? ''}{r?.os ? ` ${r.os}` : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.app_shell ?? ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{r?.utm_source ?? ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{d.botOwners.has(u.id) ? 'Y' : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{d.chatUsers.has(u.id) ? 'Y' : ''}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
