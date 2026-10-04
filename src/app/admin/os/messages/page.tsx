'use client'

// /admin/os/messages — 메시지 엔진 (메시지엔진 설계서 1002 1차 2·5·6번)
//   ① 유형 장부: 유형마다 켬/끔. 처음엔 이미 운영에서 나가던 것만 켬
//   ② 보냄·막힘 기록: 유형별 보냄/막힘/실패 수와 막힌 이유, 최근 기록(받는 곳은 끝 4자, 본문 없음)
//   ③ 캠페인: 초안 → 대표 기기로 시험 → 대표 승인(3시간) → 예약 → 보냄
// 관리자 확인은 admin/layout.tsx 의 requireAdmin, 창구는 requireAdminAPI 가 한다.

import { useCallback, useEffect, useState } from 'react'

interface TypeRow {
    type: string; name: string; category: 'info' | 'ad'; routes: string[]; audience: string; defaultOn: boolean
    toggleable: boolean; viaGateway: boolean; note: string; on: boolean; override: { updated_at: string } | null
}
interface LogRow {
    id: string; created_at: string; user_id: string; route: string | null; channel: string; msg_type: string | null; category: string | null
    campaign_key: string | null; status: string; reason: string | null; to_hint: string | null; is_test: boolean | null; devices_sent: number | null; opened_at: string | null
}
interface Overview {
    days: number; missing: string[]; types: TypeRow[]; truncated: boolean
    byType: Record<string, { sent: number; blocked: number; failed: number; reasons: Record<string, number> }>
    recent: LogRow[]
}
interface Campaign {
    id: string; key: string; msgType: string; route: string; title: string; body: string; status: string; recipientCount: number | null
    sendAt: string | null; testedAt: string | null; approvedAt: string | null; approvalExpiresAt: string | null; lastError: string | null
    results: Record<string, number>; audience: { kind: string; userIds?: string[] }
}

