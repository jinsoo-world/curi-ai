'use client'
// 새 봇 만들기 = 2걸음, 전부 칩만 누른다.
//  ① 이 봇이 맡을 일 한 가지  ② 모양, 색 + 이름
// 승인 모드(어디까지 알아서) UI 는 없앴다. 서버는 항상 always_ask.
// 그림 생성 없이 도형+색이라 즉시, 비용 0.
//
// 「내 링크로 만들기」 탭 (대표 승인 0928 23:53, 리서치 S1, S4): 필수 동의 2개, 링크 판별, 저장 없는 초안, 편집 칸과 같은 칸으로 고친 뒤 만들기.
//
// edit 를 주면 「봇 편집」 시트. 프로필 사진, 한 줄 소개, 프롬프트, 이름, 역할, 도형, 색, 인사말을 한 장에서 고친다.
// 저장은 PATCH /api/os/team/[id]. 대화 헤더(얼굴/이름) 또는 우클릭 「편집」으로 연다.

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { JOBS, SHAPES, COLORS, suggestName, findJob } from '@/domains/os/presets'
import type { BotColor, BotRole, BotShape, TeamBot } from '@/domains/os/types'
import { osTrack } from '@/domains/os/events'
import BotAvatar from './BotAvatar'
import type { MarketBot } from '@/app/api/os/market/route'
import {
    DRAFT_LINK_LABEL, TWIN_DRAFT_CONSENTS, TWIN_DRAFT_COPY, TWIN_DRAFT_MAX_LINKS, TWIN_DRAFT_MAX_PASTES, draftLinkKind,
    type DraftField, type TwinDraft,
} from '@/domains/os/twin-draft-shared'
import { clearHomeDraft, readHomeDraft, type HomeDraft } from '@/domains/home/draft-store'

interface Props {
    guest: boolean
    onClose: () => void
    onCreated: (bot: TeamBot) => void | Promise<void>
    /** 「그룹 채팅 만들기」로 넘어가기 (3일차) */
    onWantGroup?: () => void
    /** 있으면 편집 모드. 이 봇의 값으로 칸을 채우고 저장은 PATCH */
    edit?: TeamBot | null
    /** 편집 저장이 끝났을 때 (명단을 다시 읽는다) */
    onSaved?: () => void | Promise<void>
}

const ROLE_OPTIONS: { id: BotRole; label: string; desc: string }[] = [
    { id: 'chief', label: '비서실장', desc: '내가 매일 말하는 한 명. 결정거리만 가져와요' },
    { id: 'helper', label: '도우미', desc: '일 하나를 맡아요' },
]

export default function NewBotSheet({ guest, onClose, onCreated, onWantGroup, edit = null, onSaved }: Props) {
    if (edit) return <EditBotSheet bot={edit} onClose={onClose} onSaved={onSaved} />
    return <CreateBotSheet guest={guest} onClose={onClose} onCreated={onCreated} onWantGroup={onWantGroup} />
}

