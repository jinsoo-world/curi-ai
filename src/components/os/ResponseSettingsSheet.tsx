'use client'
// 「답변 설정」 편집 시트 — 델파이(Delphi)급 Response Settings.
// 목적 / 추가 지침(최대 3개) / 말투 / 첫 인사 / 자료 없을 때 할 말 /
// 길이(intelligent·concise·explanatory·custom) / 창의성(strict·adaptive·creative) /
// 출처 카드 on/off / 안내문 / 최신성(구글 검색) on/off.
//
// 저장 = PUT /api/os/bots/[mentorId]/response-settings (domains/os/response-settings 가 다듬고 저장).
// 표(bot_response_settings)가 아직 없으면(마이그레이션 전) 서버가 503 을 돌려준다 — 그 말 그대로 보여 준다.

import { useEffect, useState } from 'react'
import { Toggle } from './NotificationSettings'
import {
    MAX_CUSTOM_INSTRUCTIONS, MAX_CUSTOM_LENGTH_CHARS, MIN_CUSTOM_LENGTH_CHARS,
    type BotKind, type ResponseCreativity, type ResponseLength, type ResponseSettings,
} from '@/domains/os/response-settings'

interface Props {
    mentorId: string
    botName: string
    onClose: () => void
}

const LENGTH_OPTIONS: { id: ResponseLength; label: string; desc: string }[] = [
    { id: 'intelligent', label: '알아서', desc: '질문에 맞게 짧거나 길게' },
    { id: 'concise', label: '짧게', desc: '2~3문장 이내' },
    { id: 'explanatory', label: '자세히', desc: '예시 곁들여 충분히' },
    { id: 'custom', label: '글자수 직접', desc: '아래 숫자만큼' },
]

const CREATIVITY_OPTIONS: { id: ResponseCreativity; label: string; desc: string }[] = [
    { id: 'strict', label: '자료만', desc: '자료에 없으면 모른다고 답해요(가장 안전)' },
    { id: 'adaptive', label: '자료 먼저', desc: '자료 우선, 없으면 일반 지식으로 보완' },
    { id: 'creative', label: '자유롭게', desc: '자료 밖 이야기도 상상해서 답해요' },
]

const KIND_LABEL: Record<BotKind, string> = { personal: '내 팀 봇', public: '트윈·리더 봇 (마켓 공개 봇)' }

