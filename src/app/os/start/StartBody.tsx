'use client'
// 새 가입자 온보딩 6화면 (대표 승인 0928 23:15 「온보딩 고쳐, 데이터 저장되도록」).
// 약관 → 알게 된 경로(초대 코드) → 먼저 맡길 일(최대 3개) → 나이대(필수), 성별과 업종(선택)
// → 강의나 모임 운영 → 큐리 축하와 「첫 봇에게 말 걸기」. 화면마다 서버에 바로 저장한다.
// OsShell 은 이 주소에서 뼈대를 그리지 않는다 → data-theme 을 직접 씌운다. 글자 17px 이상, 단추 52px 이상.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BotAvatar from '@/components/os/BotAvatar'
import { JOBS } from '@/domains/os/presets'
import {
    ONBOARDING_TITLE, LEADER_CARD, ACQUISITION, REFERRAL_SOURCES, USE_CASES, MAX_USE_CASES,
    AGE_BANDS, GENDERS, OCCUPATIONS, RUNS, RUNS_NONE, AUDIENCE, AUDIENCE_QUESTION, STEP_ORDER, firstJobFor, SNS_HINT,
    SURVEY_LOCAL_KEY, SURVEY_BOT_LOCAL_KEY, FIRST_SENT_LOCAL_KEY, SURVEY_EVENT, type Choice,
} from '@/domains/os/onboarding'
import { 클로버알림 } from '@/lib/clover-bus'
import './start.css'

type Answers = {
    acquisition_source: string | null
    acquisition_detail: string
    leader_code_entered: string
    use_cases: string[]
    age_band: string | null
    gender: string | null
    occupation: string | null
    runs_class_or_group: string | null
    audience_size_band: string | null
    org_name: string
    leader_contact_ok: boolean
    sns_url: string
}
const EMPTY: Answers = {
    acquisition_source: null, acquisition_detail: '', leader_code_entered: '', use_cases: [],
    age_band: null, gender: null, occupation: null, runs_class_or_group: null, audience_size_band: null,
    org_name: '', leader_contact_ok: false, sns_url: '',
}
const TOTAL = 6

function nativePlatform(): string | null {
    try {
        const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
        if (cap?.isNativePlatform?.()) return cap.getPlatform?.() ?? null
    } catch { /* 웹 */ }
    return null
}
function localIds(): { anonId: string; visitorId: string } {
    try { return { anonId: localStorage.getItem('curi_anon') || '', visitorId: localStorage.getItem('curi_visitor_id') || '' } } catch { return { anonId: '', visitorId: '' } }
}

/** 큰 단추 한 줄에 하나 (한 개 고르기) */
function BigChoices({ list, value, onPick }: { list: Choice[]; value: string | null; onPick: (id: string) => void }) {
    return (
        <div className="onb-big">
            {list.map(c => (
                <button key={c.id} type="button" className="onb-bigbtn" aria-pressed={value === c.id} onClick={() => onPick(c.id)}>{c.label}</button>
            ))}
        </div>
    )
}
/** 작은 칩 (선택 문항) */
function Chips({ list, value, onPick }: { list: Choice[]; value: string | null; onPick: (id: string | null) => void }) {
    return (
        <div className="onb-chips">
            {list.map(c => (
                <button key={c.id} type="button" className="onb-chip" aria-pressed={value === c.id} onClick={() => onPick(value === c.id ? null : c.id)}>{c.label}</button>
            ))}
        </div>
    )
}

