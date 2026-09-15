'use client'

/**
 * 무료 체험권 받기 — 휴대폰 인증 · 받은 날부터 7일 · 추천 공유
 *
 * 대표 지시 2026-09-14
 * 「무료체험권은 휴대폰 인증하게 해. 받은날로부터 7일은 세고 똑바로」
 * 「체험권은 추천해서 공유되게 해. 회원추천코드」
 *
 * 전에는 누르면 바로 subscription_tier 를 바꿔줬다. 끝나는 날을 적지 않아
 * 한 번 받으면 영원히 체험 중이었고, 한 사람이 계정을 여러 개 만들면 막을 길이 없었다.
 */
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TRIAL_CLOVERS } from '@/domains/trial'
import ShareInvite from '@/components/ui/ShareInvite'

interface CreditClaimModalProps {
    isOpen: boolean
    onClose: () => void
    onComplete?: () => void
}

type 단계 = '확인중' | '번호입력' | '인증번호' | '이미받음' | '끝'

export default function CreditClaimModal({ isOpen, onClose, onComplete }: CreditClaimModalProps) {
    const [단계, set단계] = useState<단계>('확인중')
    const [phone, setPhone] = useState('')
    const [code, setCode] = useState('')
    const [보내는중, set보내는중] = useState(false)
    const [오류, set오류] = useState<string | null>(null)
    const [남은초, set남은초] = useState(0)
    const [끝나는날, set끝나는날] = useState<string | null>(null)
    const [추천입력, set추천입력] = useState('')
    const [추천코드, set추천코드] = useState<string | null>(null)

    // 이미 체험 중인지 먼저 본다
    useEffect(() => {
        if (!isOpen) return
        let 살아있음 = true
        try {
            const fromUrl = new URLSearchParams(window.location.search).get('ref')
            if (fromUrl) set추천입력(fromUrl)
        } catch { /* 주소를 못 읽어도 그냥 넘어간다 */ }
        ;(async () => {
            set단계('확인중')
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                if (살아있음) set단계('번호입력')
                return
            }
            const { data } = await supabase
                .from('users')
                .select('trial_ends_at, referral_code')
                .eq('id', user.id)
                .maybeSingle()
            if (!살아있음) return
            if (data?.referral_code) set추천코드(data.referral_code)
            if (data?.trial_ends_at && new Date(data.trial_ends_at).getTime() > Date.now()) {
                set끝나는날(data.trial_ends_at)
                set단계('이미받음')
            } else {
                set단계('번호입력')
            }
        })()
        return () => { 살아있음 = false }
    }, [isOpen])

    // 남은 시간 세기
    useEffect(() => {
        if (남은초 <= 0) return
        const t = setInterval(() => set남은초(s => (s > 0 ? s - 1 : 0)), 1000)
        return () => clearInterval(t)
    }, [남은초])

    const 번호보내기 = useCallback(async () => {
        set오류(null); set보내는중(true)
        try {
            const res = await fetch('/api/trial/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '문자를 보내지 못했어요.')
            set남은초(data.expiresInSec ?? 180)
            set단계('인증번호')
        } catch (e) {
            set오류(e instanceof Error ? e.message : '문자를 보내지 못했어요.')
        } finally {
            set보내는중(false)
        }
    }, [phone])

    const 확인하기 = useCallback(async () => {
        set오류(null); set보내는중(true)
        try {
            const res = await fetch('/api/trial/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code, referralCode: 추천입력.trim() || null }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '인증하지 못했어요.')
            set끝나는날(data.trialEndsAt)
            set단계('끝')
            onComplete?.()
        } catch (e) {
            set오류(e instanceof Error ? e.message : '인증하지 못했어요.')
        } finally {
            set보내는중(false)
        }
    }, [phone, code, 추천입력, onComplete])

    if (!isOpen) return null

    const 남은분초 = `${String(Math.floor(남은초 / 60)).padStart(1, '0')}:${String(남은초 % 60).padStart(2, '0')}`

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000 }} />
            <div
                role="dialog"
                aria-modal="true"
                style={{
                    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                    background: '#fff', borderRadius: 22, padding: '28px 24px 24px',
                    width: 'min(400px, calc(100vw - 32px))', zIndex: 2001,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                }}
            >
                <button
                    onClick={onClose}
                    aria-label="닫기"
                    style={{
                        position: 'absolute', right: 14, top: 14, width: 34, height: 34,
                        borderRadius: 999, border: 'none', background: 'var(--종이)',
                        fontSize: 17, color: 'var(--먹연)', cursor: 'pointer',
                    }}
                >
                    ✕
                </button>

                {단계 === '확인중' && (
                    <p style={{ textAlign: 'center', color: 'var(--먹연)', padding: '32px 0' }}>잠시만요…</p>
                )}

                {단계 === '번호입력' && (
                    <>
                        <h3 style={{ fontSize: 21, fontWeight: 900, margin: '4px 0 6px', letterSpacing: '-0.03em' }}>
                            클로버 {TRIAL_CLOVERS}개 받기
                        </h3>
                        <p style={{ fontSize: 15, color: 'var(--먹연)', margin: '0 0 20px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            휴대폰 번호로 한 번만 받을 수 있어요. 번호를 확인하면 클로버 {TRIAL_CLOVERS}개를 바로 드립니다.
                        </p>

                        <input
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="010 1234 5678"
                            style={입력칸}
                        />

                        {오류 && <p style={오류칸}>{오류}</p>}

                        <button
                            onClick={번호보내기}
                            disabled={보내는중 || phone.replace(/[^0-9]/g, '').length < 10}
                            style={큰단추(보내는중 || phone.replace(/[^0-9]/g, '').length < 10)}
                        >
                            {보내는중 ? '보내는 중…' : '인증번호 받기'}
                        </button>
                    </>
                )}

                {단계 === '인증번호' && (
                    <>
                        <h3 style={{ fontSize: 21, fontWeight: 900, margin: '4px 0 6px', letterSpacing: '-0.03em' }}>
                            문자로 온 6자리
                        </h3>
                        <p style={{ fontSize: 14.5, color: 'var(--먹연)', margin: '0 0 20px', lineHeight: 1.6 }}>
                            {phone} 로 보냈어요. {남은초 > 0 ? `${남은분초} 안에 입력해주세요.` : '시간이 지났어요. 다시 받아주세요.'}
                        </p>

                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="123456"
                            style={{ ...입력칸, letterSpacing: '0.3em', textAlign: 'center', fontSize: 22 }}
                        />

                        {/* 대표 지시 0915 「무료체험권 입력에 코드 입력하게 하고」 */}
                        <input
                            type="text"
                            value={추천입력}
                            onChange={(e) => set추천입력(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                            placeholder="추천코드 (없으면 비워두세요)"
                            style={{ ...입력칸, fontSize: 15, letterSpacing: '0.08em' }}
                        />

                        {오류 && <p style={오류칸}>{오류}</p>}

                        <button
                            onClick={확인하기}
                            disabled={보내는중 || code.length !== 6}
                            style={큰단추(보내는중 || code.length !== 6)}
                        >
                            {보내는중 ? '확인 중…' : '클로버 받기'}
                        </button>

                        <button
                            onClick={() => { set단계('번호입력'); setCode(''); set오류(null) }}
                            style={작은단추}
                        >
                            번호 다시 입력
                        </button>
                    </>
                )}

                {(단계 === '끝' || 단계 === '이미받음') && (
                    <>
                        <h3 style={{ fontSize: 21, fontWeight: 900, margin: '4px 0 6px', letterSpacing: '-0.03em' }}>
                            {단계 === '끝' ? '클로버를 받았어요' : '이미 받으셨어요'}
                        </h3>
                        <p style={{ fontSize: 15, color: 'var(--먹연)', margin: '0 0 16px', lineHeight: 1.6 }}>
                            클로버 {TRIAL_CLOVERS}개가 들어갔어요. 사진을 만들 때 씁니다.
                        </p>

                        {추천코드 && <div style={{ marginBottom: 16 }}><ShareInvite code={추천코드} compact /></div>}

                        {오류 && <p style={오류칸}>{오류}</p>}

                        <button onClick={onClose} style={큰단추(false)}>확인</button>
                    </>
                )}
            </div>
        </>
    )
}

const 입력칸: React.CSSProperties = {
    width: '100%', height: 54, borderRadius: 14,
    border: '1.5px solid var(--선)', background: '#fff',
    padding: '0 16px', fontSize: 17, fontWeight: 600,
    color: 'var(--먹)', marginBottom: 12, outline: 'none',
}

const 오류칸: React.CSSProperties = {
    background: '#fef2f2', color: '#dc2626', fontSize: 13.5,
    padding: '10px 14px', borderRadius: 10, margin: '0 0 12px', lineHeight: 1.5,
}

function 큰단추(막힘: boolean): React.CSSProperties {
    return {
        width: '100%', height: 54, borderRadius: 14, border: 'none',
        background: 막힘 ? '#d4d4d8' : 'var(--연두)', color: '#fff',
        fontSize: 16.5, fontWeight: 800, cursor: 막힘 ? 'default' : 'pointer',
    }
}

const 작은단추: React.CSSProperties = {
    width: '100%', height: 44, marginTop: 8, borderRadius: 12,
    border: 'none', background: 'none', color: 'var(--먹연)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
}
