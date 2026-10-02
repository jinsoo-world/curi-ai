'use client'

// 고객센터 문의 칸. 보내는 곳 = /api/support/inquiry. 검사 규칙은 서버(domains/support/inquiry.ts)가 정본이다.
import { useState } from 'react'
import { INQUIRY_CATEGORIES, BODY_MIN, BODY_MAX } from '@/domains/support/inquiry'

const label: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: '#18181b', margin: '18px 0 6px' }
const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '12px 14px', borderRadius: 12,
    border: '1px solid #e5e7eb', background: '#fff', color: '#18181b', fontFamily: 'inherit',
}

export default function SupportForm({ platform, appVersion }: { platform: string; appVersion: string }) {
    const [category, setCategory] = useState('')
    const [email, setEmail] = useState('')
    const [body, setBody] = useState('')
    const [website, setWebsite] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [done, setDone] = useState(false)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErr(null)
        if (!category) { setErr('문의 유형을 골라 주세요'); return }
        if (body.trim().length < BODY_MIN) { setErr(`내용을 ${BODY_MIN}자 이상 적어 주세요`); return }
        setBusy(true)
        try {
            const res = await fetch('/api/support/inquiry', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, email, body, platform, appVersion, website }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '문의를 보내지 못했어요. 잠시 뒤 다시 해 주세요.')
            setDone(true)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '문의를 보내지 못했어요. 잠시 뒤 다시 해 주세요.')
        } finally {
            setBusy(false)
        }
    }

    if (done) {
        return (
            <div role="status" style={{ background: '#dcfce7', color: '#166534', padding: '16px 18px', borderRadius: 12, fontSize: 15, lineHeight: 1.7 }}>
                문의를 받았어요. 영업일 기준 2일 안에 이메일로 답할게요
            </div>
        )
    }

    return (
        <form onSubmit={submit} noValidate>
            <label htmlFor="support-category" style={{ ...label, marginTop: 0 }}>문의 유형</label>
            <select id="support-category" required value={category} onChange={e => setCategory(e.target.value)} style={field}>
                <option value="">골라 주세요</option>
                {INQUIRY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <label htmlFor="support-email" style={label}>답을 받을 이메일</label>
            <input id="support-email" type="email" required autoComplete="email" inputMode="email" maxLength={254}
                value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" style={field} />

            <label htmlFor="support-body" style={label}>내용</label>
            <textarea id="support-body" required minLength={BODY_MIN} maxLength={BODY_MAX} rows={7}
                value={body} onChange={e => setBody(e.target.value)} placeholder="어떤 일이 있었는지 적어 주세요" style={{ ...field, resize: 'vertical' }} />
            <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right', marginTop: 4 }}>{body.length} / {BODY_MAX}</div>

            {/* 사람 눈에는 안 보이는 칸. 채워져 오면 기계로 본다 */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor="support-website">웹사이트</label>
                <input id="support-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
            </div>

            {err && <div role="alert" style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 10, marginTop: 14, fontSize: 14 }}>{err}</div>}

            <button type="submit" disabled={busy} style={{
                width: '100%', marginTop: 18, minHeight: 48, fontSize: 16, fontWeight: 700, borderRadius: 12, border: 0,
                background: busy ? '#9ca3af' : '#03C124', color: '#fff', cursor: busy ? 'default' : 'pointer',
            }}>{busy ? '보내는 중' : '문의 보내기'}</button>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '10px 0 0', lineHeight: 1.6 }}>
                답을 드리려고 이메일과 문의 내용을 받아요. 자세한 내용은 개인정보처리방침에 있어요.
            </p>
        </form>
    )
}
