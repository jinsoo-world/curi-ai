'use client'
// 캐릭터 = 도형 1 + 눈 2 (그록봇 문법) + 네잎클로버. 라이브러리 0, 그림 생성 API 0 = 비용 0, 즉시.
// 움직임은 data-state 하나로 avatar.css 가 바꾸고, 「불규칙」이 필요한 것(깜빡임, 찡긋, 말 리듬, 장애 눈)만 여기 JS 가 시간을 잡는다.
// 눈 자리, 글자 계산은 avatar.ts(순수 함수)에 있다. 색, 모양 이름은 team_bots 표의 값과 같다.

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import type { BotColor, BotShape, BotState } from '@/domains/os/types'
import {
    ERROR_X_MS, IDLE_DROWSY_MS, ariaLabel, avatarClass, badgePx, blinkHoldMs, eyeKind, eyeLayout, eyeR, facePx,
    presenceTone, presenceLabel,
    faceBorderPx, faceClipId, faceTiltPeriodMs, isDoubleBlink, nextBlinkDelay, nextWinkDelay, shouldBlink, showsBadge,
    showsFace, showsFaceThinkDots, showsThinkDots, showsWorkDots, showsZ, startDrowsyTimer, talkBeatMs,
} from './avatar'
import { borderCssFromHex, extractFaceBorderColor } from './faceBorderColor'
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

const WINK_MS = 170
const DOUBLE_GAP_MS = 260

export interface BotAvatarProps {
    shape: BotShape
    color: BotColor
    state?: BotState
    /** 화면 픽셀. 36(대화 머리), 44(도형 고르기), 72(명단), 96(새 봇 미리보기) 를 쓴다 */
    size?: number
    /** 쉬는 중 이만큼(ms) 말이 없으면 눈이 스르륵 감긴다. 기본 5분 */
    idleAfterMs?: number
    /** 봇 프로필 사진. 있으면 그린 얼굴 대신 도형 안에 이 사진을 채운다(불러오기 실패하면 그린 얼굴로 되돌아간다) */
    faceUrl?: string | null
    /** 사진 얼굴 테두리. color=악센트 링(기본, 명단/대화), shadow=은은한 그림자(마켓), none=테두리 없음 */
    faceRim?: 'color' | 'shadow' | 'none'
    /** 봇 이름. aria-label 이 「이름, 상태」로 읽힌다 */
    name?: string
    title?: string
}

/** 브라우저의 「움직임 줄이기」 설정. 켜져 있으면 JS 시간표(깜빡임, 찡긋)를 아예 안 돌린다 */
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


/** 사진 얼굴 테두리: URL 에서 악센트 색을 뽑아 stroke 에 쓴다. 실패·CORS 면 봇 색 변수로 폴백. URL 캐시는 faceBorderColor 모듈 Map */
function useFaceBorderStroke(faceUrl: string | null | undefined, enabled: boolean, fallback: string): string {
    const [stroke, setStroke] = useState(fallback)
    useEffect(() => {
        if (!enabled || !faceUrl) { setStroke(fallback); return }
        let cancelled = false
        setStroke(fallback) // URL 바뀌는 동안 잠깐 기본색, 뽑히면 교체
        extractFaceBorderColor(faceUrl).then((hex) => {
            if (cancelled) return
            setStroke(borderCssFromHex(hex, fallback))
        })
        return () => { cancelled = true }
    }, [faceUrl, enabled, fallback])
    return enabled ? stroke : fallback
}

