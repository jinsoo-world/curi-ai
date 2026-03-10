// domains/creator — 타입 정의

/** 크리에이터 프로필 */
export interface CreatorProfile {
    id: string
    user_id: string
    display_name: string
    bio: string | null
    avatar_url: string | null
    tier: 'free' | 'basic' | 'pro'
    mentor_count: number
    total_subscribers: number
    created_at: string
    updated_at: string
}

/** 페르소나 템플릿 유형 */
export type PersonaTemplate = 'coach' | 'teacher' | 'friend' | 'expert' | 'character'

/** 멘토 상태 */
export type MentorStatus = 'draft' | 'review' | 'active' | 'rejected' | 'suspended'

/** AI 멘토 생성 입력 (Step 1) */
export interface CreateMentorInput {
    name: string
    title: string
    description: string
    expertise: string[]
    avatarUrl?: string
    category?: string | null
    organization?: string | null
}

/** AI 멘토 페르소나 설정 (Step 2) */
export interface SetPersonaInput {
    mentorId: string
    template: PersonaTemplate
    systemPrompt: string
    greetingMessage: string
    sampleQuestions: string[]
}

/** AI 멘토 지식 입력 (Step 3) */
export interface SetKnowledgeInput {
    mentorId: string
    knowledgeText?: string
    knowledgeUrls?: string[]
}

/** 페르소나 템플릿 정보 */
export interface PersonaTemplateInfo {
    id: PersonaTemplate
    label: string
    emoji: string
    description: string
    defaultPromptStyle: string
}

/** 5가지 페르소나 템플릿 */
export const PERSONA_TEMPLATES: PersonaTemplateInfo[] = [
    {
        id: 'coach',
        label: '코치',
        emoji: '🏋️',
        description: '목표 달성을 돕는 실전 코치. 질문으로 이끌어내고, 액션 플랜을 제시합니다.',
        defaultPromptStyle: '당신은 실전 코치입니다. 대화를 통해 상대방의 목표를 파악하고, 구체적인 액션 플랜을 제시합니다. 먼저 질문으로 현재 상황을 파악한 후, 핵심→이유→제안 순으로 답합니다.',
    },
    {
        id: 'teacher',
        label: '선생님',
        emoji: '📚',
        description: '체계적으로 가르쳐주는 전문 선생님. 단계별로 쉽게 설명합니다.',
        defaultPromptStyle: '당신은 전문 선생님입니다. 복잡한 개념을 쉽고 체계적으로 설명합니다. 단계별로 진행하며, 이해를 확인하는 질문을 중간중간 던집니다. 실제 예시를 많이 사용합니다.',
    },
    {
        id: 'friend',
        label: '친구',
        emoji: '🤝',
        description: '편하게 대화할 수 있는 똑똑한 친구. 공감하면서 솔직한 피드백을 줍니다.',
        defaultPromptStyle: '당신은 편하면서도 똑똑한 친구입니다. 상대방의 이야기에 공감하면서도, 필요할 때 솔직한 피드백을 줍니다. 반말 대신 존댓말을 쓰되, 딱딱하지 않은 톤으로 대화합니다.',
    },
    {
        id: 'expert',
        label: '전문가',
        emoji: '🎯',
        description: '깊이 있는 전문 지식을 나누는 업계 전문가. 데이터와 사례 기반으로 조언합니다.',
        defaultPromptStyle: '당신은 업계 전문가입니다. 데이터와 사례를 기반으로 깊이 있는 분석과 조언을 제공합니다. 전문 용어를 사용하되 쉽게 풀어서 설명하고, 트렌드와 인사이트를 공유합니다.',
    },
    {
        id: 'character',
        label: '캐릭터',
        emoji: '🎭',
        description: '독특한 세계관과 개성을 가진 캐릭터. 재미있고 몰입감 있는 대화를 합니다.',
        defaultPromptStyle: '당신은 독특한 개성을 가진 캐릭터입니다. 자신만의 말투와 세계관이 있으며, 대화를 재미있고 몰입감 있게 이끌어갑니다. 일관된 페르소나를 유지하면서 유익한 대화를 합니다.',
    },
]
