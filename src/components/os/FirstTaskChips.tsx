'use client'
// 새 봇을 만들고 대화방에 들어오면 첫 메시지 위에 뜨는 「첫 일 시키기」 칩 3개.
// 그 봇이 맡은 일(presets.ts 의 JOBS)에 맞춰 30초 안에 결과가 보이는 일을 고른다. 누르면 그대로 보낸다.
//
// 끼우는 자리(OsChat): 인사말 말풍선 아래, messages.length === 0 일 때만.
//   <FirstTaskChips bot={bot} disabled={streaming} onPick={text => { setInput(text); void send() }} />
//   (send 가 input 상태를 읽는 구조라면 onPick 안에서 text 를 바로 보내는 sendText(text) 를 쓰는 편이 안전하다)

import type { TeamBot } from '@/domains/os/types'
import { JOBS } from '@/domains/os/presets'

interface Props {
    /** 내 팀의 봇. 공개 봇(리더의 봇)이면 null → 공통 칩 */
    bot: TeamBot | null
    /** 칩을 누르면 이 글을 그대로 봇에게 보낸다 */
    onPick: (text: string) => void
    disabled?: boolean
}

// 맡은 일별 첫 일 3개. 첫 칩은 presets.firstTask 의 「」 안 문장과 같은 뜻으로 맞춘다
const TASKS: Record<string, [string, string, string]> = {
    fan_reply: [
        '「강의 영상 다시 볼 수 있나요?」라는 질문에 내 말투로 답장 초안 써 줘',
        '답장할 때 꼭 지킬 말투 규칙 3개 정리해 줘',
        '자주 받는 질문을 3가지 유형으로 나눠 줘',
    ],
    content_ideas: [
        '이번 주 글감 5개 뽑아 줘',
        '내 자료에서 영상 소재 3개 골라 줘',
        '지금 쓰기 좋은 제목 후보 5개 만들어 줘',
    ],
    lecture_digest: [
        '내가 올린 자료를 10줄로 요약해 줘',
        '수강생이 물을 만한 질문 3개 뽑아 줘',
        '핵심 3개를 한 문장씩 정리해 줘',
    ],
    schedule: [
        '오늘 할 일 정리해 줘',
        '미룬 일이 있으면 하나만 골라 다음 한 걸음 알려 줘',
        '이번 주 일정을 세 줄로 요약해 줘',
    ],
    chief: [
        '이번 주 상황을 정리해 줘',
        '오늘 내가 결정해야 할 것 하나만 골라 줘',
        '다른 봇들에게 시킬 일을 나눠 줘',
    ],
}

// 직접 쓴 일·공개 봇 = 어떤 봇에게도 통하는 작은 일
const COMMON: [string, string, string] = [
    '네가 맡은 일을 한 줄로 설명해 줘',
    '30초 안에 확인할 수 있는 작은 일 하나 해 줘',
    '내가 자료를 올리면 어떻게 쓸지 알려 줘',
]

/** 봇의 한 줄 성격(oneLiner)으로 프리셋을 되찾는다. team_bots 표엔 job 칸이 없어서 이 길로 간다 */
export function tasksFor(bot: TeamBot | null): [string, string, string] {
    if (!bot) return COMMON
    if (bot.role === 'chief') return TASKS.chief
    const job = JOBS.find(j => j.oneLiner && j.oneLiner === bot.oneLiner)
    return (job && TASKS[job.id]) ?? COMMON
}

export default function FirstTaskChips({ bot, onPick, disabled }: Props) {
    const tasks = tasksFor(bot)
    return (
        <div className="os-first-tasks" aria-label="첫 일 시키기">
            <div className="os-first-tasks-title">첫 일 하나 시켜 보세요. 30초면 결과가 보여요.</div>
            <div className="os-chips">
                {tasks.map(t => (
                    <button key={t} type="button" className="os-chipbtn" disabled={disabled} onClick={() => onPick(t)}>
                        {t}
                    </button>
                ))}
            </div>
        </div>
    )
}
