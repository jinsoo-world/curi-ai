'use client'
// 캐릭터 = 도형 1 + 눈 2 (그록봇 문법) + 네잎클로버. 라이브러리 0, 그림 생성 API 0 = 비용 0·즉시.
// 움직임은 data-state 하나로 avatar.css 가 바꾸고, 「불규칙」이 필요한 것(깜빡임·찡긋·말 리듬·장애 눈)만 여기 JS 가 시간을 잡는다.
// 눈 자리·글자 계산은 avatar.ts(순수 함수)에 있다. 색·모양 이름은 team_bots 표의 값과 같다.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { BotColor, BotShape, BotState } from '@/domains/os/types'
import {
    ERROR_X_MS, ariaLabel, avatarClass, badgePx, eyeKind, eyeLayout, facePx,
    isDoubleBlink, nextBlinkDelay, nextWinkDelay, shouldBlink, showsBadge, showsThinkDots, showsWorkDots, showsZ, talkBeatMs,
} from './avatar'
import './avatar.css'

const PATHS: Record<BotShape, string> = {
    // 100×100 좌표계
    circle: 'M50 4 a46 46 0 1 0 0.01 0 Z',
    hex: 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z',
    square: 'M22 6 H78 Q94 6 94 22 V78 Q94 94 78 94 H22 Q6 94 6 78 V22 Q6 6 22 6 Z',
    egg: 'M50 4 C74 4 92 30 92 58 C92 82 74 96 50 96 C26 96 8 82 8 58 C8 30 26 4 50 4 Z',
    drop: 'M50 4 C62 26 92 44 92 64 C92 84 74 96 50 96 C26 96 8 84 8 64 C8 44 38 26 50 4 Z',
    clover: '',   // 클로버는 path 대신 잎(원) 4장 + 가운데 심으로 그린다 (아래 CLOVER)
}

/** 네잎클로버 = 잎 4장(대각선) + 가운데 심. 잎 네 장이 한 점에서 만나면 얼굴 자리가 없어서 심 위에 눈이 앉는다 */
const CLOVER: [number, number, number][] = [
    [33, 33, 22], [67, 33, 22], [33, 67, 22], [67, 67, 22], // 잎
    [50, 50, 17],                                            // 심
]

const BLINK_MS = 120
const WINK_MS = 170
const DOUBLE_GAP_MS = 260

export interface BotAvatarProps {
    shape: BotShape
    color: BotColor
    state?: BotState
    /** 화면 픽셀. 36(대화 머리)·44(도형 고르기)·72(명단)·96(새 봇 미리보기) 를 쓴다 */
    size?: number
    /** 리더 얼굴 사진(만든 사람 배지). 있으면 오른쪽 아래에 붙는다 */
    faceUrl?: string | null
    /** 봇 이름. aria-label 이 「이름, 상태」로 읽힌다 */
    name?: string
    title?: string
}

/** 브라우저의 「움직임 줄이기」 설정. 켜져 있으면 JS 시간표(깜빡임·찡긋)를 아예 안 돌린다 */
function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
        if (!mq) return
        const apply = () => setReduced(mq.matches)
        apply()
        mq.addEventListener('change', apply)
        return () => mq.removeEventListener('change', apply)
    }, [])
    return reduced
}

/** 여러 setTimeout 을 한 묶음으로 잡아 두고 한 번에 지운다 */
function useTimers() {
    const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
    const set = (fn: () => void, ms: number) => {
        const t = setTimeout(() => { timers.current.delete(t); fn() }, ms)
        timers.current.add(t)
        return t
    }
    const clearAll = () => { timers.current.forEach(clearTimeout); timers.current.clear() }
    return { set, clearAll }
}

