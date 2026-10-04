'use client'
// 새 가입자 온보딩 2화면 (대표 승인 1005 03:02 「가입에서 내 봇 보기까지 화면 줄이기」).
// 화면 1 = 알게 된 경로 + 먼저 맡길 일 (+선택 소식 받기) 한 장. 화면 2 = 마침, 「내 봇 만들기」는 /os/make 로.
// /home 이나 /os/make 에서 주소를 넣어 둔 분은 이 화면을 건너뛴다 (status = skipped) → 바로 /os/make 가 이어서 만든다.
// 나이대, 성별, 업종, 강의 운영, SNS 주소 질문은 더 묻지 않는다 (SNS 주소는 만들기 화면과 설정에서 넣는다).
// 약관 화면은 뺐다 (대표 0929 「동의는 받지마」, 로그인 안내문으로 동의).
// OsShell 은 이 주소에서 뼈대를 그리지 않는다 → data-theme 을 직접 씌운다. 글자 17px 이상, 단추 52px 이상.

import { useCallback, useEffect, useRef, useState } from 'react'
import { readHomeDraft } from '@/domains/home/draft-store'
import { useRouter } from 'next/navigation'
import { safeNextPath } from '@/lib/safe-next'
import BotAvatar from '@/components/os/BotAvatar'
import { JOBS } from '@/domains/os/presets'
import {
    ONBOARDING_TITLE, ACQUISITION, REFERRAL_SOURCES, USE_CASES, MAX_USE_CASES, firstJobFor,
    SURVEY_LOCAL_KEY, SURVEY_BOT_LOCAL_KEY, FIRST_SENT_LOCAL_KEY, SURVEY_EVENT, type Choice,
} from '@/domains/os/onboarding'
import { 센다 } from '@/lib/track'
import './start.css'

