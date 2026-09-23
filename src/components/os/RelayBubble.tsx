'use client'
// 옆 봇에게 옮긴 말의 답 — 그록(Grok) UI 참고, 1:1 대화에 그려지는 줄들.
//   ① 회색 줄  「메시지 보냄 (B 작은 얼굴) 홍보팀장」 — 지금 봇이 옆 봇에게 넘겼다는 표식
//   ② 말풍선   「보낸 사람 홍보팀장 → 기획팀장 방」 + 홍보팀장 캐릭터(20) + 답
//   ③ (있으면) 정리 줄 — 예) 「여기까지 정리했어요. 이어서 하실까요?」(턴 상한 0923)
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

/** reply = 뒤이어 붙는 짧은 정리 줄(선택). 지금은 턴 상한 문구에 쓴다 */
export default function RelayBubble({ view, answer, reply }: { view: RelayView; answer: string; reply?: string }) {
    return (
        <>
            <div className="os-cite" title={relaySentLine(view.fromName, view.toName)}>
                메시지 보냄 <BotAvatar shape={view.shape} color={view.color} state="idle" size={14} faceUrl={view.avatarUrl} name={view.toName} /> {view.toName}
            </div>
            <div className="os-sender">
                <BotAvatar shape={view.shape} color={view.color} state="idle" size={20} faceUrl={view.avatarUrl} name={view.toName} />
                <span>보낸 사람 {view.toName} → {view.fromName} 방</span>
            </div>
            <div className="os-bubble bot md"><BotMarkdown text={answer} /></div>
            {reply && <div className="os-cite">{reply}</div>}
        </>
    )
}
