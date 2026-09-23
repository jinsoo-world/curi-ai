'use client'
// 옆 봇에게 옮긴 말의 답 — 1:1 대화에 그려지는 두 줄.
//   ① 회색 줄  「기획팀장 → 홍보팀장에게 전달했어요」
//   ② 말풍선   「보낸 사람 홍보팀장 → 기획팀장 방」 + 홍보팀장 캐릭터 + 답
// 왜 표식을 꼭 다나 = 지금 방의 봇이 한 말처럼 보이면 사람이 누가 한 말인지 속는다.

import type { BotColor, BotShape } from '@/domains/os/types'
import { relaySentLine } from '@/domains/agent/relay'
import BotAvatar from './BotAvatar'
import BotMarkdown from './BotMarkdown'

/** 옮긴 말 한 건의 화면 정보 */
export interface RelayView {
    fromName: string
    toName: string
    shape: BotShape
    color: BotColor
    avatarUrl: string | null
}

export default function RelayBubble({ view, answer }: { view: RelayView; answer: string }) {
    return (
        <>
            <div className="os-cite">↪ {relaySentLine(view.fromName, view.toName)}</div>
            <div className="os-sender">
                <BotAvatar shape={view.shape} color={view.color} state="idle" size={28} faceUrl={view.avatarUrl} name={view.toName} />
                <span>보낸 사람 {view.toName} → {view.fromName} 방</span>
            </div>
            <div className="os-bubble bot md"><BotMarkdown text={answer} /></div>
        </>
    )
}
