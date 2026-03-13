'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

/**
 * 🍀 CloverHunt — 네잎클로버 보물찾기 글로벌 컴포넌트
 *
 * 트리거 조건:
 * 1. 페이지 이동 시 30% 확률
 * 2. 채팅에서 2번째 질문마다 (window 'clover-chat-trigger' 이벤트)
 * 3. 1분 이상 idle 시 10% 깜짝 출현
 *
 * 🎰 가변 보상 / ✨ 황금 클로버 / ⏳ 긴장감 / 📱 타격감 / 🏆 올클리어
 */

const APPEAR_CHANCE = 0.30
const DISPLAY_DURATION = 8000
const COOLDOWN_MS = 15000
const EXTENDED_THRESHOLD = 600
const IDLE_BONUS_CHANCE = 0.10
const MAX_PER_PAGE = 2             // 각 페이지에서 최대 2개

function playSound(type: 'appear' | 'claim' | 'golden' | 'allclear') {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        if (type === 'appear') {
            osc.type = 'sine'
            osc.frequency.setValueAtTime(600, ctx.currentTime)
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15)
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3)
            gain.gain.setValueAtTime(0.12, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
            osc.start(); osc.stop(ctx.currentTime + 0.4)
        } else if (type === 'claim') {
            osc.type = 'square'
            osc.frequency.setValueAtTime(880, ctx.currentTime)
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08)
            osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.16)
            gain.gain.setValueAtTime(0.08, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
            osc.start(); osc.stop(ctx.currentTime + 0.35)
        } else if (type === 'golden') {
            osc.type = 'square'
            osc.frequency.setValueAtTime(523, ctx.currentTime)
            osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1)
            osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2)
            osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.3)
            gain.gain.setValueAtTime(0.1, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
            osc.start(); osc.stop(ctx.currentTime + 0.5)
        } else if (type === 'allclear') {
            osc.type = 'triangle'
            osc.frequency.setValueAtTime(523, ctx.currentTime)
            osc.frequency.setValueAtTime(659, ctx.currentTime + 0.12)
            osc.frequency.setValueAtTime(784, ctx.currentTime + 0.24)
            osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.36)
            osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.48)
            gain.gain.setValueAtTime(0.12, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7)
            osc.start(); osc.stop(ctx.currentTime + 0.7)
        }
    } catch { /* 사운드 미지원 무시 */ }
}

function triggerHaptic(pattern: number[] = [30, 50, 30]) {
    try {
        if ('vibrate' in navigator) navigator.vibrate(pattern)
    } catch { /* ignore */ }
}

