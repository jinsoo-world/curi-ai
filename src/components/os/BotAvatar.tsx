'use client'
// 캐릭터 = 도형 1 + 눈 2 (그록봇 문법) + 네잎클로버. 움직임은 data-state 하나로 os.css 가 바꾼다.
// 그림 생성 API 를 쓰지 않는다 = 비용 0, 즉시. 색·모양 이름은 team_bots 표의 값과 같다.

import type { BotColor, BotShape, BotState } from '@/domains/os/types'

const PATHS: Record<BotShape, string> = {
    // 100×100 좌표계
    circle: 'M50 4 a46 46 0 1 0 0.01 0 Z',
    hex: 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z',
    square: 'M22 6 H78 Q94 6 94 22 V78 Q94 94 78 94 H22 Q6 94 6 78 V22 Q6 6 22 6 Z',
    egg: 'M50 4 C74 4 92 30 92 58 C92 82 74 96 50 96 C26 96 8 82 8 58 C8 30 26 4 50 4 Z',
    drop: 'M50 4 C62 26 92 44 92 64 C92 84 74 96 50 96 C26 96 8 84 8 64 C8 44 38 26 50 4 Z',
    clover: 'M50 50 C30 50 22 30 32 20 C40 12 50 20 50 34 C50 20 60 12 68 20 C78 30 70 50 50 50 C70 50 78 70 68 80 C60 88 50 80 50 66 C50 80 40 88 32 80 C22 70 30 50 50 50 Z',
}

export interface BotAvatarProps {
    shape: BotShape
    color: BotColor
    state?: BotState
    size?: number
    /** 리더 얼굴 사진(만든 사람 배지). 있으면 오른쫽 아래에 붙는다 */
    faceUrl?: string | null
    title?: string
}

export default function BotAvatar({ shape, color, state = 'idle', size = 72, faceUrl, title }: BotAvatarProps) {
    const fill = `var(--봇-${color})`
    // 흰 몸엔 검은 눈, 나머진 어두운 눈
    const eye = color === 'white' ? '#111' : '#141414'
    const closed = state === 'sleeping'
    const error = state === 'error'
    // 눈 위치: 도형마다 조금 다르게 (물방울은 아래, 클로버는 가운데)
    const cy = shape === 'drop' ? 62 : shape === 'clover' ? 50 : 46
    const lx = shape === 'clover' ? 42 : 40
    const rx = shape === 'clover' ? 58 : 60

    return (
        <span className="bot-avatar" data-state={state} title={title} style={{ width: size, height: size }} aria-label={title}>
            <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-hidden={!title}>
                <path className="body" d={PATHS[shape]} fill={fill} />
                {error ? (
                    <g stroke={eye} strokeWidth="6" strokeLinecap="round">
                        <path d={`M${lx - 6} ${cy - 6} l12 12 M${lx + 6} ${cy - 6} l-12 12`} />
                        <path d={`M${rx - 6} ${cy - 6} l12 12 M${rx + 6} ${cy - 6} l-12 12`} />
                    </g>
                ) : (
                    <g>
                        <rect className="eye" x={lx - 4} y={cy - 9} width="8" height={closed ? 3 : 18} rx="4" fill={eye} />
                        <rect className="eye" x={rx - 4} y={cy - 9} width="8" height={closed ? 3 : 18} rx="4" fill={eye} />
                    </g>
                )}
            </svg>
            {state === 'waiting_approval' && <span className="badge" aria-label="승인 기다림">!</span>}
            {/* 리더 얼굴은 외부 저장소 주소라 next/image 최적화 대상이 아니다(작은 배지) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {faceUrl && <img className="face-badge" src={faceUrl} alt="" />}
        </span>
    )
}