export default function ResponseSettingsSheet({ mentorId, botName, onClose }: Props) {
    const [settings, setSettings] = useState<ResponseSettings | null>(null)
    const [kind, setKind] = useState<BotKind | null>(null)
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState<string | null>(null)
    const [ok, setOk] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        ;(async () => {
            try {
                const res = await fetch(`/api/os/bots/${encodeURIComponent(mentorId)}/response-settings`, { cache: 'no-store' })
                const data = await res.json().catch(() => ({}))
                if (!alive) return
                if (!res.ok) { setErr(data.error || '답변 설정을 못 불러왔어요'); setLoading(false); return }
                setSettings(data.settings); setKind(data.kind)
            } catch {
                if (alive) setErr('답변 설정을 못 불러왔어요')
            } finally {
                if (alive) setLoading(false)
            }
        })()
        return () => { alive = false }
    }, [mentorId])

    const patch = (p: Partial<ResponseSettings>) => setSettings(s => (s ? { ...s, ...p } : s))

    const 지침바꾸기 = (i: number, value: string) => {
        if (!settings) return
        const next = [...settings.customInstructions]
        next[i] = value
        patch({ customInstructions: next })
    }
    const 지침빼기 = (i: number) => {
        if (!settings) return
        patch({ customInstructions: settings.customInstructions.filter((_, j) => j !== i) })
    }
    const 지침더하기 = () => {
        if (!settings || settings.customInstructions.length >= MAX_CUSTOM_INSTRUCTIONS) return
        patch({ customInstructions: [...settings.customInstructions, ''] })
    }

    const save = async () => {
        if (!settings) return
        setBusy(true); setErr(null); setOk(null)
        try {
            const res = await fetch(`/api/os/bots/${encodeURIComponent(mentorId)}/response-settings`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '저장하지 못했어요')
            setSettings(data.settings)
            setOk('저장했어요')
            setTimeout(onClose, 700)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '저장하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="답변 설정">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>답변 설정</h3>
                <div className="os-step">
                    {botName}이 답할 때 지킬 규칙이에요.{kind && <>{' '}지금 기본값은 <b>{KIND_LABEL[kind]}</b> 기준이에요.</>}
                </div>

                {loading && <div className="os-card">불러오는 중…</div>}

                {!loading && !settings && (
                    <div className="os-notice" style={{ margin: '10px 0' }}>{err || '답변 설정을 못 불러왔어요'}</div>
                )}

                {settings && (
                    <>
                        <div className="os-field">
                            <div className="os-field-label">목적 (한 줄, 200자까지)</div>
                            <input type="text" value={settings.purpose ?? ''} onChange={e => patch({ purpose: e.target.value.slice(0, 200) })}
                                maxLength={200} placeholder="예) 팬들의 강의 질문에 내 말투로 답한다" aria-label="목적" disabled={busy} />
                        </div>

                        <div className="os-field">
                            <div className="os-field-label">추가 지침 (최대 {MAX_CUSTOM_INSTRUCTIONS}개)</div>
                            {settings.customInstructions.map((c, i) => (
                                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                                    <input type="text" value={c} onChange={e => 지침바꾸기(i, e.target.value.slice(0, 300))}
                                        maxLength={300} placeholder={`지침 ${i + 1}`} aria-label={`추가 지침 ${i + 1}`} disabled={busy}
                                        style={{ flex: 1, minWidth: 0 }} />
                                    <button type="button" className="os-source-x" aria-label={`지침 ${i + 1} 빼기`} disabled={busy}
                                        onClick={() => 지침빼기(i)}>✕</button>
                                </div>
                            ))}
                            {settings.customInstructions.length < MAX_CUSTOM_INSTRUCTIONS && (
                                <button type="button" className="os-btn" style={{ minHeight: 40 }} disabled={busy} onClick={지침더하기}>
                                    ＋ 지침 더하기
                                </button>
                            )}
                        </div>

                        <div className="os-field">
                            <div className="os-field-label">말투 (자유롭게, 500자까지)</div>
                            <textarea className="os-textarea" rows={2} value={settings.style ?? ''} maxLength={500}
                                onChange={e => patch({ style: e.target.value.slice(0, 500) })}
                                placeholder="예) 존댓말, 따뜻하게. 이모지는 가끔만" aria-label="말투" disabled={busy} />
                        </div>

                        <div className="os-field">
                            <div className="os-field-label">첫 인사 (비우면 봇의 기본 인사말을 써요, 300자까지)</div>
                            <textarea className="os-textarea" rows={2} value={settings.initialMessage ?? ''} maxLength={300}
                                onChange={e => patch({ initialMessage: e.target.value.slice(0, 300) })}
                                placeholder="비워 두면 봇의 기본 인사말이 나가요" aria-label="첫 인사" disabled={busy} />
                        </div>

                        <div className="os-field">
                            <div className="os-field-label">답의 길이</div>
                            <div className="os-chips" style={{ flexDirection: 'column' }}>
                                {LENGTH_OPTIONS.map(o => (
                                    <button key={o.id} type="button" className="os-chipbtn" aria-pressed={settings.length === o.id} disabled={busy}
                                        onClick={() => patch({ length: o.id })}>
                                        {o.label}<small>{o.desc}</small>
                                    </button>
                                ))}
                            </div>
                            {settings.length === 'custom' && (
                                <div style={{ marginTop: 8 }}>
                                    <input type="number" min={MIN_CUSTOM_LENGTH_CHARS} max={MAX_CUSTOM_LENGTH_CHARS}
                                        value={settings.customLength ?? 800} disabled={busy}
                                        onChange={e => patch({ customLength: Number(e.target.value) || 800 })}
                                        aria-label="글자수" style={{ width: 120 }} />
                                    <span style={{ marginLeft: 8, color: 'var(--os-글-흐림)', fontSize: 13 }}>
                                        자 안팎 ({MIN_CUSTOM_LENGTH_CHARS}~{MAX_CUSTOM_LENGTH_CHARS})
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="os-field">
                            <div className="os-field-label">창의성</div>
                            <div className="os-chips" style={{ flexDirection: 'column' }}>
                                {CREATIVITY_OPTIONS.map(o => (
                                    <button key={o.id} type="button" className="os-chipbtn" aria-pressed={settings.creativity === o.id} disabled={busy}
                                        onClick={() => patch({ creativity: o.id })}>
                                        {o.label}<small>{o.desc}</small>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {settings.creativity === 'strict' && (
                            <div className="os-field">
                                <div className="os-field-label">자료에 없을 때 할 말 (300자까지)</div>
                                <textarea className="os-textarea" rows={2} value={settings.noAnswerText} maxLength={300}
                                    onChange={e => patch({ noAnswerText: e.target.value.slice(0, 300) })}
                                    aria-label="자료에 없을 때 할 말" disabled={busy} />
                            </div>
                        )}

                        <div className="os-field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div className="os-field-label" style={{ marginBottom: 2 }}>출처 카드</div>
                                <span style={{ fontSize: 13, color: 'var(--os-글-흐림)' }}>답에 쓴 자료를 「참고한 자료」로 보여줘요</span>
                            </div>
                            <Toggle on={settings.citationsOn} onChange={v => patch({ citationsOn: v })} disabled={busy} label="출처 카드" />
                        </div>

                        <div className="os-field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div className="os-field-label" style={{ marginBottom: 2 }}>최신 정보 찾아보기</div>
                                <span style={{ fontSize: 13, color: 'var(--os-글-흐림)' }}>필요하면 구글 검색으로 최신 소식을 확인해요</span>
                            </div>
                            <Toggle on={settings.recencyOn} onChange={v => patch({ recencyOn: v })} disabled={busy} label="최신 정보 찾아보기" />
                        </div>

                        <div className="os-field">
                            <div className="os-field-label">안내문 (답 끝에 자연스럽게 덧붙여요, 300자까지)</div>
                            <textarea className="os-textarea" rows={2} value={settings.disclaimer ?? ''} maxLength={300}
                                onChange={e => patch({ disclaimer: e.target.value.slice(0, 300) })}
                                placeholder="예) 이 답은 AI가 만든 것이라 틀릴 수 있어요" aria-label="안내문" disabled={busy} />
                        </div>
                    </>
                )}

                {ok && <div className="os-notice" style={{ margin: '10px 0', background: 'color-mix(in srgb, var(--os-클로버) 18%, transparent)', color: 'var(--os-클로버)' }}>{ok}</div>}
                {err && settings && <div className="os-notice" style={{ margin: '10px 0' }}>{err}</div>}

                <div className="os-sheet-foot">
                    <button className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                    {settings && (
                        <button className="os-btn primary" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
                    )}
                </div>
            </div>
        </div>
    )
}