export default function CloverHunt() {
    const pathname = usePathname()
    const sessionStart = useRef(Date.now())
    const lastAppear = useRef(0)
    const pageAppearCount = useRef(0)  // 현재 페이지 출현 수

    const [visible, setVisible] = useState(false)
    const [position, setPosition] = useState({ top: 50, left: 50 })
    const [phase, setPhase] = useState<'idle' | 'appear' | 'urgent' | 'claimed' | 'missed'>('idle')
    const [todayCount, setTodayCount] = useState(0)
    const [dailyLimit, setDailyLimit] = useState(3)
    const [totalClovers, setTotalClovers] = useState(0)

    const [isGolden, setIsGolden] = useState(false)
    const [earnedAmount, setEarnedAmount] = useState(0)
    const [bonusAmount, setBonusAmount] = useState(0)
    const [isAllClear, setIsAllClear] = useState(false)
    const [showConfetti, setShowConfetti] = useState(false)

    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const urgentTimerRef = useRef<NodeJS.Timeout | null>(null)

    const getSessionDuration = useCallback(() => {
        return Math.floor((Date.now() - sessionStart.current) / 1000)
    }, [])

    // 오늘 현황 로드
    const loadStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/clover-hunt/claim')
            const data = await res.json()
            if (data.ok) {
                setTodayCount(data.todayCount)
                setDailyLimit(
                    data.firstDay
                        ? data.baseDailyLimit  // 첫날은 5
                        : getSessionDuration() >= EXTENDED_THRESHOLD
                            ? data.extendedDailyLimit
                            : data.baseDailyLimit
                )
            }
        } catch { /* ignore */ }
    }, [getSessionDuration])

    useEffect(() => { loadStatus() }, [loadStatus])

    // 10분 경과 시 한도 확장
    useEffect(() => {
        const interval = setInterval(() => {
            if (getSessionDuration() >= EXTENDED_THRESHOLD) setDailyLimit(5)
        }, 30000)
        return () => clearInterval(interval)
    }, [getSessionDuration])

    // 1분 이상 머물면 10% 확률 깜짝 출현
    useEffect(() => {
        const idleTimer = setInterval(() => {
            if (visible || todayCount >= dailyLimit) return
            if (pageAppearCount.current >= MAX_PER_PAGE) return
            if (Date.now() - lastAppear.current < COOLDOWN_MS) return
            if (Math.random() < IDLE_BONUS_CHANCE) spawnClover()
        }, 60000)
        return () => clearInterval(idleTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, todayCount, dailyLimit])

    // 클로버 스폰
    const spawnClover = useCallback(() => {
        if (todayCount >= dailyLimit) return
        if (pageAppearCount.current >= MAX_PER_PAGE) return
        if (Date.now() - lastAppear.current < COOLDOWN_MS) return

        pageAppearCount.current += 1

        const top = 20 + Math.random() * 55
        const left = 10 + Math.random() * 75
        const golden = Math.random() < 0.05
        setPosition({ top, left })
        setIsGolden(golden)
        setPhase('appear')
        setVisible(true)
        lastAppear.current = Date.now()

        playSound(golden ? 'golden' : 'appear')

        urgentTimerRef.current = setTimeout(() => {
            setPhase('urgent')
        }, 5000)

        timerRef.current = setTimeout(() => {
            setPhase('missed')
            setTimeout(() => {
                setVisible(false)
                setPhase('idle')
                setIsGolden(false)
            }, 800)
        }, DISPLAY_DURATION)
    }, [todayCount, dailyLimit])

    // 페이지 이동 시 카운터 리셋 + 출현 체크
    useEffect(() => {
        pageAppearCount.current = 0  // 페이지 바뀌면 리셋
        if (visible) return
        if (pathname.startsWith('/admin')) return
        if (Math.random() > APPEAR_CHANCE) return
        spawnClover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname])

    // 🎯 채팅 트리거 이벤트 리스너 (2번째 질문마다 등장)
    useEffect(() => {
        const handleChatTrigger = () => {
            if (visible) return
            spawnClover()
        }
        window.addEventListener('clover-chat-trigger', handleChatTrigger)
        return () => window.removeEventListener('clover-chat-trigger', handleChatTrigger)
    }, [visible, spawnClover])

    // 🍀 클릭!
    const handleClaim = useCallback(async () => {
        if (phase !== 'appear' && phase !== 'urgent') return

        if (timerRef.current) clearTimeout(timerRef.current)
        if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current)

        setPhase('claimed')

        triggerHaptic(isGolden ? [50, 30, 50, 30, 80] : [30, 50, 30])

        try {
            const res = await fetch('/api/clover-hunt/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionDuration: getSessionDuration() }),
            })
            const data = await res.json()
            if (data.ok) {
                setTodayCount(data.todayCount)
                setDailyLimit(data.dailyLimit)
                setTotalClovers(data.clovers)
                setEarnedAmount(data.earned)
                setBonusAmount(data.bonusEarned || 0)
                setIsAllClear(data.isAllClear)
                setIsGolden(data.isGolden)

                if (data.isGolden) playSound('golden')
                else if (data.isAllClear) playSound('allclear')
                else playSound('claim')

                if (data.isAllClear) {
                    triggerHaptic([50, 30, 50, 30, 80, 30, 100])
                    setShowConfetti(true)
                    setTimeout(() => setShowConfetti(false), 3500)
                }
            }
        } catch { /* ignore */ }

        setTimeout(() => {
            setVisible(false)
            setPhase('idle')
            setIsGolden(false)
            setIsAllClear(false)
            setEarnedAmount(0)
            setBonusAmount(0)
        }, 2800)
    }, [phase, isGolden, getSessionDuration])

    if (!visible && !showConfetti) return null

    return (
        <>
            {/* 🏆 Confetti */}
            {showConfetti && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    pointerEvents: 'none', overflow: 'hidden',
                }}>
                    {Array.from({ length: 60 }).map((_, i) => (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                top: '-10px',
                                left: `${Math.random() * 100}%`,
                                width: `${6 + Math.random() * 8}px`,
                                height: `${6 + Math.random() * 8}px`,
                                background: ['#22c55e', '#facc15', '#f472b6', '#60a5fa', '#fb923c', '#a78bfa'][i % 6],
                                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                                animation: `confettiFall ${2 + Math.random() * 2}s ease-out forwards`,
                                animationDelay: `${Math.random() * 0.5}s`,
                                transform: `rotate(${Math.random() * 360}deg)`,
                            }}
                        />
                    ))}
                </div>
            )}

            {visible && (
                <>
                    <div
                        onClick={handleClaim}
                        style={{
                            position: 'fixed',
                            top: `${position.top}%`,
                            left: `${position.left}%`,
                            zIndex: 9000,
                            cursor: (phase === 'appear' || phase === 'urgent') ? 'pointer' : 'default',
                            pointerEvents: (phase === 'appear' || phase === 'urgent') ? 'auto' : 'none',
                            transform: 'translate(-50%, -50%)',
                        }}
                    >
                        {isGolden && (phase === 'appear' || phase === 'urgent') && (
                            <div style={{
                                position: 'absolute',
                                top: '50%', left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: 80, height: 80,
                                borderRadius: '50%',
                                background: 'radial-gradient(circle, rgba(250,204,21,0.4) 0%, transparent 70%)',
                                animation: 'goldenPulse 1s ease-in-out infinite',
                            }} />
                        )}

                        <div
                            className={
                                phase === 'appear' ? 'clover-wiggle' :
                                phase === 'urgent' ? 'clover-urgent' :
                                phase === 'claimed' ? 'clover-burst' :
                                phase === 'missed' ? 'clover-fadeout' : ''
                            }
                            style={{
                                fontSize: isGolden ? 52 : 42,
                                filter: isGolden
                                    ? 'drop-shadow(0 0 16px rgba(250,204,21,0.8))'
                                    : 'drop-shadow(0 4px 12px rgba(34,197,94,0.4))',
                                userSelect: 'none',
                                position: 'relative',
                                zIndex: 1,
                            }}
                        >
                            {isGolden ? '🌟' : '🍀'}
                        </div>

                        {(phase === 'appear' || phase === 'urgent') && (
                            <div style={{
                                position: 'absolute',
                                top: '100%', left: '50%',
                                transform: 'translateX(-50%)',
                                marginTop: 6,
                                whiteSpace: 'nowrap',
                                fontSize: 12, fontWeight: 600,
                                color: isGolden ? '#b45309' : phase === 'urgent' ? '#dc2626' : '#16a34a',
                                background: isGolden ? 'rgba(254,249,195,0.95)' : 'rgba(255,255,255,0.95)',
                                padding: '4px 10px',
                                borderRadius: 8,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                animation: phase === 'urgent' ? 'urgentBlink 0.4s ease-in-out infinite' : 'cloverHintPulse 1.5s ease-in-out infinite',
                                border: isGolden ? '1px solid #fbbf24' : 'none',
                            }}>
                                {isGolden ? '✨ 황금 클로버!' : phase === 'urgent' ? '⚡ 빨리 터치!' : '터치해서 클로버 GET'}
                            </div>
                        )}

                        {phase === 'claimed' && (
                            <div style={{
                                position: 'absolute',
                                top: '-20px', left: '50%',
                                transform: 'translateX(-50%)',
                                animation: 'cloverEarnFloat 2s ease-out forwards',
                            }}>
                                <div style={{
                                    fontSize: isGolden ? 24 : 20,
                                    fontWeight: 800,
                                    color: isGolden ? '#b45309' : '#16a34a',
                                    textShadow: isGolden ? '0 0 12px rgba(250,204,21,0.6)' : '0 2px 4px rgba(0,0,0,0.1)',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {isGolden ? `🌟 +${earnedAmount} 잭팟!` : `+${earnedAmount} 🍀`}
                                </div>
                            </div>
                        )}

                        {phase === 'missed' && (
                            <div style={{
                                position: 'absolute',
                                top: '100%', left: '50%',
                                transform: 'translateX(-50%)',
                                marginTop: 4,
                                fontSize: 12, color: '#9ca3af',
                                whiteSpace: 'nowrap', fontWeight: 600,
                                animation: 'cloverEarnFloat 1s ease-out forwards',
                            }}>
                                앗, 놓쳤다...
                            </div>
                        )}
                    </div>

                    {phase === 'claimed' && (
                        <div style={{
                            position: 'fixed',
                            bottom: 80, left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 9999,
                            background: isGolden
                                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                : isAllClear
                                    ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff',
                            padding: '14px 24px',
                            borderRadius: 16,
                            boxShadow: isGolden
                                ? '0 8px 32px rgba(245,158,11,0.5)'
                                : '0 8px 32px rgba(34,197,94,0.4)',
                            animation: 'cloverToastIn 0.4s ease-out',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            fontSize: 15, fontWeight: 700,
                            maxWidth: '90vw',
                        }}>
                            <span style={{ fontSize: 28 }}>
                                {isGolden ? '🌟' : isAllClear ? '🎉' : '🍀'}
                            </span>
                            <div>
                                <div>
                                    {isGolden
                                        ? `황금 클로버 잭팟! +${earnedAmount}`
                                        : isAllClear
                                            ? `올클리어! +${earnedAmount} + 보너스 +${bonusAmount}`
                                            : `네잎클로버 발견! +${earnedAmount}`
                                    }
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>
                                    오늘 {todayCount}/{dailyLimit}개 발견
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            <style>{`
                @keyframes cloverWiggle {
                    0%, 100% { transform: rotate(0deg) scale(1); }
                    15% { transform: rotate(-12deg) scale(1.1); }
                    30% { transform: rotate(10deg) scale(1.05); }
                    45% { transform: rotate(-8deg) scale(1.1); }
                    60% { transform: rotate(6deg) scale(1.05); }
                    75% { transform: rotate(-4deg) scale(1.08); }
                }
                .clover-wiggle { animation: cloverWiggle 2s ease-in-out infinite; }
                @keyframes cloverUrgent {
                    0%, 100% { transform: scale(1) rotate(0); }
                    10% { transform: scale(1.15) rotate(-8deg); }
                    20% { transform: scale(0.95) rotate(6deg); }
                    30% { transform: scale(1.12) rotate(-5deg); }
                    40% { transform: scale(0.98) rotate(4deg); }
                    50% { transform: scale(1.1) rotate(-3deg); }
                    60% { transform: scale(1) rotate(2deg); }
                    70% { transform: scale(1.08) rotate(-2deg); }
                    80% { transform: scale(0.97) rotate(1deg); }
                    90% { transform: scale(1.05) rotate(-1deg); }
                }
                .clover-urgent {
                    animation: cloverUrgent 0.5s ease-in-out infinite;
                    filter: drop-shadow(0 0 8px rgba(239,68,68,0.5)) !important;
                }
                @keyframes cloverBurst {
                    0% { transform: scale(1); opacity: 1; }
                    30% { transform: scale(1.8); opacity: 1; }
                    100% { transform: scale(2.5); opacity: 0; }
                }
                .clover-burst { animation: cloverBurst 0.8s ease-out forwards; }
                @keyframes cloverFadeout {
                    0% { transform: scale(1) rotate(0); opacity: 1; }
                    30% { transform: scale(0.9) rotate(15deg); opacity: 0.6; }
                    60% { transform: scale(0.6) rotate(-10deg); opacity: 0.3; }
                    100% { transform: scale(0.2) rotate(30deg); opacity: 0; }
                }
                .clover-fadeout { animation: cloverFadeout 0.8s ease-in forwards; }
                @keyframes cloverEarnFloat {
                    0% { transform: translateX(-50%) translateY(0); opacity: 1; }
                    100% { transform: translateX(-50%) translateY(-60px); opacity: 0; }
                }
                @keyframes cloverToastIn {
                    0% { transform: translateX(-50%) translateY(30px); opacity: 0; }
                    100% { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                @keyframes cloverHintPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
                @keyframes urgentBlink {
                    0%, 100% { opacity: 1; background: rgba(254,226,226,0.95); }
                    50% { opacity: 0.8; background: rgba(254,202,202,0.95); }
                }
                @keyframes goldenPulse {
                    0%, 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.6; }
                    50% { transform: translate(-50%,-50%) scale(1.3); opacity: 0.3; }
                }
                @keyframes confettiFall {
                    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
            `}</style>
        </>
    )
}