const REASON: Record<string, string> = {
    unknown_type: '장부에 없는 유형', type_off: '유형 꺼짐', route_not_allowed: '안 쓰는 채널', ad_not_allowed: '남에게 광고',
    sms_ad_disabled: '광고 문자 금지', ad_title_prefix: '(광고) 표시 없음', ad_quiet_hours: '광고 금지 시간(21~08시)',
    ad_no_consent: '광고 동의 없음', ad_no_unsubscribe: '수신 거부 자리 없음', unsubscribe_unavailable: '수신 거부 열쇠 없음',
    suppressed: '받지 않을 사람 명단', duplicate: '이미 보냄(겹침)', daily_cap: '하루 3번 다 씀', ad_daily_cap: '광고 하루 1번',
    ad_weekly_cap: '광고 주 3번', check_failed: '확인 실패(모르면 막음)', quiet_hours: '조용한 시간', channel_off: '채널 꺼 둠',
    sms_disabled: '문자 꺼짐', driver_not_ready: '열쇠 없음', no_permission: '승인 카드 없음', draft_only: '초안만 만드는 봇',
    push_off: '앱 알림 꺼 둠', ad_no_consent_push: '광고 동의 없음',
}
const STATUS: Record<string, string> = {
    draft: '초안', test_sent: '시험함', approved: '승인됨', scheduled: '예약됨', sending: '보내는 중', sent: '보냄', cancelled: '취소',
    blocked: '막힘', failed: '실패', pending: '보내는 중',
}
const ROUTE: Record<string, string> = { app_push: '앱 푸시', web_push: '웹 푸시', email: '메일', sms: '문자' }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e5e7eb' }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }
const btn: React.CSSProperties = { marginRight: 6, marginBottom: 4, padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }
const input: React.CSSProperties = { width: '100%', padding: 8, borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' }

export default function MessagesPage() {
    const [days, setDays] = useState(1)
    const [data, setData] = useState<Overview | null>(null)
    const [camps, setCamps] = useState<{ enabled: boolean; canApprove: boolean; campaigns: Campaign[]; missing?: boolean } | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [form, setForm] = useState({ key: '', msgType: 'CAMPAIGN_AD_PUSH', route: 'app_push', title: '(광고) ', body: '', deeplink: '', audience: 'consented', userIds: '' })
    const [sendAt, setSendAt] = useState<Record<string, string>>({})

    const load = useCallback(async () => {
        setErr(null)
        const [a, b] = await Promise.all([
            fetch(`/api/admin/os/messages?days=${days}`, { cache: 'no-store' }).then(r => r.json().then(j => ({ ok: r.ok, j }))),
            fetch('/api/admin/os/campaigns', { cache: 'no-store' }).then(r => r.json().then(j => ({ ok: r.ok, j }))),
        ])
        if (!a.ok) setErr(a.j.error || '불러오기 실패'); else setData(a.j)
        if (b.ok) setCamps(b.j)
    }, [days])
    useEffect(() => { void load() }, [load])

    const post = async (url: string, body: Record<string, unknown>, tag: string) => {
        setBusy(tag); setErr(null)
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            const j = await res.json().catch(() => ({}))
            if (!res.ok || j.ok === false) throw new Error(j.error || '처리하지 못했어요')
            await load()
            return j
        } catch (e) {
            setErr(e instanceof Error ? e.message : '처리하지 못했어요')
        } finally { setBusy(null) }
    }

    const toggle = (t: TypeRow) => {
        if (!confirm(`${t.type} ${t.name}\n${t.on ? '끄면 이 유형은 아무에게도 안 나가요.' : '켜면 이 유형이 실제 회원에게 나가기 시작해요.'}\n${t.on ? '끌까요?' : '켤까요?'}`)) return
        void post('/api/admin/os/messages', { type: t.type, enabled: !t.on }, t.type)
    }

    const create = () => {
        const audience = form.audience === 'consented' ? { kind: 'consented' } : { kind: 'user_ids', userIds: form.userIds.split(/[\s,]+/).filter(Boolean) }
        void post('/api/admin/os/campaigns', { action: 'create', key: form.key, msgType: form.msgType, route: form.route, title: form.title, body: form.body, deeplink: form.deeplink || null, audience }, 'create')
    }
    const act = (c: Campaign, action: string, extra: Record<string, unknown> = {}) => {
        if (action === 'approve' && !confirm(`「${c.title}」\n대상 ${c.audience.kind === 'consented' ? '광고 동의한 사람 전체' : `${c.audience.userIds?.length ?? 0}명`}\n승인은 3시간 동안만 살아 있어요. 승인할까요?`)) return
        if (action === 'run_now' && !confirm(`「${c.title}」를 ${c.recipientCount ?? '?'}명에게 지금 보낼까요?`)) return
        if (action === 'cancel' && !confirm('이 캠페인을 취소할까요? 되돌릴 수 없어요.')) return
        void post('/api/admin/os/campaigns', { action, id: c.id, ...extra }, c.id + action)
    }

    if (!data) return <div style={{ padding: 40, textAlign: 'center', color: err ? '#ef4444' : '#94a3b8' }}>{err || '로딩 중...'}</div>
    const typeNames = new Map(data.types.map(t => [t.type, t.name]))

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>📨 메시지 엔진</h1>
            <p style={{ color: '#64748b', margin: '0 0 16px', fontSize: 14 }}>
                앱 푸시·웹 푸시·메일·문자는 모두 관문 한 곳을 지나요. 유형이 꺼져 있거나, 광고 동의가 없거나, 하루 3번을 넘거나, 받지 않을 사람 명단에 있으면 막히고 이유가 남아요.
            </p>
            {err && <div style={{ ...card, borderColor: '#fecaca', color: '#991b1b', padding: 12 }}>{err}</div>}
            {data.missing.length > 0 && <div style={{ ...card, borderColor: '#fde68a', color: '#92400e', padding: 12 }}>표가 아직 없어요: {data.missing.join(', ')} (마이그레이션 20261013)</div>}

            <section style={card}>
                <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>① 유형 장부</h2>
                <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>켜는 순간이 그 유형의 대표 승인이에요. 캠페인 유형은 켜도 매번 시험·승인을 따로 거쳐요.</p>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr><th style={th}>유형</th><th style={th}>이름</th><th style={th}>정보/광고</th><th style={th}>채널</th><th style={th}>상태</th><th style={th}>설명</th></tr></thead>
                        <tbody>{data.types.map(t => (
                            <tr key={t.type}>
                                <td style={{ ...td, fontFamily: 'monospace' }}>{t.type}</td>
                                <td style={td}>{t.name}</td>
                                <td style={td}>{t.category === 'ad' ? <b style={{ color: '#b45309' }}>광고</b> : '정보'}</td>
                                <td style={td}>{t.routes.map(r => ROUTE[r] ?? r).join(' · ')}</td>
                                <td style={td}>
                                    <button type="button" disabled={!t.toggleable || busy === t.type} onClick={() => toggle(t)}
                                        style={{ ...btn, background: t.on ? '#dcfce7' : '#f1f5f9', color: t.on ? '#166534' : '#64748b', fontWeight: 700, cursor: t.toggleable ? 'pointer' : 'not-allowed' }}>
                                        {t.on ? '켬' : '꺼짐'}
                                    </button>
                                    {!t.toggleable && <div style={{ fontSize: 11, color: '#94a3b8' }}>끌 수 없음</div>}
                                    {t.override && <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmt(t.override.updated_at)} 바꿈</div>}
                                </td>
                                <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{t.note}{!t.viaGateway && ' (관문 밖)'}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            </section>

            <section style={card}>
                <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>② 보냄·막힘 기록</h2>
                <div style={{ marginBottom: 12 }}>
                    {[1, 7, 30].map(d => <button key={d} type="button" onClick={() => setDays(d)} style={{ ...btn, background: days === d ? '#111' : '#fff', color: days === d ? '#fff' : '#111' }}>{d === 1 ? '최근 24시간' : `최근 ${d}일`}</button>)}
                    {data.truncated && <span style={{ fontSize: 12, color: '#b45309' }}>5,000줄까지만 셌어요</span>}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                    <thead><tr><th style={th}>유형</th><th style={th}>보냄</th><th style={th}>막힘</th><th style={th}>실패</th><th style={th}>막힌·실패 이유</th></tr></thead>
                    <tbody>{Object.entries(data.byType).sort((a, b) => (b[1].sent + b[1].blocked + b[1].failed) - (a[1].sent + a[1].blocked + a[1].failed)).map(([k, v]) => (
                        <tr key={k}>
                            <td style={td}><span style={{ fontFamily: 'monospace' }}>{k}</span> {typeNames.get(k) ?? ''}</td>
                            <td style={td}>{v.sent}</td><td style={td}>{v.blocked}</td><td style={td}>{v.failed}</td>
                            <td style={{ ...td, fontSize: 12 }}>{Object.entries(v.reasons).map(([r, n]) => `${REASON[r] ?? r} ${n}`).join(' · ') || '—'}</td>
                        </tr>
                    ))}</tbody>
                </table>
                {Object.keys(data.byType).length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>이 기간에 기록이 없어요.</p>}
                <details>
                    <summary style={{ cursor: 'pointer', fontSize: 13, color: '#334155' }}>최근 기록 {data.recent.length}줄 보기</summary>
                    <div style={{ overflowX: 'auto', marginTop: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={th}>시각</th><th style={th}>유형</th><th style={th}>채널</th><th style={th}>회원</th><th style={th}>받는 곳</th><th style={th}>결과</th><th style={th}>이유</th><th style={th}>캠페인</th><th style={th}>눌림</th></tr></thead>
                            <tbody>{data.recent.map(r => (
                                <tr key={r.id}>
                                    <td style={td}>{fmt(r.created_at)}</td>
                                    <td style={{ ...td, fontFamily: 'monospace' }}>{r.msg_type ?? '—'}{r.is_test ? ' (시험)' : ''}</td>
                                    <td style={td}>{ROUTE[r.route ?? ''] ?? r.channel}{r.devices_sent ? ` ${r.devices_sent}대` : ''}</td>
                                    <td style={{ ...td, fontFamily: 'monospace' }}>{r.user_id}</td>
                                    <td style={td}>{r.to_hint || '—'}</td>
                                    <td style={td}>{STATUS[r.status] ?? r.status}</td>
                                    <td style={{ ...td, fontSize: 12 }}>{r.reason ? (REASON[r.reason.split(':')[0]] ?? r.reason) + (r.reason.includes(':') ? ` (${r.reason.split(':')[1]})` : '') : '—'}</td>
                                    <td style={td}>{r.campaign_key ?? '—'}</td>
                                    <td style={td}>{r.opened_at ? fmt(r.opened_at) : '—'}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                </details>
            </section>

            <section style={card}>
                <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>③ 캠페인 (여러 명에게 한 번에)</h2>
                <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 12px' }}>
                    초안 → 대표 기기로 시험 → 대표 승인(3시간 동안만) → 예약 → 보냄. 30명 넘으면 승인 없이 예약이 안 돼요. 예약은 매일 서울 10시 10분에 나가고, 그 사이엔 「지금 보내기」로 보내요.
                    {camps && !camps.enabled && <b style={{ color: '#991b1b' }}> 지금 멈춤 스위치가 켜져 있어요(MSG_CAMPAIGNS_ENABLED).</b>}
                    {camps && !camps.canApprove && <b> 시험·승인·지금 보내기는 승인권자만 눌러요.</b>}
                </p>
                {camps?.missing && <p style={{ color: '#92400e', fontSize: 13 }}>캠페인 표가 아직 없어요(마이그레이션 20261013).</p>}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 12 }}>캠페인 열쇠 (YYMMDD_짧은이름)<input style={input} value={form.key} placeholder="261004_newbot" onChange={e => setForm({ ...form, key: e.target.value })} /></label>
                    <label style={{ fontSize: 12 }}>유형<select style={input} value={form.msgType} onChange={e => setForm({ ...form, msgType: e.target.value })}>
                        {data.types.filter(t => t.audience === 'campaign').map(t => <option key={t.type} value={t.type}>{t.type} {t.name}{t.on ? '' : ' (꺼짐)'}</option>)}
                    </select></label>
                    <label style={{ fontSize: 12 }}>채널<select style={input} value={form.route} onChange={e => setForm({ ...form, route: e.target.value })}>
                        {(data.types.find(t => t.type === form.msgType)?.routes ?? []).map(r => <option key={r} value={r}>{ROUTE[r]}</option>)}
                    </select></label>
                    <label style={{ fontSize: 12 }}>대상<select style={input} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>
                        <option value="consented">그 채널 광고 동의한 사람 전체</option><option value="user_ids">회원 번호 목록</option>
                    </select></label>
                </div>
                {form.audience === 'user_ids' && <textarea style={{ ...input, height: 60, marginBottom: 8 }} placeholder="회원 번호(uuid)를 쉼표나 줄바꿈으로" value={form.userIds} onChange={e => setForm({ ...form, userIds: e.target.value })} />}
                <input style={{ ...input, marginBottom: 8 }} placeholder="제목 (광고는 「(광고)」로 시작)" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                <textarea style={{ ...input, height: 80, marginBottom: 8 }} placeholder="본문 (광고 메일은 {{unsubscribe_url}} 자리 필수)" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
                <input style={{ ...input, marginBottom: 8 }} placeholder="누르면 갈 곳 (curiai://… 또는 /os…, 비우면 홈)" value={form.deeplink} onChange={e => setForm({ ...form, deeplink: e.target.value })} />
                <button type="button" style={{ ...btn, background: '#111', color: '#fff' }} disabled={busy === 'create'} onClick={create}>초안 만들기</button>

                <div style={{ overflowX: 'auto', marginTop: 16 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr><th style={th}>열쇠</th><th style={th}>제목</th><th style={th}>채널</th><th style={th}>상태</th><th style={th}>인원</th><th style={th}>시험·승인·예약</th><th style={th}>결과</th><th style={th}>할 일</th></tr></thead>
                        <tbody>{(camps?.campaigns ?? []).map(c => (
                            <tr key={c.id}>
                                <td style={{ ...td, fontFamily: 'monospace' }}>{c.key}</td>
                                <td style={td}>{c.title}<div style={{ fontSize: 11, color: '#94a3b8' }}>{c.msgType}</div></td>
                                <td style={td}>{ROUTE[c.route]}</td>
                                <td style={td}>{STATUS[c.status] ?? c.status}{c.lastError && <div style={{ fontSize: 11, color: '#991b1b' }}>{c.lastError}</div>}</td>
                                <td style={td}>{c.recipientCount ?? '—'}</td>
                                <td style={{ ...td, fontSize: 12 }}>시험 {fmt(c.testedAt)}<br />승인 {fmt(c.approvedAt)}{c.approvalExpiresAt && ` (~${fmt(c.approvalExpiresAt)})`}<br />예약 {fmt(c.sendAt)}</td>
                                <td style={{ ...td, fontSize: 12 }}>{Object.entries(c.results).map(([k, n]) => `${STATUS[k] ?? k} ${n}`).join(' · ') || '—'}</td>
                                <td style={td}>
                                    {['draft', 'test_sent', 'approved'].includes(c.status) && <button type="button" style={btn} disabled={!!busy} onClick={() => act(c, 'test')}>내 기기로 시험</button>}
                                    {['test_sent', 'approved'].includes(c.status) && <button type="button" style={btn} disabled={!!busy} onClick={() => act(c, 'approve')}>대표 승인</button>}
                                    {['test_sent', 'approved'].includes(c.status) && (
                                        <span style={{ display: 'inline-block' }}>
                                            <input type="datetime-local" style={{ ...btn, padding: 4 }} value={sendAt[c.id] ?? ''} onChange={e => setSendAt({ ...sendAt, [c.id]: e.target.value })} />
                                            <button type="button" style={btn} disabled={!!busy || !sendAt[c.id]} onClick={() => act(c, 'schedule', { sendAt: new Date(sendAt[c.id]).toISOString() })}>예약</button>
                                        </span>
                                    )}
                                    {['scheduled', 'sending'].includes(c.status) && <button type="button" style={btn} disabled={!!busy} onClick={() => act(c, 'run_now')}>지금 보내기</button>}
                                    {!['sent', 'cancelled'].includes(c.status) && <button type="button" style={{ ...btn, color: '#991b1b' }} disabled={!!busy} onClick={() => act(c, 'cancel')}>취소</button>}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                    {camps && camps.campaigns.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>아직 캠페인이 없어요.</p>}
                </div>
            </section>
        </div>
    )
}
