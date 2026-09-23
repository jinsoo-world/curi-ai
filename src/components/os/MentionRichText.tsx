'use client'
// 본문 속 @이름 [이름 전달] 을 칩으로 그려 준다 (입력 미리보기 말풍선)

import BotMarkdown from './BotMarkdown'
import { MentionChip } from './MentionChip'
import {
    splitMentionSegments,
    type MentionChipBot,
} from '@/domains/os/mention-chips'

export default function MentionRichText({
    text,
    bots,
    className,
    markdown = false,
}: {
    text: string
    bots: readonly MentionChipBot[]
    className?: string
    /** 봇 답처럼 마크다운이 필요할 때. 칩이 있으면 조각마다 마크다운을 돌린다 */
    markdown?: boolean
}) {
    const parts = splitMentionSegments(text, bots)
    const hasChip = parts.some(p => p.kind !== 'text')
    if (markdown && !hasChip) {
        return <BotMarkdown text={text} />
    }
    return (
        <span className={className}>
            {parts.map((p, i) => {
                if (p.kind === 'text') {
                    if (!p.text) return null
                    return markdown
                        ? <BotMarkdown key={i} text={p.text} />
                        : <span key={i}>{p.text}</span>
                }
                if (p.kind === 'mention') {
                    return <MentionChip key={i} bot={p.bot} />
                }
                return <MentionChip key={i} label={p.label} />
            })}
        </span>
    )
}
