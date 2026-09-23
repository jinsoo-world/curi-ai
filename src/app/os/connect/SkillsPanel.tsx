'use client'
// 스킬 탭 = 깃허브 주소를 붙이면 서버가 SKILL.md(없으면 README.md)를 받아 두고, 고른 봇의 지침 뒤에 얹는다.
// 스킬은 「자료」다. 켜고 끄고, 어느 봇에 붙일지 고르고, 지울 수 있다. 본문은 화면에 안 보여 준다(글자 수만).

import { useCallback, useEffect, useState } from 'react'
import type { SkillView } from '@/domains/os/skills'
import type { TeamBot } from '@/domains/os/types'

const 예시 = 'https://github.com/이름/저장소 또는 https://github.com/이름/저장소/tree/main/skills/이름'

export default function SkillsPanel() {
    const [skills, setSkills] = useState<SkillView[]>([])
    const [team, setTeam] = useState<TeamBot[]>([])
    const [url, setUrl] = useState('')
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [guest, setGuest] = useState(false)
    const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null)

    const load = useCallback(async () => {
        try {
            const [s, t] = await Promise.all([
                fetch('/api/os/skills', { cache: 'no-store' }),
                fetch('/api/os/team', { cache: 'no-store' }),
            ])
            if (s.status === 401) { setGuest(true); setLoaded(true); return }
            const sd = await s.json().catch(() => ({}))
            const td = await t.json().catch(() => ({}))
            setSkills(Array.isArray(sd?.skills) ? sd.skills as SkillView[] : [])
            setTeam(Array.isArray(td?.team) ? td.team as TeamBot[] : [])
        } catch { /* 못 읽어도 화면은 산다 */ }
        setLoaded(true)
    }, [])

    // 효과 본문에서 바로 setState 하지 않는다(린트 규칙) — 한 박자 뒤에 읽어 온다
    useEffect(() => { void Promise.resolve().then(load) }, [load])

    const 가져오기 = async () => {
        const 값 = url.trim()
        if (!값 || busy) return
        setBusy(true); setNote(null)
        try {
            const r = await fetch('/api/os/skills', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 값 }),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) setNote({ text: String(d?.error ?? '가져오지 못했어요'), warn: true })
            else {
                setNote({ text: `「${String(d?.skill?.name ?? '스킬')}」을(를) 가져왔어요 (${String(d?.from ?? 'SKILL.md')}). 아래에서 붙일 봇을 골라 주세요.` })
                setUrl('')
                await load()
            }
        } catch { setNote({ text: '가져오지 못했어요. 잠시 뒤 다시 해 주세요.', warn: true }) }
        setBusy(false)
    }

    const 고치기 = async (id: string, patch: { enabled?: boolean; mentorIds?: string[] }) => {
        // 화면이 먼저 바뀌고, 실패하면 다시 읽어 되돌린다
        setSkills(prev => prev.map(s => s.id === id ? { ...s, ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}), ...(patch.mentorIds ? { mentorIds: patch.mentorIds } : {}) } : s))
        try {
            const r = await fetch('/api/os/skills', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }),
            })
            if (!r.ok) { setNote({ text: '저장 못 했어요. 잠시 뒤 다시 눌러 주세요.', warn: true }); await load() }
        } catch { await load() }
    }

    const 지우기 = async (s: SkillView) => {
        if (!confirm(`「${s.name}」 스킬을 지울까요? 봇 지침에서도 빠져요.`)) return
        setBusy(true); setNote(null)
        try {
            await fetch('/api/os/skills', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
            await load()
        } catch { setNote({ text: '지우지 못했어요.', warn: true }) }
        setBusy(false)
    }

    const 봇토글 = (s: SkillView, mentorId: string) => {
        const next = s.mentorIds.includes(mentorId) ? s.mentorIds.filter(x => x !== mentorId) : [...s.mentorIds, mentorId]
        void 고치기(s.id, { mentorIds: next })
    }

    const 출처 = (u: string) => u.replace(/^https:\/\/(www\.)?github\.com\//, '')

    return (
        <div className="os-card">
            <div style={{ padding: '12px 0' }}>
                <b>깃허브 주소 붙이기</b>
                <div className="os-svc-hint">스킬 폴더나 저장소 주소를 붙이면 SKILL.md(없으면 README.md)를 가져와요. 공개 저장소만 돼요.</div>
                <div className="os-connect-form" style={{ marginTop: 8 }}>
                    <input className="os-connect-input" value={url} placeholder={예시} disabled={guest || busy}
                        onChange={e => setUrl(e.target.value)} autoComplete="off" spellCheck={false} inputMode="url"
                        onKeyDown={e => { if (e.key === 'Enter') void 가져오기() }} />
                    <button type="button" className="os-btn primary" disabled={guest || busy || !url.trim()} onClick={() => void 가져오기()}>가져오기</button>
                </div>
                {guest && <div className="os-svc-hint" style={{ marginTop: 6 }}>로그인하면 스킬을 가져올 수 있어요.</div>}
            </div>

            {note && <div className={`os-connect-note${note.warn ? ' warn' : ''}`} style={{ marginBottom: 8 }}>{note.text}</div>}

            {skills.map(s => (
                <div key={s.id} className="os-skill">
                    <div className="os-skill-head">
                        <div className="os-skill-body">
                            <div className="os-svc-name">
                                <b>{s.name}</b>
                                <span className={`os-svc-badge${s.enabled ? ' on' : ''}`}>{s.enabled ? '켜짐' : '꺼짐'}</span>
                                <span className="os-svc-badge">{s.chars.toLocaleString('ko-KR')}자</span>
                            </div>
                            <div className="os-skill-src" title={s.sourceUrl}>{출처(s.sourceUrl)}</div>
                        </div>
                        <button type="button" role="switch" aria-checked={s.enabled} aria-label={`${s.name} 켜기 끄기`} className="os-connect-switch"
                            disabled={busy} onClick={() => void 고치기(s.id, { enabled: !s.enabled })}><span /></button>
                        <button type="button" className="os-btn" style={{ minHeight: 44 }} disabled={busy} onClick={() => void 지우기(s)}>지우기</button>
                    </div>
                    <div className="os-svc-hint" style={{ marginTop: 8 }}>
                        {team.length === 0 ? '봇을 만들면 어느 봇에 붙일지 고를 수 있어요. 지금은 내 봇 모두에 붙어요.'
                            : s.mentorIds.length === 0 ? '붙일 봇을 고르지 않으면 내 봇 모두에 붙어요.' : `고른 봇 ${s.mentorIds.length}개에만 붙어요.`}
                    </div>
                    {team.length > 0 && (
                        <div className="os-skill-bots">
                            {team.map(b => (
                                <button key={b.id} type="button" className="os-skill-bot" aria-pressed={s.mentorIds.includes(b.mentorId)}
                                    disabled={busy || !s.enabled} onClick={() => 봇토글(s, b.mentorId)}>{b.name}</button>
                            ))}
                        </div>
                    )}
                </div>
            ))}

            {loaded && !guest && skills.length === 0 && (
                <div className="os-svc-hint" style={{ padding: '4px 0 12px' }}>아직 가져온 스킬이 없어요. 위에 깃허브 주소를 붙여 보세요.</div>
            )}
        </div>
    )
}
