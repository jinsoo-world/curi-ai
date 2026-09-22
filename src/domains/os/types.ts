// domains/os — 에이전트 OS(봇 팀) 타입

export type BotRole = 'twin' | 'chief' | 'helper'
export type BotShape = 'circle' | 'hex' | 'square' | 'egg' | 'drop' | 'clover'
export type BotColor = 'orange' | 'teal' | 'magenta' | 'blue' | 'brown' | 'green' | 'yellow' | 'white'
export type ApprovalMode = 'always_ask' | 'draft_only' | 'auto_safe'

/** 캐릭터 상태 (기획 §12). 화면은 data-state 하나로 움직임을 바꾼다 */
export type BotState =
    | 'idle' | 'listening' | 'thinking' | 'talking'
    | 'waiting_approval' | 'working' | 'sleeping' | 'error'

/** 명단에 뜨는 봇 한 칸 (team_bots + mentors 합친 모양) */
export interface TeamBot {
    id: string            // team_bots.id
    mentorId: string      // mentors.id (봇의 몸)
    name: string
    role: BotRole
    shape: BotShape
    color: BotColor
    oneLiner: string | null
    approvalMode: ApprovalMode
    pinned: boolean
    hidden: boolean
    sortOrder: number
    avatarUrl: string | null
    greeting: string
    knowledgeCount: number
    createdAt: string
}

/** 새 봇 만들기 3걸음의 입력 */
export interface NewBotInput {
    job: string            // presets.JOBS 의 id 또는 'custom'
    customJob?: string     // job === 'custom' 일 때 사용자가 쓴 한 줄
    autonomy: ApprovalMode
    name: string
    shape: BotShape
    color: BotColor
    role?: BotRole
}
