// /os/avatars — 캐릭터 시연판. 도형 6 × 색 8 × 상태 8 을 한눈에 (개발·대표 확인용, 검색 안 올림)
import type { Metadata } from 'next'
import BotAvatar from '@/components/os/BotAvatar'
import { COLOR_KO, SHAPE_KO, STATE_KO } from '@/components/os/avatar'
import { COLORS, SHAPES } from '@/domains/os/presets'
import type { BotState } from '@/domains/os/types'

export const metadata: Metadata = {
    title: '캐릭터 시연',
    robots: { index: false, follow: false },
}

const STATES: BotState[] = ['idle', 'listening', 'thinking', 'talking', 'waiting_approval', 'working', 'sleeping', 'error']
const SIZES = [36, 44, 72, 96]

export default function AvatarsPage() {
    return (
        <div style={{ overflow: 'auto', padding: '20px 24px 60px', minHeight: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>캐릭터 시연판</h1>
            <p style={{ fontSize: 14, color: 'var(--os-글-연)', margin: '0 0 20px', lineHeight: 1.5 }}>
                도형 6 × 색 8 × 상태 8. 줄 = 도형, 칸 = 색. 움직임은 실제 화면과 같다.
            </p>

            <section style={{ marginBottom: 28 }}>
                <h2 style={sectionH2}>크기 4종 · 리더 얼굴 배지 · 승인 배지</h2>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, flexWrap: 'wrap' }}>
                    {SIZES.map(s => (
                        <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <BotAvatar shape="circle" color="orange" state="idle" size={s} name="답장봇" faceUrl="/logo.png" />
                            <span style={caption}>{s}px</span>
                        </div>
                    ))}
                    {SIZES.map(s => (
                        <div key={`w${s}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <BotAvatar shape="clover" color="green" state="waiting_approval" size={s} name="비서실장" />
                            <span style={caption}>{s}px !</span>
                        </div>
                    ))}
                </div>
            </section>

            {STATES.map(state => (
                <section key={state} style={{ marginBottom: 28 }}>
                    <h2 style={sectionH2}>
                        {STATE_KO[state]} <code style={{ fontSize: 12, color: 'var(--os-글-흐림)', fontWeight: 400 }}>{state}</code>
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLORS.length}, 72px)`, gap: '18px 14px', alignItems: 'end' }}>
                        {SHAPES.map(shape => COLORS.map(color => (
                            <div key={`${shape}-${color}`} style={{ display: 'grid', placeItems: 'center' }}>
                                <BotAvatar shape={shape} color={color} state={state} size={72} name={`${SHAPE_KO[shape]} ${COLOR_KO[color]}`} />
                            </div>
                        )))}
                    </div>
                </section>
            ))}
        </div>
    )
}

const sectionH2: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: 'var(--os-글)', display: 'flex', gap: 8, alignItems: 'baseline' }
const caption: React.CSSProperties = { fontSize: 12, color: 'var(--os-글-흐림)' }
