'use client'
// 대화방에 처음 들어오면(첫 메시지 전) 인사말 아래 뜨는 「눌러서 물어보기」 칩 3개 (대표 승인 0928 사용성 5번).
// 그 봇이 맡은 일(presets.ts 의 JOBS)에 맞춰 30초 안에 결과가 보이는 일을 고른다. 누르면 그대로 보낸다.
//
// 끼우는 자리(OsChat): 인사말 말풍선 아래, 내 팀 봇이고 messages.length === 0 일 때만.
//   <FirstTaskChips bot={bot} disabled={streaming} onPick={t => void send(t)} />
// 공개 봇(리더의 봇)은 대화 안 정보 카드가 그 봇의 예시 질문을 따로 보여 준다.

import type { TeamBot } from '@/domains/os/types'
import { JOBS } from '@/domains/os/presets'

interface Props {
    /** 내 팀의 봇. 공개 봇(리더의 봇)이면 null → 공통 칩 */
    bot: TeamBot | null
    /** 칩을 누르면 이 글을 그대로 봇에게 보낸다 */
    onPick: (text: string) => void
    disabled?: boolean
    /** 가입 온보딩에서 고른 일에 맞춘 칩 3개. 있으면 맡은 일 칩 대신 쓴다 */
    override?: [string, string, string]
}

// 맡은 일별 첫 일 3개. 첫 칩은 presets.firstTask 의 「」 안 문장과 같은 뜻으로 맞춘다
const TASKS: Record<string, [string, string, string]> = {
    planning_lead: [
        '이번 주 뭐부터 해야 할지 정리해 줘',
        '오늘 내가 결정할 것 하나만 골라 줘',
        '내 일을 세 줄로 정리해 줘',
    ],
    marketing_lead: [
        '내 다음 강의 알리는 글 3개 써 줘',
        '짧은 홍보 문구 한 줄 만들어 줘',
        '팬 질문에 보낼 답장 초안 하나 써 줘',
    ],
    dev_lead: [
        '매주 반복하는 일 중에 자동으로 할 수 있는 게 있을까?',
        '내 자료를 어떻게 정리하면 좋을지 알려 줘',
        '어려운 기술 말을 쉬운 말로 풀어 줘',
    ],
    research_lead: [
        '이거 사실인지 자료 찾아서 출처랑 같이 알려 줘',
        '요즘 사람들이 많이 찾는 배움 주제 알려 줘',
        '찾은 자료를 한 줄로 요약해 줘',
    ],
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

// 직접 쓴 일, 공개 봇 = 어떤 봇에게도 통하는 작은 일
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
