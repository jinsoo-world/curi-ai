'use client'
// 정산 정보 (/os/payout) = 리더가 돈을 받으려면 먼저 넣는 칸. 이름, 이메일, 휴대폰, 생년월일, 은행, 계좌번호, 예금주, 동의.
// 계좌는 서버가 잠가서 넣고, 여기엔 뒤 4자리만 다시 보인다. 정산 금액 산식은 아직 없다(「정산 기준은 준비 중이에요」).
// 손님 = 4060 리더. 글자는 크게, 단추는 44px 이상, 색은 [data-theme="os"] 토큰만.

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PayoutView {
    legalName: string; email: string; phone: string; birthDate: string; bankName: string
    accountLast4: string; accountHolder: string; agreedAt: string; updatedAt: string
}

interface Form {
    legalName: string; email: string; phone: string; birthDate: string; bankName: string
    accountNumber: string; accountHolder: string; agreed: boolean
}

const EMPTY: Form = { legalName: '', email: '', phone: '', birthDate: '', bankName: '', accountNumber: '', accountHolder: '', agreed: false }

export default function PayoutPage() {
    const [form, setForm] = useState<Form>(EMPTY)
    const [saved, setSaved] = useState<PayoutView | null>(null)
    const [banks, setBanks] = useState<string[]>([])
    const [enabled, setEnabled] = useState(true)
    const [loaded, setLoaded] = useState(false)
    const [guest, setGuest] = useState(false)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
    const [editing, setEditing] = useState(false)

    useEffect(() => {
        let alive = true
        ;(async () => {
            try {
                const r = await fetch('/api/os/payout', { cache: 'no-store' })
                if (r.status === 401) { if (alive) { setGuest(true); setLoaded(true) } ; return }
                const d = await r.json().catch(() => ({})) as { profile?: PayoutView | null; enabled?: boolean; banks?: string[]; defaultEmail?: string }
                if (!alive) return
                setBanks(Array.isArray(d.banks) ? d.banks : [])
                setEnabled(d.enabled !== false)
                if (d.profile) {
                    setSaved(d.profile)
                    setForm({
                        legalName: d.profile.legalName, email: d.profile.email, phone: d.profile.phone, birthDate: d.profile.birthDate,
                        bankName: d.profile.bankName, accountNumber: '', accountHolder: d.profile.accountHolder, agreed: true,
                    })
                } else {
                    setForm(f => ({ ...f, email: d.defaultEmail ?? '' }))
                    setEditing(true)
                }
            } catch { /* 화면은 그대로 뜬다 */ }
            finally { if (alive) setLoaded(true) }
        })()
        return () => { alive = false }
    }, [])

    function set<K extends keyof Form>(k: K, v: Form[K]) { setForm(f => ({ ...f, [k]: v })) }

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setBusy(true); setNote(null)
        try {
            const r = await fetch('/api/os/payout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
            const d = await r.json().catch(() => ({})) as { profile?: PayoutView; message?: string; error?: string }
            if (!r.ok || !d.profile) { setNote({ kind: 'err', text: d.error ?? '저장하지 못했어요' }); return }
            setSaved(d.profile)
            setForm(f => ({ ...f, accountNumber: '' }))
            setEditing(false)
            setNote({ kind: 'ok', text: d.message ?? '저장했어요.' })
        } catch { setNote({ kind: 'err', text: '연결이 잠깐 끊겼어요. 다시 눌러 주세요.' }) }
        finally { setBusy(false) }
    }

    if (!loaded) return <div style={wrap}><p style={{ color: 'var(--os-글-연)' }}>불러오는 중이에요</p></div>
    if (guest) {
        return (
            <div style={wrap}>
                <h1 style={h1}>정산 정보</h1>
                <p style={p}>로그인하면 정산 정보를 넣을 수 있어요.</p>
                <Link href="/login?next=/os/payout" className="os-btn primary" style={{ display: 'inline-block', textDecoration: 'none' }}>로그인</Link>
            </div>
        )
    }

    return (
        <div style={wrap}>
            <Link href="/os" style={{ fontSize: 14, color: 'var(--os-글-연)', textDecoration: 'none' }}>← 봇 화면으로</Link>
            <h1 style={h1}>정산 정보</h1>
            <p style={p}>
                내가 만든 봇을 다른 사람이 팀에 넣으면 그 수가 쌓여요. 돈을 받으려면 아래 정보가 먼저 필요해요.
                <br />정산 기준은 준비 중이에요. 기준이 정해지면 여기 넣어 둔 계좌로 보내 드려요.
            </p>

            {!enabled && (
                <div className="os-notice">정산 정보 저장은 준비 중이에요. 관리자가 자물쇠 열쇠를 넣으면 바로 열려요.</div>
            )}

            {saved && !editing && (
                <section style={card}>
                    <h2 style={h2}>저장된 정산 정보</h2>
                    <dl style={dl}>
                        <dt style={dt}>이름</dt><dd style={dd}>{saved.legalName}</dd>
                        <dt style={dt}>이메일</dt><dd style={dd}>{saved.email}</dd>
                        <dt style={dt}>휴대폰</dt><dd style={dd}>{saved.phone}</dd>
                        <dt style={dt}>생년월일</dt><dd style={dd}>{saved.birthDate}</dd>
                        <dt style={dt}>은행</dt><dd style={dd}>{saved.bankName}</dd>
                        <dt style={dt}>계좌</dt><dd style={dd}>****{saved.accountLast4} (뒤 4자리만 보여요)</dd>
                        <dt style={dt}>예금주</dt><dd style={dd}>{saved.accountHolder}</dd>
                        <dt style={dt}>동의한 날</dt><dd style={dd}>{new Date(saved.agreedAt).toLocaleDateString('ko-KR')}</dd>
                    </dl>
                    <button type="button" className="os-btn" onClick={() => { setEditing(true); setNote(null) }}>고치기</button>
                </section>
            )}

            {editing && (
                <form onSubmit={submit} style={card}>
                    <h2 style={h2}>{saved ? '정산 정보 고치기' : '정산 정보 넣기'}</h2>

                    <label style={label}>이름 (실명)
                        <input style={input} value={form.legalName} onChange={e => set('legalName', e.target.value)} autoComplete="name" maxLength={30} required />
                    </label>
                    <label style={label}>이메일
                        <input style={input} type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />
                    </label>
                    <label style={label}>휴대폰 번호
                        <input style={input} type="tel" inputMode="numeric" placeholder="010-0000-0000" value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" required />
                    </label>
                    <label style={label}>생년월일
                        <input style={input} type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} autoComplete="bday" required />
                    </label>
                    <label style={label}>은행
                        <select style={input} value={form.bankName} onChange={e => set('bankName', e.target.value)} required>
                            <option value="">은행을 골라 주세요</option>
                            {banks.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </label>
                    <label style={label}>계좌번호 {saved && <span style={{ color: 'var(--os-글-흐림)', fontWeight: 400 }}>(지금 ****{saved.accountLast4}. 바꾸려면 새로 써 주세요)</span>}
                        <input style={input} inputMode="numeric" placeholder="숫자만" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} autoComplete="off" required />
                    </label>
                    <label style={label}>예금주
                        <input style={input} value={form.accountHolder} onChange={e => set('accountHolder', e.target.value)} maxLength={30} required />
                    </label>

                    <label style={{ ...label, flexDirection: 'row', alignItems: 'flex-start', gap: 10, fontWeight: 400 }}>
                        <input type="checkbox" checked={form.agreed} onChange={e => set('agreed', e.target.checked)} style={{ width: 22, height: 22, marginTop: 2 }} />
                        <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--os-글-연)' }}>
                            정산을 위해 이름, 이메일, 휴대폰, 생년월일, 계좌 정보를 모으는 것에 동의해요. 정산과 세금 신고에만 쓰고, 그만두면 지워 달라고 할 수 있어요.
                        </span>
                    </label>

                    {note && <p role="status" style={{ margin: 0, fontSize: 15, color: note.kind === 'ok' ? 'var(--os-클로버)' : 'var(--os-오류)' }}>{note.text}</p>}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button type="submit" className="os-btn primary" disabled={busy || !enabled}>{busy ? '저장 중이에요' : '저장하기'}</button>
                        {saved && <button type="button" className="os-btn" onClick={() => { setEditing(false); setNote(null) }}>취소</button>}
                    </div>
                </form>
            )}

            {note && !editing && <p role="status" style={{ fontSize: 15, color: note.kind === 'ok' ? 'var(--os-클로버)' : 'var(--os-오류)' }}>{note.text}</p>}

            <p style={{ ...p, fontSize: 13, color: 'var(--os-글-흐림)' }}>
                계좌번호는 서버가 잠가서 저장해요. 화면에는 뒤 4자리만 다시 보여요.
            </p>
        </div>
    )
}

const wrap: React.CSSProperties = { overflow: 'auto', padding: '20px 20px 60px', maxWidth: 560, width: '100%', margin: '0 auto', minHeight: 0, color: 'var(--os-글)' }
const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, margin: '12px 0 8px' }
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 700, margin: '0 0 6px' }
const p: React.CSSProperties = { fontSize: 15, color: 'var(--os-글-연)', lineHeight: 1.6, margin: '0 0 16px' }
const card: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 18, background: 'var(--os-패널)', border: '1px solid var(--os-선)', marginBottom: 16 }
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, fontWeight: 600 }
const input: React.CSSProperties = { minHeight: 48, padding: '10px 12px', borderRadius: 12, border: '1px solid var(--os-선)', background: 'var(--os-말풍선)', color: 'var(--os-글)', fontSize: 16, outline: 0 }
const dl: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', margin: 0, fontSize: 15 }
const dt: React.CSSProperties = { color: 'var(--os-글-흐림)' }
const dd: React.CSSProperties = { margin: 0 }