/** 편집 = 한 장. 프로필 사진·한줄소개·프롬프트·나머지. 바뀐 칸만 보낸다 */
function EditBotSheet({ bot, onClose, onSaved }: { bot: TeamBot; onClose: () => void; onSaved?: () => void | Promise<void> }) {
    const [name, setName] = useState(bot.name)
    const [oneLiner, setOneLiner] = useState(bot.oneLiner ?? '')
    const [role, setRole] = useState<BotRole>(bot.role)
    const [shape, setShape] = useState<BotShape>(bot.shape)
    const [color, setColor] = useState<BotColor>(bot.color)
    const [greeting, setGreeting] = useState(bot.greeting ?? '')
    const [prompt, setPrompt] = useState(bot.systemPrompt ?? '')
    const [avatarUrl, setAvatarUrl] = useState<string | null>(bot.avatarUrl)
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(bot.avatarUrl)
    const fileRef = useRef<HTMLInputElement>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const canSave = name.trim().length > 0 && name.trim().length <= 20

    const onPickPhoto = (file: File | null) => {
        if (!file) return
        if (!file.type.startsWith('image/')) { setErr('사진 파일만 올릴 수 있어요'); return }
        if (file.size > 4 * 1024 * 1024) { setErr('사진은 4MB 이하만 올릴 수 있어요'); return }
        setErr(null)
        setAvatarFile(file)
        setAvatarPreview(URL.createObjectURL(file))
    }

    const save = async () => {
        setBusy(true); setErr(null)
        try {
            let nextAvatar = avatarUrl
            if (avatarFile) {
                const formData = new FormData()
                formData.append('file', avatarFile)
                formData.append('fileName', `mentor-avatar-${Date.now()}.${avatarFile.name.split('.').pop() || 'jpg'}`)
                formData.append('bucket', 'mentor-avatars')
                const up = await fetch('/api/creator/avatar/upload', { method: 'POST', body: formData })
                const upData = await up.json().catch(() => ({}))
                if (!up.ok) throw new Error(upData.error || '사진을 올리지 못했어요')
                nextAvatar = String(upData.url ?? '')
                if (!nextAvatar) throw new Error('사진 주소를 받지 못했어요')
            }

            const patch: Record<string, unknown> = {}
            if (name.trim() !== bot.name) patch.name = name.trim()
            if (oneLiner.trim() !== (bot.oneLiner ?? '')) patch.oneLiner = oneLiner.trim()
            if (role !== bot.role) patch.role = role
            if (shape !== bot.shape) patch.shape = shape
            if (color !== bot.color) patch.color = color
            if (greeting.trim() !== (bot.greeting ?? '')) patch.greeting = greeting.trim()
            if (prompt !== (bot.systemPrompt ?? '')) patch.systemPrompt = prompt
            if (nextAvatar !== bot.avatarUrl) patch.avatarUrl = nextAvatar

            if (Object.keys(patch).length > 0) {
                const res = await fetch(`/api/os/team/${bot.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.error || '저장하지 못했어요')
            }
            await onSaved?.()
            onClose()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '저장하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="봇 편집">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>봇 편집</h3>
                <div className="os-step">프로필 사진, 한 줄 소개, 프롬프트, 기본 정보를 한곳에서 고쳐요.</div>

                <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 6 }}>
                    <button type="button" className="os-edit-face" onClick={() => fileRef.current?.click()} disabled={busy}
                        aria-label="프로필 사진 바꾸기" title="프로필 사진 바꾸기">
                        <BotAvatar shape={shape} color={color} state="idle" size={96} faceUrl={avatarPreview} name={name || bot.name} />
                        <span className="os-edit-face-hint">사진</span>
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden
                        onChange={e => onPickPhoto(e.target.files?.[0] ?? null)} />
                    <div style={{ flex: 1 }}>
                        <div className="os-field-label">이름</div>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="봇 이름" aria-label="봇 이름" disabled={busy} />
                    </div>
                </div>

                <div className="os-field">
                    <div className="os-field-label">한 줄 소개</div>
                    <input type="text" value={oneLiner} onChange={e => setOneLiner(e.target.value)} maxLength={40} placeholder="예) 팬 질문에 내 말투로 답해요" aria-label="한 줄 소개" disabled={busy} />
                </div>

                <div className="os-field">
                    <div className="os-field-label">프롬프트 (이 봇이 따르는 설명, 12000자까지)</div>
                    <textarea className="os-textarea" rows={6} value={prompt} onChange={e => setPrompt(e.target.value.slice(0, 12000))}
                        maxLength={12000} placeholder="예) 너는 글감봇이야. 짧고 구체적인 글감만 제안해." aria-label="프롬프트" disabled={busy} />
                </div>

                {bot.role !== 'twin' && (
                    <div className="os-field">
                        <div className="os-field-label">역할</div>
                        <div className="os-chips">
                            {ROLE_OPTIONS.map(r => (
                                <button key={r.id} type="button" className="os-chipbtn" aria-pressed={role === r.id} onClick={() => setRole(r.id)} disabled={busy}>
                                    {r.label}<small>{r.desc}</small>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="os-field">
                    <div className="os-field-label">모양</div>
                    <div className="os-chips">
                        {SHAPES.map(s => (
                            <button key={s} type="button" className="os-shape-pick" aria-pressed={shape === s} onClick={() => setShape(s)} aria-label={s} disabled={busy}>
                                <BotAvatar shape={s} color={color} state="sleeping" size={44} />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="os-field">
                    <div className="os-field-label">색</div>
                    <div className="os-swatches">
                        {COLORS.map(c => (
                            <button key={c} type="button" className="os-swatch" aria-pressed={color === c} onClick={() => setColor(c)} aria-label={c} disabled={busy}
                                style={{ background: `var(--봇-${c})` }} />
                        ))}
                    </div>
                </div>

                <div className="os-field">
                    <div className="os-field-label">인사말 (대화를 열면 봇이 먼저 하는 말, 200자까지)</div>
                    <textarea className="os-textarea" rows={3} value={greeting} onChange={e => setGreeting(e.target.value.slice(0, 200))} maxLength={200}
                        placeholder={`안녕하세요, ${name || '봇'}이에요.`} aria-label="인사말" disabled={busy} />
                </div>

                {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}
                <div className="os-sheet-foot">
                    <button type="button" className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                    <button type="button" className="os-btn primary" onClick={() => void save()} disabled={!canSave || busy}>{busy ? '저장하는 중' : '저장'}</button>
                </div>
            </div>
        </div>
    )
}

function CreateBotSheet({ guest, onClose, onCreated, onWantGroup }: Omit<Props, 'edit' | 'onSaved'>) {
    // 새로 만들기(3걸음) / 봇 마켓에서 가져오기(다른 리더가 만든 공개 봇을 내 팀에 넣기) — 대표 지시 0923
    // /home 에서 넣어 둔 주소가 있으면 「내 링크로 만들기」로 바로 연다 (가입 직후 이어 만들기)
    const [homeDraft] = useState<HomeDraft | null>(() => (guest || typeof window === 'undefined') ? null : readHomeDraft(window.localStorage))
    const [tab, setTab] = useState<'new' | 'link' | 'market'>(() => homeDraft ? 'link' : 'new')
    const [step, setStep] = useState<1 | 2>(1)
    const [job, setJob] = useState<string>('')
    const [customJob, setCustomJob] = useState('')
    const [shape, setShape] = useState<BotShape>('circle')
    const [color, setColor] = useState<BotColor>('orange')
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const preset = useMemo(() => job ? findJob(job) : null, [job])

    const pickJob = (id: string) => {
        setJob(id)
        const p = findJob(id)
        setShape(p.shape); setColor(p.color)
        setName(suggestName(id))
    }

    const canNext1 = !!job && (job !== 'custom' || customJob.trim().length > 0)
    const canCreate = name.trim().length > 0 && name.trim().length <= 20

    const create = async () => {
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/team', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job, customJob, autonomy: 'always_ask', shape, color, name: name.trim() }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '만들지 못했어요')
            osTrack('os_bot_created', { job, autonomy: 'always_ask', shape, color })
            await onCreated(data.bot as TeamBot)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '만들지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={onClose} role="dialog" aria-modal="true" aria-label="새 봇 만들기">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <div className="os-tabs" role="tablist" aria-label="봇 추가 방법">
                    <button type="button" className="os-tab" role="tab" aria-selected={tab === 'new'} onClick={() => setTab('new')}>새로 만들기</button>
                    <button type="button" className="os-tab" role="tab" aria-selected={tab === 'link'} onClick={() => setTab('link')}>{TWIN_DRAFT_COPY.tab}</button>
                    <button type="button" className="os-tab" role="tab" aria-selected={tab === 'market'} onClick={() => setTab('market')}>봇 마켓에서 가져오기</button>
                </div>
                {tab === 'market' ? (
                    <MarketTab guest={guest} onClose={onClose} onLinked={onCreated} />
                ) : tab === 'link' && !guest ? (
                    <LinkDraftTab onClose={onClose} onCreated={onCreated} initial={homeDraft} />
                ) : guest ? (
                    <>
                        <h3>내 봇 팀을 만들려면 로그인이 필요해요</h3>
                        <p style={{ color: 'var(--os-글-연)', lineHeight: 1.6, marginTop: 8 }}>구글이나 카카오로 10초면 돼요. 만든 봇은 나만 볼 수 있어요.</p>
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={onClose}>닫기</button>
                            <Link href="/login?next=/os" className="os-btn primary" style={{ textDecoration: 'none', display: 'inline-grid', placeItems: 'center' }}>로그인하기</Link>
                        </div>
                    </>
                ) : step === 1 ? (
                    <>
                        <h3>이 봇이 맡을 일 한 가지</h3>
                        <div className="os-step">1 / 2 / 봇 하나는 일 하나만 맡아요. 그래야 잘해요.</div>
                        <div className="os-chips">
                            {JOBS.map(j => (
                                <button key={j.id} className="os-chipbtn" aria-pressed={job === j.id} onClick={() => pickJob(j.id)}>
                                    {j.label}
                                    {j.oneLiner && <small>{j.oneLiner}</small>}
                                </button>
                            ))}
                        </div>
                        {job === 'custom' && (
                            <div style={{ marginTop: 12 }}>
                                <input type="text" value={customJob} onChange={e => setCustomJob(e.target.value)} maxLength={120}
                                    placeholder="예) 매주 뉴스레터 초안 쓰기" autoFocus />
                            </div>
                        )}
                        {onWantGroup && (
                            <button className="os-linkbtn" onClick={onWantGroup} style={{ marginTop: 14 }}>
                                👥 봇 말고 「단체방」 만들기. 봇 여러 명과 한 방에서 이야기해요
                            </button>
                        )}
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={onClose}>닫기</button>
                            <button className="os-btn primary" disabled={!canNext1} onClick={() => setStep(2)}>다음</button>
                        </div>
                    </>
                ) : (
                    <>
                        <h3>모양과 색, 그리고 이름</h3>
                        <div className="os-step">2 / 2 / 명단에 이렇게 보여요.</div>
                        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 16 }}>
                            <BotAvatar shape={shape} color={color} state="idle" size={96} />
                            <div style={{ flex: 1 }}>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="봇 이름" aria-label="봇 이름" />
                                <div style={{ color: 'var(--os-글-흐림)', fontSize: 13, marginTop: 6 }}>{preset?.oneLiner || (customJob.trim().slice(0, 40))}</div>
                            </div>
                        </div>
                        <div className="os-step" style={{ marginBottom: 8 }}>모양</div>
                        <div className="os-chips">
                            {SHAPES.map(s => (
                                <button key={s} className="os-shape-pick" aria-pressed={shape === s} onClick={() => setShape(s)} aria-label={s}>
                                    <BotAvatar shape={s} color={color} state="sleeping" size={44} />
                                </button>
                            ))}
                        </div>
                        <div className="os-step" style={{ margin: '14px 0 8px' }}>색</div>
                        <div className="os-swatches">
                            {COLORS.map(c => (
                                <button key={c} className="os-swatch" aria-pressed={color === c} onClick={() => setColor(c)} aria-label={c}
                                    style={{ background: `var(--봇-${c})` }} />
                            ))}
                        </div>
                        {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}
                        <div className="os-sheet-foot">
                            <button className="os-btn" onClick={() => setStep(1)} disabled={busy}>이전</button>
                            <button className="os-btn primary" onClick={create} disabled={!canCreate || busy}>{busy ? '만드는 중' : '팀에 넣기'}</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

/** 「봇 마켓에서 가져오기」 탭 = 다른 리더가 만든 공개 봇 목록. 눌러 팀에 넣으면 격자에 바로 나타난다(onCreated 재사용). */
function MarketTab({ guest, onClose, onLinked }: { guest: boolean; onClose: () => void; onLinked: (bot: TeamBot) => void | Promise<void> }) {
    const [bots, setBots] = useState<MarketBot[] | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        fetch('/api/os/market').then(r => r.json()).then(d => { if (alive) setBots(Array.isArray(d.bots) ? d.bots : []) }).catch(() => { if (alive) setBots([]) })
        return () => { alive = false }
    }, [])

    const link = async (bot: MarketBot) => {
        if (guest) return
        setBusyId(bot.mentorId); setNote(null)
        try {
            const res = await fetch('/api/os/team/link', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId: bot.mentorId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setNote(data.error ?? '팀에 넣지 못했어요'); return }
            osTrack('os_bot_created', { job: 'market', autonomy: 'market', shape: 'circle', color: 'white' })
            setBots(prev => prev ? prev.map(b => b.mentorId === bot.mentorId ? { ...b, inTeam: true } : b) : prev)
            // onCreated 는 mentorId 만 쓴다(OsShell). 모양·색은 표 기본값이라 여기선 자리만 채운다.
            await onLinked({
                id: '', mentorId: bot.mentorId, name: bot.name, role: 'helper', shape: 'circle', color: 'white',
                oneLiner: bot.oneLiner, approvalMode: 'always_ask', pinned: false, hidden: false, sortOrder: 0,
                avatarUrl: bot.avatarUrl, systemPrompt: '', greeting: '', knowledgeCount: 0, createdAt: '',
            })
        } catch {
            setNote('연결이 잠깐 끊겼어요. 다시 눌러 주세요.')
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div>
            <div className="os-step">리더들이 만든 공개 봇이에요. 팀에 넣으면 왼쪽 격자에서 바로 이야기할 수 있어요.</div>
            {bots === null ? (
                <div style={{ color: 'var(--os-글-흐림)', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>불러오는 중…</div>
            ) : bots.length === 0 ? (
                <div style={{ color: 'var(--os-글-흐림)', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>아직 공개 봇이 없어요.</div>
            ) : (
                <div className="os-market-import-list">
                    {bots.map(b => (
                        <div key={b.mentorId} className="os-market-import-card">
                            <div className="os-market-import-avatar">
                                <BotAvatar shape="circle" color="white" state="idle" size={56} faceUrl={b.avatarUrl} faceRim="shadow" name={b.name} />
                                {b.creatorAvatarUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="os-market-import-overlay" src={b.creatorAvatarUrl} alt={b.creatorName ?? '리더'} />
                                )}
                            </div>
                            <div className="os-market-import-body">
                                <div className="os-market-import-name">{b.name}</div>
                                {b.oneLiner && <div className="os-market-import-line">{b.oneLiner}</div>}
                                <div className="os-market-import-count">{b.linkCount > 0 ? `${b.linkCount}명이 팀에 넣었어요` : '아직 넣은 사람이 없어요'}</div>
                            </div>
                            {guest ? (
                                <Link href="/login?next=/os" className="os-btn" style={{ textDecoration: 'none', display: 'inline-grid', placeItems: 'center' }}>로그인하면 넣을 수 있어요</Link>
                            ) : b.inTeam ? (
                                <button type="button" className="os-btn" disabled>이미 있어요</button>
                            ) : (
                                <button type="button" className="os-btn primary" disabled={busyId === b.mentorId} onClick={() => void link(b)}>
                                    {busyId === b.mentorId ? '넣는 중' : '팀에 넣기'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {note && <div className="os-notice" style={{ margin: '10px 0 0' }}>{note}</div>}
            <div className="os-sheet-foot">
                <button type="button" className="os-btn" onClick={onClose}>닫기</button>
            </div>
        </div>
    )
}

/** 「내 링크로 만들기」 = 동의 2개, 링크 3개, 붙여넣기 → 저장 없는 초안 → 편집 칸과 같은 칸으로 고치고 만들기 */
function LinkDraftTab({ onClose, onCreated, initial = null }: { onClose: () => void; onCreated: (bot: TeamBot) => void | Promise<void>; initial?: HomeDraft | null }) {
    const [agree] = useState<boolean[]>(() => TWIN_DRAFT_CONSENTS.map(() => true))  // 동의 체크 없앰 (대표 지시 0929)
    const [links, setLinks] = useState<string[]>(() => Array.from({ length: TWIN_DRAFT_MAX_LINKS }, (_, i) => initial?.links[i] ?? ''))
    const [pastes, setPastes] = useState<string[]>(() => Array.from({ length: TWIN_DRAFT_MAX_PASTES }, (_, i) => initial?.pastes[i] ?? ''))
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [unreadOnly, setUnreadOnly] = useState<{ url: string; reason: string }[]>([])
    const [draft, setDraft] = useState<TwinDraft | null>(null)
    // 편집 칸 (봇 편집 화면과 같은 칸)
    const [name, setName] = useState('')
    const [oneLiner, setOneLiner] = useState('')
    const [prompt, setPrompt] = useState('')
    const [greeting, setGreeting] = useState('')
    const [shape, setShape] = useState<BotShape>('circle')
    const [color, setColor] = useState<BotColor>('orange')

    const filled = links.map(l => l.trim()).filter(Boolean)
    const needPaste = filled.some(l => draftLinkKind(l) === 'paste')
    const canDraft = agree.every(Boolean) && (filled.length > 0 || pastes.some(p => p.trim())) && !busy
    const guess = (f: DraftField) => draft?.guessed.includes(f) ? <span className="os-draft-guess" style={{ marginLeft: 6, fontSize: 12, padding: '1px 6px', borderRadius: 8, background: 'var(--os-말풍선)', color: 'var(--os-글-흐림)' }}>{TWIN_DRAFT_COPY.guess}</span> : null

    const makeDraft = async () => {
        setBusy(true); setErr(null); setUnreadOnly([])
        try {
            const res = await fetch('/api/os/twin-draft', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: filled, pastes: pastes.filter(p => p.trim()), consents: agree }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setErr(data.error || '초안을 만들지 못했어요')
                if (Array.isArray(data.unread)) setUnreadOnly(data.unread)
                return
            }
            const d = data.draft as TwinDraft
            setDraft(d)
            setName(d.name); setOneLiner(d.oneLiner); setPrompt(d.prompt); setGreeting(d.greeting)
        } catch {
            setErr('연결이 잠깐 끊겼어요. 다시 눌러 주세요')
        } finally {
            setBusy(false)
        }
    }

    // /home 에서 넘어온 것은 한 번만 이어 만든다. 브라우저 보관분은 바로 지운다
    const resumed = useRef(false)
    useEffect(() => {
        if (!initial || resumed.current) return
        resumed.current = true
        clearHomeDraft(typeof window === 'undefined' ? null : window.localStorage)
        if (canDraft) void makeDraft()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const create = async () => {
        if (!draft) return
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/os/twin-draft/create', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), oneLiner, greeting, prompt, chips: draft.chips, shape, color }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '만들지 못했어요')
            osTrack('os_bot_created', { job: 'twin_draft', autonomy: 'always_ask', shape, color })
            await onCreated(data.bot as TeamBot)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '만들지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    if (!draft) return (
        <>
            <div className="os-step">{TWIN_DRAFT_COPY.intro}</div>
            {links.map((l, i) => {
                const kind = l.trim() ? draftLinkKind(l) : null
                return (
                    <div key={i} className="os-field" style={{ marginTop: 8 }}>
                        <input type="url" inputMode="url" value={l} maxLength={300} placeholder={i === 0 ? TWIN_DRAFT_COPY.linkPlaceholder : '링크 하나 더 (선택)'} aria-label={`링크 ${i + 1}`} disabled={busy}
                            onChange={e => setLinks(prev => prev.map((x, j) => j === i ? e.target.value : x))} />
                        {kind && <div className="os-draft-kind" style={{ fontSize: 13, marginTop: 4, color: kind === 'read' ? 'var(--os-글-연)' : 'var(--os-글-흐림)' }}>{DRAFT_LINK_LABEL[kind]}</div>}
                    </div>
                )
            })}
            {needPaste && (
                <div className="os-field">
                    <div className="os-field-label">{TWIN_DRAFT_COPY.pasteLabel}</div>
                    {pastes.map((p, i) => (
                        <textarea key={i} className="os-textarea" rows={3} value={p} maxLength={8000} placeholder={`글 ${i + 1}`} disabled={busy}
                            onChange={e => setPastes(prev => prev.map((x, j) => j === i ? e.target.value : x))} style={{ marginTop: i ? 6 : 0 }} />
                    ))}
                </div>
            )}
            {busy && <div className="os-step" role="status">{TWIN_DRAFT_COPY.making}</div>}
            {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}
            {unreadOnly.length > 0 && <UnreadList items={unreadOnly} />}
            <div className="os-sheet-foot">
                <button type="button" className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                <button type="button" className="os-btn primary" onClick={() => void makeDraft()} disabled={!canDraft}>{busy ? '만드는 중' : TWIN_DRAFT_COPY.make}</button>
            </div>
        </>
    )

    return (
        <>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', margin: '4px 0 6px' }}>
                <BotAvatar shape={shape} color={color} state="idle" size={72} />
                <div style={{ flex: 1 }}>
                    <div className="os-field-label">이름{guess('names')}</div>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="봇 이름" aria-label="봇 이름" disabled={busy} />
                    {draft.names.length > 1 && (
                        <div className="os-chips" style={{ marginTop: 6 }}>
                            {draft.names.map(n => <button key={n} type="button" className="os-chipbtn" aria-pressed={name === n} onClick={() => setName(n.slice(0, 20))} disabled={busy}>{n}</button>)}
                        </div>
                    )}
                </div>
            </div>
            <div className="os-field">
                <div className="os-field-label">한 줄 소개{guess('oneLiner')}</div>
                <input type="text" value={oneLiner} onChange={e => setOneLiner(e.target.value)} maxLength={40} aria-label="한 줄 소개" disabled={busy} />
            </div>
            <div className="os-field">
                <div className="os-field-label">인사말 (200자까지){guess('greeting')}</div>
                <textarea className="os-textarea" rows={3} value={greeting} onChange={e => setGreeting(e.target.value.slice(0, 200))} maxLength={200} aria-label="인사말" disabled={busy} />
            </div>
            <div className="os-field">
                <div className="os-field-label">대상, 주제, 말투, 금지선</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--os-글-연)' }}>
                    <div>대상: {draft.audience || '없음'}{guess('audience')}</div>
                    <div>주제: {draft.topics.join(', ') || '없음'}{guess('topics')}</div>
                    <div>말투: {draft.voiceRules.join(' / ') || '없음'}{guess('voiceRules')}</div>
                    <div>금지선: 기본 금지선{draft.limits.length > 0 ? ` + ${draft.limits.join(', ')}` : ''}{guess('limits')}</div>
                    <div>첫 질문: {draft.chips.join(' / ') || '없음'}{guess('chips')}</div>
                    {draft.example.q && <div>예시: 「{draft.example.q}」 → 「{draft.example.a}」{guess('example')}</div>}
                </div>
            </div>
            <div className="os-field">
                <div className="os-field-label">프롬프트 (이 봇이 따르는 설명, 12000자까지)</div>
                <textarea className="os-textarea" rows={6} value={prompt} onChange={e => setPrompt(e.target.value.slice(0, 12000))} maxLength={12000} aria-label="프롬프트" disabled={busy} />
            </div>
            <div className="os-field">
                <div className="os-field-label">모양</div>
                <div className="os-chips">
                    {SHAPES.map(s => (
                        <button key={s} type="button" className="os-shape-pick" aria-pressed={shape === s} onClick={() => setShape(s)} aria-label={s} disabled={busy}>
                            <BotAvatar shape={s} color={color} state="sleeping" size={40} />
                        </button>
                    ))}
                </div>
            </div>
            <div className="os-field">
                <div className="os-field-label">색</div>
                <div className="os-swatches">
                    {COLORS.map(c => (
                        <button key={c} type="button" className="os-swatch" aria-pressed={color === c} onClick={() => setColor(c)} aria-label={c} disabled={busy} style={{ background: `var(--봇-${c})` }} />
                    ))}
                </div>
            </div>
            <div className="os-field">
                <div className="os-field-label">{TWIN_DRAFT_COPY.read}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--os-글-연)' }}>
                    {draft.sources.map((s, i) => <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>)}
                </div>
            </div>
            {draft.unread.length > 0 && <UnreadList items={draft.unread} />}
            {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}
            <div className="os-sheet-foot">
                <button type="button" className="os-btn" onClick={() => setDraft(null)} disabled={busy}>이전</button>
                <button type="button" className="os-btn primary" onClick={() => void create()} disabled={busy || !name.trim() || name.trim().length > 20 || prompt.trim().length < 20}>{busy ? '만드는 중' : TWIN_DRAFT_COPY.create}</button>
            </div>
        </>
    )
}

function UnreadList({ items }: { items: { url: string; reason: string }[] }) {
    return (
        <div className="os-field">
            <div className="os-field-label">{TWIN_DRAFT_COPY.unread}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--os-글-흐림)' }}>
                {items.map((u, i) => <div key={i} style={{ wordBreak: 'break-all' }}>{u.url}: {u.reason}</div>)}
            </div>
        </div>
    )
}
