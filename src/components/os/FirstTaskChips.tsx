'use client'
// 대화방에 처음 들어오면(첫 메시지 전) 인사말 아래 뜨는 「눌러서 물어보기」 칩 3개 (대표 승인 0928 사용성 5번).
// 그 봇이 맡은 일(presets.ts 의 JOBS)에 맞춰 30초 안에 결과가 보이는 일을 고른다. 누르면 그대로 보낸다.
//
// 끼우는 자리(OsChat): 인사말 말풍선 아래, 내 팀 봇이고 messages.length === 0 일 때만.
//   <FirstTaskChips bot={bot} disabled={streaming} onPick={t => void send(t)} />
// 공개 봇(리더의 봇)은 대화 안 정보 카드가 그 봇의 예시 질문을 따로 보여 준다.

import type { TeamBot } from '@/domains/os/types'
// 칩 글은 presets.ts 에 둔다 = 새 봇의 예시 질문(mentors.sample_questions)도 같은 글을 쓴다(서버도 읽는다)
import { JOBS, STARTER_TASKS as TASKS, COMMON_STARTERS as COMMON } from '@/domains/os/presets'

interface Props {
    /** 내 팀의 봇. 공개 봇(리더의 봇)이면 null → 공통 칩 */
    bot: TeamBot | null
    /** 칩을 누르면 이 글을 그대로 봇에게 보낸다 */
    onPick: (text: string) => void
    disabled?: boolean
    /** 가입 온보딩에서 고른 일에 맞춘 칩 3개. 있으면 맡은 일 칩 대신 쓴다 */
    override?: [string, string, string]
}

/** 봇의 한 줄 성격(oneLiner)으로 프리셋을 되찾는다. team_bots 표엔 job 칸이 없어서 이 길로 간다 */
export function tasksFor(bot: TeamBot | null): [string, string, string] {
    if (!bot) return COMMON
    if (bot.role === 'chief') return TASKS.chief
    const job = JOBS.find(j => j.oneLiner && j.oneLiner === bot.oneLiner)
    return (job && TASKS[job.id]) ?? COMMON
}

export default function FirstTaskChips({ bot, onPick, disabled, override }: Props) {
    const tasks = override ?? tasksFor(bot)
    return (
        <div className="os-first-tasks" aria-label="추천 질문">
            <div className="os-first-tasks-title">눌러서 바로 물어보세요</div>
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
