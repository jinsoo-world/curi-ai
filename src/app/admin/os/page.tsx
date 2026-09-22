'use client'

// /admin/os — 관리자 「봇 OS」 한눈에 보기. 숫자는 /api/admin/os/overview 가 준다.
// 개인정보(본문·이메일·전화)는 화면에 없다. 사용자 id 는 앞 8자, 요약은 60자.

import { useEffect, useState } from 'react'

interface Ratio { num: number; den: number; pct: number | null; label: string }
type StatusCounts = { pending: number; allowed: number; denied: number; edited_allowed: number }

interface Overview {
    generatedAt: string
    missingTables: string[]
    team: { teams: number; bots: number; roles: Record<string, number> } | null
    approvals: { today: StatusCounts; week: StatusCounts; decidedWeek: Ratio } | null
    checkins: { rows: number; days: number; users: number } | null
    nextSteps: { open: number; overdue: number; overdueRatio: Ratio } | null
    messages: Record<string, { sent: number; blocked: number; failed: number }> | null
    rateLimitTop: Array<{ key: string; count: number }> | null
    driver: { picked: string; env: Record<string, boolean> }
    recentApprovals: Array<{ id: string; user: string; action: string; summary: string; status: string; at: string }> | null
    recentMessages: Array<{ id: string; channel: string; status: string; toHint: string; error: string | null; at: string }> | null
}

const ROLE_LABEL: Record<string, string> = { twin: '트윈', chief: '비서실장', helper: '도우미' }
const ACTION_LABEL: Record<string, string> = {
    send_message: '보내기', publish: '게시', purchase: '구매', transfer: '이체',
    delete: '삭제', change_permission: '권한 변경', accept_terms: '약관 동의', other: '기타',
}
const STATUS_LABEL: Record<string, string> = {
    pending: '대기', allowed: '허용', denied: '거절', edited_allowed: '고쳐서 허용', expired: '만료',
    sent: '보냄', blocked: '막힘', failed: '실패',
}
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
    pending: { bg: '#fef3c7', fg: '#92400e' },
    allowed: { bg: '#dcfce7', fg: '#166534' },
    edited_allowed: { bg: '#dbeafe', fg: '#1e40af' },
    denied: { bg: '#fee2e2', fg: '#991b1b' },
    expired: { bg: '#f1f5f9', fg: '#64748b' },
    sent: { bg: '#dcfce7', fg: '#166534' },
    blocked: { bg: '#fef3c7', fg: '#92400e' },
    failed: { bg: '#fee2e2', fg: '#991b1b' },
}
const CHANNEL_LABEL: Record<string, string> = { push: '푸시', sms: '문자', email: '이메일' }