type Answers = {
    acquisition_source: string | null
    acquisition_detail: string
    leader_code_entered: string
    use_cases: string[]
}
const EMPTY: Answers = { acquisition_source: null, acquisition_detail: '', leader_code_entered: '', use_cases: [] }
const TOTAL = 2
/** 온보딩이 끝나면 가는 만들기 화면 */
const MAKE_PATH = '/os/make'

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
    const [marketing, setMarketing] = useState(false)
    const [name, setName] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const [refNote, setRefNote] = useState('')
    const loaded = useRef(false)

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

    useEffect(() => {
        if (loaded.current) return
        loaded.current = true
        void (async () => {
            try {
                const r = await fetch('/api/os/onboarding', { cache: 'no-store' })
                const d = await r.json()
                if (d.guest) { router.replace('/login?next=/os'); return }
                if (!d.show) { router.replace('/os'); return }
                // 방문 기록을 이 회원에 잇는다 (예전 /mentors 새 회원 처리와 같다)
                const { visitorId } = localIds()
                if (visitorId) {
                    fetch('/api/user/link-visitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId }) }).catch(() => {})
                }
                // 주소를 넣어 두고 온 분 = 질문 없이 바로 만들기 화면으로 (들어온 길, 초대 귀속은 그대로 남는다)
                let hasDraft = false
                try { hasDraft = !!readHomeDraft(window.localStorage) } catch { /* 저장이 막힌 브라우저 */ }
                if (hasDraft) {
                    try {
                        const sr = await fetch('/api/os/onboarding', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ step: 'skip', nativePlatform: nativePlatform(), ...localIds() }),
                        })
                        if (sr.ok) {
                            센다('onboarding_skipped', { tool: 'onboarding', reason: 'home_draft' })
                            router.replace(MAKE_PATH)
                            return
                        }
                    } catch { /* 저장이 안 되면 질문 화면으로 */ }
                }
                const s = d.answers ?? {}
                const uses: string[] = Array.isArray(s.use_cases) ? s.use_cases : []
                setA({
                    ...EMPTY,
                    acquisition_source: s.acquisition_source ?? null,
                    acquisition_detail: s.acquisition_detail ?? '',
                    leader_code_entered: s.leader_code_entered ?? d.refCode ?? '',
                    use_cases: uses,
                })
                setMarketing(!!s.marketing_agreed)
                setName(d.displayName ?? null)
                // 이어서 하기: 맡길 일을 이미 골랐고 앞 화면을 마쳤으면 마침 화면부터 (예전 5화면 도중에 나간 분도 여기로)
                setStep(uses.length > 0 && Number(s.step) >= 1 ? TOTAL - 1 : 0)
                setReady(true)
            } catch {
                router.replace('/os')
            }
        })()
    }, [router])

    // 화면이 보일 때마다 한 줄 (어디서 그만두는지)
    useEffect(() => {
        if (ready) 센다('onboarding_step', { tool: 'onboarding', step: step + 1 })
    }, [ready, step])

    const next = useCallback(async () => {
        const res = await save('intro', {
            acquisition_source: a.acquisition_source, acquisition_detail: a.acquisition_detail, leader_code_entered: a.leader_code_entered,
            use_cases: a.use_cases, marketing,
        })
        if (!res.ok) return
        if (a.leader_code_entered.trim() && REFERRAL_SOURCES.has(a.acquisition_source || '')) {
            setRefNote(res.refOk ? '초대 코드를 확인했어요.' : '')
        }
        setStep(TOTAL - 1)
        window.scrollTo({ top: 0 })
    }, [marketing, a, save])

    const startMake = useCallback(async () => {
        setBusy(true)
        setErr('')
        let mentorId: string | null = null
        try {
            const r = await fetch('/api/os/team/bootstrap', { method: 'POST' })
            const d = await r.json().catch(() => ({}))
            const team: { mentorId: string; oneLiner: string }[] = Array.isArray(d.team) ? d.team : []
            const job = JOBS.find(j => j.id === firstJobFor(a.use_cases))
            mentorId = (team.find(b => job && b.oneLiner === job.oneLiner) ?? team[0])?.mentorId ?? null
        } catch { /* 팀을 못 만들어도 만들기 화면으로 보낸다 */ }
        await save('done', { firstBotMentorId: mentorId })
        try {
            if (a.use_cases[0]) localStorage.setItem(SURVEY_LOCAL_KEY, a.use_cases[0])
            if (mentorId) localStorage.setItem(SURVEY_BOT_LOCAL_KEY, mentorId)
            localStorage.removeItem(FIRST_SENT_LOCAL_KEY)
            window.dispatchEvent(new Event(SURVEY_EVENT))
        } catch { /* 저장이 막힌 브라우저 */ }
        // 공유 링크로 가입한 분은 원래 보던 봇 대화로 (?next=, ref 포함). 그 밖에는 내 봇 만들기 화면으로
        const back = safeNextPath(new URLSearchParams(window.location.search).get('next'))
        router.replace(back ?? MAKE_PATH)
    }, [a.use_cases, save, router])

    const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA(p => ({ ...p, [k]: v }))
    const toggleUse = (id: string) => setA(p => {
        const has = p.use_cases.includes(id)
        if (has) return { ...p, use_cases: p.use_cases.filter(x => x !== id) }
        if (p.use_cases.length >= MAX_USE_CASES) return p
        return { ...p, use_cases: [...p.use_cases, id] }
    })

    const canNext = !!a.acquisition_source && a.use_cases.length > 0

    if (!ready) {
        return <main className="onb" data-theme="os"><div className="onb-wrap onb-loading" aria-busy="true">잠시만요</div></main>
    }

    return (
        <main className="onb" data-theme="os">
            <div className="onb-wrap">
                <div className="onb-top">
                    <span />
                    <span className="onb-count">{step + 1} / {TOTAL}</span>
                </div>
                <div className="onb-bar"><span style={{ width: `${((step + 1) / TOTAL) * 100}%` }} /></div>
                {step < TOTAL - 1 && <div className="onb-kicker">{ONBOARDING_TITLE}</div>}

                {step === 0 && (
                    <section>
                        <h1 className="onb-h1">두 가지만 알려 주세요</h1>
                        <div className="onb-label" style={{ marginTop: 0 }}>큐리AI를 어떻게 알게 되셨어요?</div>
                        <Chips list={ACQUISITION} value={a.acquisition_source} onPick={id => set('acquisition_source', id)} />
                        {(a.acquisition_source === 'ai_chatbot' || a.acquisition_source === 'other') && (
                            <input className="onb-input" value={a.acquisition_detail} maxLength={80}
                                placeholder={a.acquisition_source === 'ai_chatbot' ? '어떤 AI였나요? (선택)' : '어디서 보셨나요? (선택)'}
                                onChange={e => set('acquisition_detail', e.target.value)} />
                        )}
                        {REFERRAL_SOURCES.has(a.acquisition_source || '') && (
                            <input className="onb-input" value={a.leader_code_entered} maxLength={20} autoCapitalize="characters"
                                placeholder="초대 코드가 있으면 넣어 주세요 (선택)" onChange={e => set('leader_code_entered', e.target.value)} />
                        )}

                        <div className="onb-label">먼저 맡기고 싶은 일을 골라 주세요 <em>(최대 {MAX_USE_CASES}개)</em></div>
                        <div className="onb-big onb-grid">
                            {USE_CASES.map(c => (
                                <button key={c.id} type="button" className="onb-bigbtn" aria-pressed={a.use_cases.includes(c.id)}
                                    disabled={!a.use_cases.includes(c.id) && a.use_cases.length >= MAX_USE_CASES}
                                    onClick={() => toggleUse(c.id)}>{c.label}</button>
                            ))}
                        </div>
                        <label className="onb-check onb-check-opt"><input type="checkbox" checked={marketing} onChange={() => setMarketing(v => !v)} /><span>소식과 혜택 받기 (알림톡, 문자, 이메일) <em>(선택)</em></span></label>
                    </section>
                )}

                {step === 1 && (
                    <section className="onb-done">
                        <div className="onb-mascot"><BotAvatar shape="clover" color="green" state="talking" size={112} name="큐리" /></div>
                        <h1 className="onb-h1">{name ? `${name}님, ` : ''}내 AI 팀이 준비됐어요</h1>
                        <p className="onb-sub">이제 내 블로그나 SNS 주소를 넣으면 나를 닮은 봇이 생겨요</p>
                        {refNote && <p className="onb-ok">{refNote}</p>}
                    </section>
                )}

                {err && <p className="onb-err" role="alert">{err}</p>}

                <div className="onb-foot">
                    {step < TOTAL - 1
                        ? <button type="button" className="onb-cta" disabled={!canNext || busy} onClick={() => void next()}>{busy ? '저장하는 중' : '다음'}</button>
                        : <button type="button" className="onb-cta" disabled={busy} onClick={() => void startMake()}>{busy ? '준비하는 중' : '내 봇 만들기'}</button>}
                </div>
            </div>
        </main>
    )
}