export default function BotAvatar({ shape, color, state = 'idle', size = 72, faceUrl, name, title }: BotAvatarProps) {
    const fill = `var(--봇-${color})`
    const geo = eyeLayout(shape)
    const reduced = useReducedMotion()

    const [blinking, setBlinking] = useState(false)
    const [wink, setWink] = useState<'L' | 'R' | null>(null)
    const [talkBeat, setTalkBeat] = useState(500)
    const [errorX, setErrorX] = useState(true)

    // 1) 깜빡임 = 3~6초 불규칙, 다섯 번에 한 번은 두 번 연속
    const blinkTimers = useTimers()
    useEffect(() => {
        if (reduced || !shouldBlink(state)) { setBlinking(false); return }
        const { set, clearAll } = blinkTimers
        const once = (after?: () => void) => {
            setBlinking(true)
            set(() => { setBlinking(false); after?.() }, BLINK_MS)
        }
        const schedule = () => set(() => {
            if (isDoubleBlink(Math.random())) once(() => set(() => once(schedule), DOUBLE_GAP_MS))
            else once(schedule)
        }, nextBlinkDelay(Math.random()))
        schedule()
        return clearAll
        // blinkTimers 는 ref 묶음이라 바뀌지 않는다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, reduced])

    // 2) 말하는 중 = 가끔 한쪽 눈 찡긋 + 첫 박자 랜덤
    const winkTimers = useTimers()
    useEffect(() => {
        if (state !== 'talking' || reduced) { setWink(null); return }
        setTalkBeat(talkBeatMs(Math.random()))
        const { set, clearAll } = winkTimers
        const schedule = () => set(() => {
            setWink(Math.random() < 0.5 ? 'L' : 'R')
            set(() => { setWink(null); schedule() }, WINK_MS)
        }, nextWinkDelay(Math.random()))
        schedule()
        return clearAll
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, reduced])

    // 3) 장애 = x x 를 0.6초 보여 주고 「– –」
    useEffect(() => {
        if (state !== 'error') { setErrorX(true); return }
        const t = setTimeout(() => setErrorX(false), ERROR_X_MS)
        return () => clearTimeout(t)
    }, [state])

    const kind = eyeKind(state, errorX)
    const eyeColor = 'var(--os-바탕)'   // 모든 몸색 위에서 어두운 눈. 흰 몸도 같은 눈
    const style = {
        width: size, height: size,
        '--배지': `${badgePx(size)}px`,
        '--얼굴': `${facePx(size)}px`,
        '--말함-주기': `${talkBeat}ms`,
    } as CSSProperties

    const eye = (x: number, side: 'left' | 'right') => {
        const cls = `eye eye-${side}`
        if (kind === 'x') {
            const a = geo.w * 0.9
            return (
                <path className={cls} stroke={eyeColor} strokeWidth={geo.w * 0.7} strokeLinecap="round" fill="none"
                    d={`M${x - a} ${geo.cy - a} l${a * 2} ${a * 2} M${x + a} ${geo.cy - a} l${-a * 2} ${a * 2}`} />
            )
        }
        if (kind === 'flat') {
            const w = geo.w + 4
            return <rect className={cls} x={x - w / 2} y={geo.cy - 1.6} width={w} height={3.2} rx={1.6} fill={eyeColor} />
        }
        return <rect className={cls} x={x - geo.w / 2} y={geo.cy - geo.h / 2} width={geo.w} height={geo.h} rx={geo.w / 2} fill={eyeColor} />
    }

    return (
        <span
            className={avatarClass({ blinking, wink, faceUrl })}
            data-state={state}
            data-shape={shape}
            role="img"
            aria-label={ariaLabel(name ?? title, state)}
            title={title}
            style={style}
        >
            <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
                <g className="body" onAnimationIteration={state === 'talking' ? () => setTalkBeat(talkBeatMs(Math.random())) : undefined}>
                    {shape === 'clover'
                        ? CLOVER.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} />)
                        : <path d={PATHS[shape]} fill={fill} />}
                </g>
                <g className="eye-pos eye-pos-left">{eye(geo.lx, 'left')}</g>
                <g className="eye-pos eye-pos-right">{eye(geo.rx, 'right')}</g>
                {/* 🍑 귀여움: 볼터치 2개 + 작은 미소 (대표 0923 「조금 더 귀엽게, 그록봇 느낌 살짝 빼고」). 자는 중·장애일 땐 미소를 감춘다 */}
                {state !== 'error' && (
                    <g className="cute" aria-hidden="true">
                        <circle cx={geo.lx - 4} cy={geo.cy + 12} r="4.6" fill="rgba(255, 128, 150, 0.38)" />
                        <circle cx={geo.rx + 4} cy={geo.cy + 12} r="4.6" fill="rgba(255, 128, 150, 0.38)" />
                        {state !== 'sleeping' && (
                            <path d={`M${50 - 5.5} ${geo.cy + 10.5} q5.5 4.5 11 0`} stroke={eyeColor} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.85" />
                        )}
                    </g>
                )}

                {showsThinkDots(state) && (
                    <g className="dots think">
                        <circle cx="38" cy={geo.dotsY} r="4" /><circle cx="50" cy={geo.dotsY} r="4" /><circle cx="62" cy={geo.dotsY} r="4" />
                    </g>
                )}
                {showsWorkDots(state) && (
                    <g className="dots work">
                        <circle cx="40" cy={geo.workY} r="3" /><circle cx="50" cy={geo.workY} r="3" /><circle cx="60" cy={geo.workY} r="3" />
                    </g>
                )}
                {showsZ(state) && (
                    <g className="zz-wrap">
                        <text className="zz zz-1" x={geo.zX} y={geo.zY} fontSize="15" fontWeight="800">z</text>
                        <text className="zz zz-2" x={geo.zX + 9} y={geo.zY - 9} fontSize="11" fontWeight="800">z</text>
                    </g>
                )}
            </svg>
            {showsBadge(state) && <span className="badge" aria-hidden="true">!</span>}
            {/* 리더 얼굴은 외부 저장소 주소라 next/image 최적화 대상이 아니다(작은 배지) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {faceUrl && <img className="face-badge" src={faceUrl} alt="" />}
        </span>
    )
}
