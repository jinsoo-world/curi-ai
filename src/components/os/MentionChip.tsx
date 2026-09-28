'use client'
// @멘션 전달 표식 = 프로필 사진 + 이름 칩 (말풍선, 입력창 공통)
//
// 입력창은 투명한 글상자 뒤에 그림(거울)을 깔아 칩을 보여 준다. 그래서 입력창용(mirror) 칩은
// 글상자 속 「@이름」 글자와 **폭이 정확히 같아야** 캐럿이 칩 위에 겹치지 않는다(대표 0928 「마우스 란이 겹쳐」).
//   - 「@」 글자 자리는 투명하게 두고 그 위에 얼굴을 얹는다
//   - 이름은 글상자와 같은 크기, 같은 굵기로 그린다 (굵게 하면 폭이 달라진다)
//   - 알약 바탕은 box-shadow 로 그려 자리를 차지하지 않는다
// 얼굴은 명단과 같은 모양(클로버면 클로버)으로, 상태 점은 숨긴다(작은 칩에선 점이 얼굴을 덮었다).

import BotAvatar from './BotAvatar'
import type { BotColor, BotShape } from '@/domains/os/types'
import type { MentionChipBot } from '@/domains/os/mention-chips'

const SHAPES: readonly BotShape[] = ['circle', 'hex', 'square', 'egg', 'drop', 'clover']

function Face({ bot, name, size }: { bot: MentionChipBot; name: string; size: number }) {
    const shape = (SHAPES as readonly string[]).includes(bot.shape ?? '') ? (bot.shape as BotShape) : 'circle'
    return (
        <BotAvatar
            shape={shape}
            color={(bot.color as BotColor) || 'white'}
            state="idle"
            size={size}
            faceUrl={bot.avatarUrl ?? null}
            faceRim="none"
            name={name}
        />
    )
}

export function MentionChip({
    bot,
    label,
    raw,
    mirror = false,
}: {
    bot?: MentionChipBot | null
    /** 전달 표식처럼 봇 목록에 없을 때 이름만 */
    label?: string
    /** 본문에 적힌 그대로의 글자 (입력창 거울에서 폭을 맞출 때 쓴다) */
    raw?: string
    /** 입력창 거울용: 글상자 글자와 같은 폭으로 그린다 */
    mirror?: boolean
}) {
    const name = (bot?.name || label || '').trim() || '봇'
    if (mirror) {
        const text = raw || `@${name}`
        if (!bot) {
            return <span className="os-mchip-ink os-mchip-ink--plain" data-mention-name={name}>{text}</span>
        }
        return (
            <span className="os-mchip-ink" data-mention-name={name}>
                <span className="os-mchip-ink-at">
                    {text.slice(0, 1)}
                    <span className="os-mchip-ink-face" aria-hidden><Face bot={bot} name={name} size={17} /></span>
                </span>
                <span className="os-mchip-ink-name">{text.slice(1)}</span>
            </span>
        )
    }
    return (
        <span className="os-mention-chip" contentEditable={false} data-mention-name={name}>
            <span className="os-mention-chip-face" aria-hidden>
                {bot ? <Face bot={bot} name={name} size={18} /> : <span className="os-mention-chip-fallback">{name.slice(0, 1)}</span>}
            </span>
            <span className="os-mention-chip-name">{name}</span>
        </span>
    )
}