export default function BotAvatar({ shape, color, state = 'idle', size = 72, idleAfterMs = IDLE_DROWSY_MS, faceUrl, faceRim = 'color', name, title }: BotAvatarProps) {
    const fill = `var(--봇-${color})`
    const geo = eyeLayout(shape)
    const reduced = useReducedMotion()
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')   // 눈꺼풀 clipPath id. 한 화면에 봇이 여럿이라 겹치면 안 된다

    const [blinking, setBlinking] = useState(false)
    const [wink, setWink] = useState<'L' | 'R' | null>(null)
    const [talkBeat, setTalkBeat] = useState(500)
    const [errorX, setErrorX] = useState(true)
    const [drowsy, setDrowsy] = useState(false)

    // 사진 얼굴: 봇에 이미 프로필 사진(faceUrl)이 있으면 그린 얼굴 대신 그 사진을 몸 도형 안에 채운다(대표 0923 「있는 사진은 그걸 써」).
    // 불러오다 실패(onError)하면 원래 그린 캐릭터 얼굴로 조용히 되돌아간다
    const [faceError, setFaceError] = useState(false)
    useEffect(() => { setFaceError(false) }, [faceUrl])
    const hasFace = showsFace(faceUrl, faceError)
    const faceClip = faceClipId(uid)
    const faceBorderW = faceBorderPx(size) * (100 / size)   // px → 100 좌표계 단위로 환산(테두리가 크기와 무관하게 3~4px로 보이게)
    // 사진 + faceRim=color 일 때만 테두리 색을 사진에서 뽑는다. shadow/none 은 링을 그리지 않는다(마켓은 shadow)
    const showColorRim = hasFace && faceRim === 'color'
    const faceBorderStroke = useFaceBorderStroke(faceUrl, showColorRim, fill)
    const [tiltMs] = useState(() => faceTiltPeriodMs(Math.random()))   // idle 갸웃 간격 6~9초, 봇마다 달라 보이게 한 번만 뽑는다

    // 0) 졸음 = 쉬는 중이 5분(+봇마다 0~20초) 이어지면 눈꺼풀이 천천히 내려온다. 상태가 바뀌면(말을 걸면) 바로 뜬다
    useEffect(() => {
        setDrowsy(false)
        if (state !== 'idle' || reduced) return
        return startDrowsyTimer(idleAfterMs, Math.random(), () => setDrowsy(true))
    }, [state, reduced, idleAfterMs])

    // 1) 깜빡임 = 3~6초 불규칙, 다섯 번에 한 번은 두 번 연속
    const blinkTimers = useTimers()
    useEffect(() => {
        if (reduced || !shouldBlink(state)) { setBlinking(false); return }
        const { set, clearAll } = blinkTimers
        const once = (after?: () => void) => {
            setBlinking(true)
            set(() => { setBlinking(false); after?.() }, blinkHoldMs(drowsy))
        }
        const schedule = () => set(() => {
            if (isDoubleBlink(Math.random())) once(() => set(() => once(schedule), DOUBLE_GAP_MS))
            else once(schedule)
        }, nextBlinkDelay(Math.random()))
        schedule()
        return clearAll
        // blinkTimers 는 ref 묶음이라 바뀌지 않는다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, reduced, drowsy])

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
        // 사진 얼굴이 아니면 대표가 확정한 기존 캐릭터 화면을 한 글자도 안 바꾼다 — 이 변수도 사진 모드에서만 넣는다
        ...(hasFace ? { '--갸웃-주기': `${tiltMs}ms` } : {}),
    } as CSSProperties

    // 👀 동그란 눈 = 검은 테 + 흰 눈알 + 검은 눈동자(살짝 위, 바깥) + 흰 반짝 점 (대표 0923 「눈은 동그랗게, 검정 안에 흰 점」)
    //    + 눈꺼풀(몸 색, 눈알 모양으로 잘라 얹음) = 졸릴 때(is-drowsy) 반쯤 내려온다. 위치는 avatar.css 가 옮긴다
    const R = eyeR(geo.w)
    const stroke = R * 0.26
    const rim = R + stroke / 2
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
            const w = R * 2
            return <rect className={cls} x={x - w / 2} y={geo.cy - 1.6} width={w} height={3.2} rx={1.6} fill={eyeColor} />
        }
        const clipId = `${uid}-lid-${side}`
        const lidTop = geo.cy - rim - 1
        const lidH = (rim + 1) * 2
        return (
            <g className={cls}>
                <circle cx={x} cy={geo.cy} r={R} fill="#fff" stroke={eyeColor} strokeWidth={stroke} />
                <g className="pupil">
                    {/* 두 눈동자가 같은 쪽(오른쪽 위)을 본다. 일할 땐 CSS 가 좌우로 움직인다 */}
                    <circle cx={x + R * 0.18} cy={geo.cy - R * 0.12} r={R * 0.6} fill={eyeColor} />
                    <circle cx={x + R * 0.42} cy={geo.cy - R * 0.4} r={R * 0.2} fill="#fff" />
                </g>
                <clipPath id={clipId}><circle cx={x} cy={geo.cy} r={rim} /></clipPath>
                <g clipPath={`url(#${clipId})`}>
                    <g className="lid">
                        <rect x={x - rim - 1} y={lidTop} width={lidH} height={lidH} fill={fill} />
                        <rect x={x - rim - 1} y={lidTop + lidH - stroke * 0.8} width={lidH} height={stroke * 0.8} fill={eyeColor} />
                    </g>
                </g>
            </g>
        )
    }

    return (
        <span
            className={`${avatarClass({ blinking, wink, drowsy, faceUrl: hasFace ? faceUrl : undefined })}${showsBadge(state) ? ' has-badge' : ''}${hasFace && faceRim === 'shadow' ? ' face-rim-shadow' : ''}`}
            data-state={state}
            data-shape={shape}
            data-face-rim={hasFace ? faceRim : undefined}
            role="img"
            aria-label={ariaLabel(name ?? title, state)}
            title={title}
            style={style}
        >
            <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
                <g className="body" onAnimationIteration={state === 'talking' ? () => setTalkBeat(talkBeatMs(Math.random())) : undefined}>
                    {hasFace ? (
                        <>
                            {/* 사진을 봇 도형 모양으로 잘라 몸에 채운다. 클로버는 잎 4장 + 심을 그대로 자름틀로 쓴다 */}
                            <clipPath id={faceClip}>
                                {shape === 'clover'
                                    ? CLOVER.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)
                                    : <path d={PATHS[shape]} />}
                            </clipPath>
                            <g clipPath={`url(#${faceClip})`}>
                                <image href={faceUrl ?? ''} x="0" y="0" width="100" height="100"
                                    preserveAspectRatio="xMidYMid slice" onError={() => setFaceError(true)} />
                            </g>
                            {showColorRim && (
                            <g className="face-border">
                                {shape === 'clover'
                                    ? CLOVER.map(([cx, cy, r]) => (
                                        <circle key={`b-${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="none" stroke={faceBorderStroke} strokeWidth={faceBorderW} />
                                    ))
                                    : <path d={PATHS[shape]} fill="none" stroke={faceBorderStroke} strokeWidth={faceBorderW} />}
                            </g>
                            )}
                        </>
                    ) : (
                        shape === 'clover'
                            ? CLOVER.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} />)
                            : <path d={PATHS[shape]} fill={fill} />
                    )}
                </g>
                {!hasFace && (
                    <>
                        <g className="eye-pos eye-pos-left">{eye(geo.lx, 'left')}</g>
                        <g className="eye-pos eye-pos-right">{eye(geo.rx, 'right')}</g>
                        {/* 🍑 귀여움: 볼터치 2개 + 작은 미소 (대표 0923 「조금 더 귀엽게, 그록봇 느낌 살짝 빼고」). 자는 중, 장애일 땐 미소를 감춘다 */}
                        {state !== 'error' && (
                            <g className="cute" aria-hidden="true">
                                <circle cx={geo.lx - R * 0.9} cy={geo.cy + R * 1.3} r={R * 0.48} fill="rgba(255, 128, 150, 0.38)" />
                                <circle cx={geo.rx + R * 0.9} cy={geo.cy + R * 1.3} r={R * 0.48} fill="rgba(255, 128, 150, 0.38)" />
                                {state !== 'sleeping' && (
                                    <rect className="mouth" x={50 - R * 0.36} y={geo.cy + R * 1.45} width={R * 0.72} height={R * 0.9} rx={R * 0.36}
                                        fill="#fff" stroke={eyeColor} strokeWidth={R * 0.2} />
                                )}
                            </g>
                        )}
                    </>
                )}

                {showsThinkDots(state) && (
                    <g className="dots think">
                        <circle cx="38" cy={geo.dotsY} r="4" /><circle cx="50" cy={geo.dotsY} r="4" /><circle cx="62" cy={geo.dotsY} r="4" />
                    </g>
                )}
                {/* 사진 얼굴 + 생각 중: 눈이 없어 위 점 대신 몸 아래에 점 3개(고리 회전과 같이 돈다) */}
                {showsFaceThinkDots(hasFace, state) && (
                    <g className="dots think">
                        <circle cx="38" cy={geo.workY} r="4" /><circle cx="50" cy={geo.workY} r="4" /><circle cx="62" cy={geo.workY} r="4" />
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
            {/* 상태 동그라미 (초록=가능, 노랑=바쁨, 빨강=장애, 회색=잠). 승인 ! 이 있으면 CSS 가 동그라미를 숨긴다 */}
            <span className="presence" data-tone={presenceTone(state)} title={presenceLabel(presenceTone(state))} aria-hidden="true" />
            {showsBadge(state) && <span className="badge" aria-hidden="true">!</span>}
            {/* 사진 얼굴 + 장애: 얼굴은 몸 안에서 이미 회색으로 바뀐다(css). 여기선 x 표시만 작게 얹는다 */}
            {hasFace && state === 'error' && <span className="badge badge-x" aria-hidden="true">✕</span>}
        </span>
    )
}
