'use client'
// @멘션 전달 표식 = 프로필 사진 + 이름 칩 (말풍선 입력창 공통)

import BotAvatar from './BotAvatar'
import type { BotColor, BotShape } from '@/domains/os/types'
import type { MentionChipBot } from '@/domains/os/mention-chips'

export function MentionChip({
    bot,
    label,
}: {
    bot?: MentionChipBot | null
    /** 전달 표식처럼 봇 목록에 없을 때 이름만 */
    label?: string
}) {
    const name = (bot?.name || label || '').trim() || '봇'
    return (
        <span className="os-mention-chip" contentEditable={false} data-mention-name={name}>
            <span className="os-mention-chip-face" aria-hidden>
                {bot ? (
                    <BotAvatar
                        shape={(bot.shape as BotShape) || 'circle'}
                        color={(bot.color as BotColor) || 'white'}
                        state="idle"
                        size={18}
                        faceUrl={bot.avatarUrl ?? null}
                        name={name}
                    />
                ) : (
                    <span className="os-mention-chip-fallback">{name.slice(0, 1)}</span>
                )}
            </span>
            <span className="os-mention-chip-name">{name}</span>
        </span>
    )
}
