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
    /** mentors.system_prompt — 편집 시트 프롬프트 칸. 목록에 같이 실어 온다 */
    systemPrompt: string
    greeting: string
    knowledgeCount: number
    createdAt: string
    /** 봇 마켓에 공개됐나 (mentors.is_active). 시연 목록처럼 모르면 비운다 */
    isPublic?: boolean
    /** 공개하기를 보여 줄 봇인가 = 내가 만든 봇(마켓에서 데려온 봇, 시연 봇 아님). 최종 판정은 서버가 다시 한다 */
    canPublish?: boolean
}

/** 새 봇 만들기 입력 (승인 모드는 항상 always_ask 로 둔다) */
export interface NewBotInput {
    job: string            // presets.JOBS 의 id 또는 'custom'
    customJob?: string     // job === 'custom' 일 때 사용자가 쓴 한 줄
    autonomy: ApprovalMode
    name: string
    shape: BotShape
    color: BotColor
    role?: BotRole
}