export default function StartBody() {
    const router = useRouter()
    const [ready, setReady] = useState(false)
    const [step, setStep] = useState(0)
    const [a, setA] = useState<Answers>(EMPTY)
    const [age, setAge] = useState(false)
    const [terms, setTerms] = useState(false)
    const [privacy, setPrivacy] = useState(false)
    const [marketing, setMarketing] = useState(false)
    const [name, setName] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const [refNote, setRefNote] = useState('')
    // SNS 링크 읽기는 오래 걸려(최대 40초) 기다리지 않고 뒤에서 돌린다. 끝나면 축하 화면에 한 줄
    const [snsNote, setSnsNote] = useState('')
    const loaded = useRef(false)

    useEffect(() => {
        if (loaded.current) return
        loaded.current = true
        void (async () => {
            try {
                const r = await fetch('/api/os/onboarding', { cache: 'no-store' })
                const d = await r.json()
                if (d.guest) { router.replace('/login?next=/os'); return }
                if (!d.show) { router.replace('/os'); return }
                const s = d.answers ?? {}
                setA({
                    ...EMPTY,
                    acquisition_source: s.acquisition_source ?? null,
                    acquisition_detail: s.acquisition_detail ?? '',
                    leader_code_entered: s.leader_code_entered ?? d.refCode ?? '',
                    use_cases: Array.isArray(s.use_cases) ? s.use_cases : [],
                    age_band: s.age_band ?? null,
                    gender: s.gender ?? null,
                    occupation: s.occupation ?? null,
                    runs_class_or_group: s.runs_class_or_group ?? null,
                    audience_size_band: s.audience_size_band ?? null,
                    org_name: s.org_name ?? '',
                    leader_contact_ok: !!s.leader_contact_ok,
                })
                if (d.termsAgreed) { setAge(true); setTerms(true); setPrivacy(true) }
                setMarketing(!!s.marketing_agreed)
                setName(d.displayName ?? null)
                // 이어서 하기 = 저장된 마지막 화면 다음부터 (축하 화면 전까지)
                setStep(Math.min(Math.max(Number(s.step) || 0, 0), TOTAL - 1))
                // 방문 기록을 이 회원에 잇는다 (예전 /mentors 새 회원 처리와 같다)
                const { visitorId } = localIds()
                if (visitorId) {
                    fetch('/api/user/link-visitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) }).catch(() => {})
                }
                setReady(true)
            } catch {
                router.replace('/os')
            }
        })()
    }, [router])

    const save = useCallback(async (key: string, body: Record<string, unknown>): Promise<{ ok: boolean; refOk?: boolean | null; firstJob?: string }> => {
        setBusy(true)
        setErr('')
        try {
            const r = await fetch('/api/os/onboarding', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: key, ...body, nativePlatform: nativePlatform(), ...localIds() }),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok) { setErr(d.error || '저장하지 못했어요. 다시 눌러 주세요.'); return { ok: false } }
            return { ok: true, refOk: d.refOk, firstJob: d.firstJob }
        } catch {
            setErr('인터넷 연결을 확인하고 다시 눌러 주세요.')
            return { ok: false }
        } finally {
            setBusy(false)
        }
    }, [])

    const next = useCallback(async () => {
        const key = STEP_ORDER[step]
        let body: Record<string, unknown> = {}
        if (key === 'terms') body = { age, terms, privacy, marketing }
        if (key === 'source') body = { acquisition_source: a.acquisition_source, acquisition_detail: a.acquisition_detail, leader_code_entered: a.leader_code_entered }
        if (key === 'uses') body = { use_cases: a.use_cases }
        if (key === 'profile') body = { age_band: a.age_band, gender: a.gender, occupation: a.occupation }
        if (key === 'leader') body = { runs_class_or_group: a.runs_class_or_group, audience_size_band: a.audience_size_band, org_name: a.org_name, leader_contact_ok: a.leader_contact_ok }
        const res = await save(key, body)
        if (!res.ok) return
        if (key === 'source' && a.leader_code_entered.trim() && REFERRAL_SOURCES.has(a.acquisition_source || '')) {
            setRefNote(res.refOk ? '초대 코드를 확인했어요.' : '')
        }
        if (key === 'leader' && a.runs_class_or_group !== RUNS_NONE && a.sns_url.trim()) {
            setSnsNote('내 글을 읽는 중이에요')
            fetch('/api/os/sns-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: a.sns_url, source: 'onboarding' }) })
                .then(r => r.json())
                .then((d: { message?: string; error?: string; balance?: number }) => {
                    setSnsNote(d.error || d.message || '')
                    if (typeof d.balance === 'number') 클로버알림(d.balance)
                })
                .catch(() => setSnsNote('링크는 설정에서 다시 넣을 수 있어요'))
        }
        setStep(s => Math.min(s + 1, TOTAL - 1))
        window.scrollTo({ top: 0 })
    }, [step, age, terms, privacy, marketing, a, save])

    const startChat = useCallback(async () => {
        setBusy(true)
        setErr('')
        let mentorId: string | null = null
        try {
            const r = await fetch('/api/os/team/bootstrap', { method: 'POST' })
            const d = await r.json().catch(() => ({}))
            const team: { mentorId: string; oneLiner: string }[] = Array.isArray(d.team) ? d.team : []
            const job = JOBS.find(j => j.id === firstJobFor(a.use_cases))
            mentorId = (team.find(b => job && b.oneLiner === job.oneLiner) ?? team[0])?.mentorId ?? null
        } catch { /* 팀을 못 만들어도 /os 로 보낸다 */ }
        await save('done', { firstBotMentorId: mentorId })
        try {
            if (a.use_cases[0]) localStorage.setItem(SURVEY_LOCAL_KEY, a.use_cases[0])
            if (mentorId) localStorage.setItem(SURVEY_BOT_LOCAL_KEY, mentorId)
            localStorage.removeItem(FIRST_SENT_LOCAL_KEY)
            window.dispatchEvent(new Event(SURVEY_EVENT))
        } catch { /* 저장이 막힌 브라우저 */ }
        router.replace(mentorId ? `/os/chat/${mentorId}` : '/os')
    }, [a.use_cases, save, router])

    const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA(p => ({ ...p, [k]: v }))
    const toggleUse = (id: string) => setA(p => {
        const has = p.use_cases.includes(id)
        if (has) return { ...p, use_cases: p.use_cases.filter(x => x !== id) }
        if (p.use_cases.length >= MAX_USE_CASES) return p
        return { ...p, use_cases: [...p.use_cases, id] }
    })

    const canNext = [
        age && terms && privacy,
        !!a.acquisition_source,
        a.use_cases.length > 0,
        !!a.age_band,
        !!a.runs_class_or_group,
        true,
    ][step]
    const runsYes = !!a.runs_class_or_group && a.runs_class_or_group !== RUNS_NONE
    const allRequired = age && terms && privacy

    if (!ready) {
        return <main className="onb" data-theme="os"><div className="onb-wrap onb-loading" aria-busy="true">잠시만요</div></main>
    }

    return (
        <main className="onb" data-theme="os">
            <div className="onb-wrap">
                <div className="onb-top">
                    {step > 0 && step < TOTAL - 1
                        ? <button type="button" className="onb-back" onClick={() => { setErr(''); setStep(s => s - 1) }} aria-label="이전">‹ 이전</button>
                        : <span />}
                    <span className="onb-count">{step + 1} / {TOTAL}</span>
                </div>
                <div className="onb-bar"><span style={{ width: `${((step + 1) / TOTAL) * 100}%` }} /></div>
                {step < TOTAL - 1 && <div className="onb-kicker">{ONBOARDING_TITLE}</div>}

                {step === 0 && (
                    <section>
                        <h1 className="onb-h1">약관에 동의해 주세요</h1>
                        <label className="onb-check onb-check-all">
                            <input type="checkbox" checked={allRequired} onChange={() => { const v = !allRequired; setAge(v); setTerms(v); setPrivacy(v) }} />
                            <span>필수 약관 모두 동의</span>
                        </label>
                        <label className="onb-check"><input type="checkbox" checked={age} onChange={() => setAge(v => !v)} /><span>만 14세 이상이에요 <em>(필수)</em></span></label>
                        <label className="onb-check"><input type="checkbox" checked={terms} onChange={() => setTerms(v => !v)} /><span>서비스 이용약관 <em>(필수)</em></span><Link href="/terms" target="_blank" className="onb-see">보기</Link></label>
                        <label className="onb-check"><input type="checkbox" checked={privacy} onChange={() => setPrivacy(v => !v)} /><span>개인정보 수집, 이용 <em>(필수)</em></span><Link href="/privacy" target="_blank" className="onb-see">보기</Link></label>
                        <label className="onb-check onb-check-opt"><input type="checkbox" checked={marketing} onChange={() => setMarketing(v => !v)} /><span>소식과 혜택 받기 (알림톡, 문자, 이메일) <em>(선택)</em></span></label>
                    </section>
                )}

                {step === 1 && (
                    <section>
                        <h1 className="onb-h1">큐리AI를 어떻게 알게 되셨어요?</h1>
                        <BigChoices list={ACQUISITION} value={a.acquisition_source} onPick={id => set('acquisition_source', id)} />
                        {(a.acquisition_source === 'ai_chatbot' || a.acquisition_source === 'other') && (
                            <input className="onb-input" value={a.acquisition_detail} maxLength={80}
                                placeholder={a.acquisition_source === 'ai_chatbot' ? '어떤 AI였나요? (선택)' : '어디서 보셨나요? (선택)'}
                                onChange={e => set('acquisition_detail', e.target.value)} />
                        )}
                        {REFERRAL_SOURCES.has(a.acquisition_source || '') && (
                            <input className="onb-input" value={a.leader_code_entered} maxLength={20} autoCapitalize="characters"
                                placeholder="초대 코드가 있으면 넣어 주세요 (선택)" onChange={e => set('leader_code_entered', e.target.value)} />
                        )}
                    </section>
                )}

                {step === 2 && (
                    <section>
                        <h1 className="onb-h1">큐리에게 먼저 맡기고 싶은 일을 골라 주세요</h1>
                        <p className="onb-sub">최대 3개까지 고를 수 있어요</p>
                        {refNote && <p className="onb-ok">{refNote}</p>}
                        <div className="onb-big onb-grid">
                            {USE_CASES.map(c => (
                                <button key={c.id} type="button" className="onb-bigbtn" aria-pressed={a.use_cases.includes(c.id)}
                                    disabled={!a.use_cases.includes(c.id) && a.use_cases.length >= MAX_USE_CASES}
                                    onClick={() => toggleUse(c.id)}>{c.label}</button>
                            ))}
                        </div>
                    </section>
                )}

                {step === 3 && (
                    <section>
                        <h1 className="onb-h1">나이대를 알려 주세요</h1>
                        <BigChoices list={AGE_BANDS} value={a.age_band} onPick={id => set('age_band', id)} />
                        <div className="onb-label">성별 <em>(선택)</em></div>
                        <Chips list={GENDERS} value={a.gender} onPick={id => set('gender', id)} />
                        <div className="onb-label">하시는 일 <em>(선택)</em></div>
                        <Chips list={OCCUPATIONS} value={a.occupation} onPick={id => set('occupation', id)} />
                    </section>
                )}

                {step === 4 && (
                    <section>
                        <h1 className="onb-h1">{AUDIENCE_QUESTION}</h1>
                        <BigChoices list={RUNS} value={a.runs_class_or_group} onPick={id => set('runs_class_or_group', id)} />
                        {runsYes && (
                            <>
                                <div className="onb-card">
                                    <div className="onb-card-title">{LEADER_CARD.title}</div>
                                    <div className="onb-card-line">{LEADER_CARD.line}</div>
                                    <div className="onb-card-note">{LEADER_CARD.note}</div>
                                </div>
                                <div className="onb-label">내 SNS나 블로그 주소 <em>(선택)</em></div>
                                <p className="onb-hint">{SNS_HINT}</p>
                                <input className="onb-input" value={a.sns_url} maxLength={300} inputMode="url" placeholder="https://blog.naver.com/아이디" onChange={e => set('sns_url', e.target.value)} />
                                <div className="onb-label">만나는 분은 몇 명쯤인가요? <em>(선택)</em></div>
                                <Chips list={AUDIENCE} value={a.audience_size_band} onPick={id => set('audience_size_band', id)} />
                                <input className="onb-input" value={a.org_name} maxLength={80} placeholder="채널, 강의, 모임 이름 (선택)" onChange={e => set('org_name', e.target.value)} />
                                <label className="onb-check onb-check-opt">
                                    <input type="checkbox" checked={a.leader_contact_ok} onChange={() => set('leader_contact_ok', !a.leader_contact_ok)} />
                                    <span>리더 프로그램 안내를 받아 볼게요 <em>(선택)</em></span>
                                </label>
                            </>
                        )}
                    </section>
                )}

                {step === 5 && (
                    <section className="onb-done">
                        <div className="onb-mascot"><BotAvatar shape="clover" color="green" state="talking" size={112} name="큐리" /></div>
                        <h1 className="onb-h1">{name ? `${name}님, ` : ''}내 AI 팀이 준비됐어요</h1>
                        <p className="onb-sub">고르신 일에 맞는 봇이 먼저 인사할게요</p>
                        {snsNote && <p className="onb-ok" role="status">{snsNote}</p>}
                    </section>
                )}

                {err && <p className="onb-err" role="alert">{err}</p>}

                <div className="onb-foot">
                    {step < TOTAL - 1
                        ? <button type="button" className="onb-cta" disabled={!canNext || busy} onClick={() => void next()}>{busy ? '저장하는 중' : '다음'}</button>
                        : <button type="button" className="onb-cta" disabled={busy} onClick={() => void startChat()}>{busy ? '준비하는 중' : '첫 봇에게 말 걸기'}</button>}
                </div>
            </div>
        </main>
    )
}