export default function AdminOsPage() {
    const [data, setData] = useState<Overview | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/admin/os/overview')
            .then(async r => {
                if (!r.ok) throw new Error(`불러오기 실패 (${r.status})`)
                return r.json() as Promise<Overview>
            })
            .then(setData)
            .catch(e => setError(e instanceof Error ? e.message : '불러오기 실패'))
            .finally(() => setLoading(false))
    }, [])

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
    if (error || !data) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>{error || '데이터가 없어요'}</div>

    const a = data.approvals
    const sumWeek = a ? a.week.pending + a.week.allowed + a.week.denied + a.week.edited_allowed : null
    const sumToday = a ? a.today.pending + a.today.allowed + a.today.denied + a.today.edited_allowed : null

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>🤝 봇 OS</h1>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 8 }}>
                사용자들의 봇 팀·승인 카드·체크인·미룬 일·메시지·요청 제한을 한눈에 봅니다. 본문·이메일·전화는 여기 없습니다.
            </p>
            <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 24 }}>
                기준 시각 {fmtTime(data.generatedAt)} · 「오늘」은 서울 0시부터 · 「7일」은 지금부터 7일 전까지
            </p>

            {data.missingTables.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 12, padding: '12px 16px', fontSize: 13, marginBottom: 24 }}>
                    아직 안 만든 표 {data.missingTables.length}개: {data.missingTables.join(', ')} — 해당 칸은 「표 없음」으로 나옵니다. supabase/migrations 를 실행하면 채워집니다.
                </div>
            )}

            {/* 숫자 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
                <StatCard label="봇을 둔 사용자(팀)" value={data.team?.teams} color="#4f46e5" />
                <StatCard label="봇 수" value={data.team?.bots} color="#4f46e5"
                    sub={data.team ? Object.entries(data.team.roles).map(([r, n]) => `${ROLE_LABEL[r] || r} ${n}`).join(' · ') || '역할 없음' : undefined} />
                <StatCard label="승인 카드 대기" value={a?.week.pending} color="#d97706"
                    sub={a ? `오늘 ${a.today.pending} · 7일 ${a.week.pending}` : undefined} />
                <StatCard label="승인 카드 결정(7일)" value={a ? a.decidedWeek.label : null} color="#16a34a"
                    sub={a ? `허용 ${a.week.allowed} · 고쳐서 ${a.week.edited_allowed} · 거절 ${a.week.denied}` : undefined} />
                <StatCard label="승인 카드 전체" value={sumWeek} color="#334155"
                    sub={sumToday !== null ? `오늘 ${sumToday} · 7일 ${sumWeek}` : undefined} />
                <StatCard label="체크인 날 수(7일)" value={data.checkins ? `${data.checkins.days}/7` : null} color="#0891b2"
                    sub={data.checkins ? `${data.checkins.rows}건 · ${data.checkins.users}명` : undefined} />
                <StatCard label="미룬 일(기한 지남)" value={data.nextSteps?.overdue} color="#dc2626"
                    sub={data.nextSteps ? `열린 일 중 ${data.nextSteps.overdueRatio.label}` : undefined} />
                <StatCard label="열린 다음 걸음" value={data.nextSteps?.open} color="#334155" />
                <StatCard label="대화 모델 드라이버" value={data.driver.picked === 'none' ? '쉬는 중' : data.driver.picked} color={data.driver.picked === 'none' ? '#dc2626' : '#16a34a'}
                    sub={Object.entries(data.driver.env).map(([k, v]) => `${v ? '✅' : '❌'} ${k}`).join('  ')} />
            </div>

            {/* 메시지 채널 + 요청 제한 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
                <Panel title="메시지 채널별(7일)">
                    {data.messages === null ? <Empty text="표 없음 (message_log)" /> : Object.keys(data.messages).length === 0 ? <Empty text="7일간 보낸 메시지가 없어요" /> : (
                        <table style={tableStyle}>
                            <thead><tr style={theadRow}><th style={thStyle}>채널</th><th style={thStyle}>보냄</th><th style={thStyle}>막힘</th><th style={thStyle}>실패</th><th style={thStyle}>보냄 비율</th></tr></thead>
                            <tbody>
                                {Object.entries(data.messages).map(([ch, c]) => {
                                    const total = c.sent + c.blocked + c.failed
                                    return (
                                        <tr key={ch} style={trStyle}>
                                            <td style={tdStyle}><strong>{CHANNEL_LABEL[ch] || ch}</strong></td>
                                            <td style={tdStyle}>{c.sent}</td>
                                            <td style={tdStyle}>{c.blocked}</td>
                                            <td style={tdStyle}>{c.failed}</td>
                                            <td style={tdStyle}>{c.sent}/{total} ({total > 0 ? (c.sent / total * 100).toFixed(1) : '—'}%)</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </Panel>
                <Panel title="요청 제한 상위 5 (최근 1시간, 열쇠는 가림)">
                    {data.rateLimitTop === null ? <Empty text="표 없음 (rate_limits)" /> : data.rateLimitTop.length === 0 ? <Empty text="최근 1시간 요청 기록이 없어요" /> : (
                        <table style={tableStyle}>
                            <thead><tr style={theadRow}><th style={thStyle}>열쇠</th><th style={thStyle}>횟수</th></tr></thead>
                            <tbody>
                                {data.rateLimitTop.map(r => (
                                    <tr key={r.key} style={trStyle}>
                                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.key}</td>
                                        <td style={tdStyle}>{r.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Panel>
            </div>

            {/* 최근 승인 카드 */}
            <Panel title="최근 승인 카드 20건" style={{ marginBottom: 32 }}>
                {data.recentApprovals === null ? <Empty text="표 없음 (permission_requests)" /> : data.recentApprovals.length === 0 ? <Empty text="아직 승인 카드가 없어요" /> : (
                    <table style={tableStyle}>
                        <thead><tr style={theadRow}><th style={thStyle}>시각</th><th style={thStyle}>사용자</th><th style={thStyle}>행동</th><th style={thStyle}>요약</th><th style={thStyle}>상태</th></tr></thead>
                        <tbody>
                            {data.recentApprovals.map(r => (
                                <tr key={r.id} style={trStyle}>
                                    <td style={{ ...tdStyle, color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime(r.at)}</td>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.user}</td>
                                    <td style={tdStyle}>{ACTION_LABEL[r.action] || r.action}</td>
                                    <td style={{ ...tdStyle, maxWidth: 420 }}>{r.summary}</td>
                                    <td style={tdStyle}><Badge status={r.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Panel>

            {/* 최근 메시지 로그 */}
            <Panel title="최근 메시지 기록 20건 (받는 곳은 끝 4자만)">
                {data.recentMessages === null ? <Empty text="표 없음 (message_log)" /> : data.recentMessages.length === 0 ? <Empty text="아직 메시지 기록이 없어요" /> : (
                    <table style={tableStyle}>
                        <thead><tr style={theadRow}><th style={thStyle}>시각</th><th style={thStyle}>채널</th><th style={thStyle}>상태</th><th style={thStyle}>받는 곳</th><th style={thStyle}>오류·이유</th></tr></thead>
                        <tbody>
                            {data.recentMessages.map(r => (
                                <tr key={r.id} style={trStyle}>
                                    <td style={{ ...tdStyle, color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime(r.at)}</td>
                                    <td style={tdStyle}>{CHANNEL_LABEL[r.channel] || r.channel}</td>
                                    <td style={tdStyle}><Badge status={r.status} /></td>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 12 }}>{r.toHint}</td>
                                    <td style={{ ...tdStyle, color: r.error ? '#991b1b' : '#94a3b8' }}>{r.error || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Panel>
        </div>
    )
}

// ---------- 조각 ----------

function fmtTime(iso: string): string {
    const d = new Date(iso)
    return `${d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
}

/** value 가 null/undefined 면 「표 없음」 */
function StatCard({ label, value, sub, color }: { label: string; value: number | string | null | undefined; sub?: string; color: string }) {
    const missing = value === null || value === undefined
    return (
        <div style={{ background: '#fff', borderRadius: 14, padding: '18px 18px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: missing ? 16 : 26, fontWeight: 800, color: missing ? '#cbd5e1' : color, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                {missing ? '표 없음' : typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {sub && !missing && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>{sub}</div>}
        </div>
    )
}

function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', ...style }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{title}</div>
            {children}
        </div>
    )
}

function Empty({ text }: { text: string }) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{text}</div>
}

function Badge({ status }: { status: string }) {
    const c = STATUS_COLOR[status] || { bg: '#f1f5f9', fg: '#64748b' }
    return (
        <span style={{ display: 'inline-flex', background: c.bg, color: c.fg, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {STATUS_LABEL[status] || status}
        </span>
    )
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
const theadRow: React.CSSProperties = { background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }
const trStyle: React.CSSProperties = { borderBottom: '1px solid #f1f5f9' }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 16px', fontWeight: 700, color: '#475569', fontSize: 12 }
const tdStyle: React.CSSProperties = { padding: '10px 16px', color: '#1e293b', verticalAlign: 'top' }
