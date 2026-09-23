// domains/agent — 봇 도구 관문 (승인선). 크리밋 기준 0923 §F-1.
//
// 규칙 하나: 「되돌릴 수 있나」.
//  - 되돌릴 수 있는 일(읽기·조사·요약·초안·정리)은 봇이 알아서 끝낸다.
//  - 되돌릴 수 없는 일(보내기·게시·구매·이체·삭제·권한 변경·약관 동의)은
//    permission_requests 에 카드가 만들어지고 사람이 「허용」하기 전엔 실행되지 않는다.
//  - 목록에 없는 도구는 기본 거절. 화이트리스트에 넣어야 쓸 수 있다.
//
// 지금(1일차)은 봇에 붙은 도구가 아직 없다. 관문 껍데기와 시험만 먼저 세운다.
// 나중에 도구를 붙일 때는 반드시 gateTool() 을 지나게 한다. 우회 경로를 만들지 않는다.

/** 승인 없이 끝내도 되는 도구 (읽기·만들기만 하고 밖으로 안 나감) */
export const SAFE_TOOLS = [
    'search_knowledge',   // 내 자료 검색
    'read_document',      // 자료 읽기
    'summarize',          // 요약
    'classify',           // 분류
    'draft_message',      // 초안 쓰기 (보내지 않음)
    'draft_post',         // 게시글 초안 (게시하지 않음)
    'organize_notes',     // 정리
    'propose_next_step',  // 다음 한 걸음 제안
    'notify_owner',       // 주인(나)에게 알림 — 루틴 결과·승인 요청 도착·클로버 부족 (밖으로 안 나감)
    'read_url',           // 링크 바로 읽기 — 밖의 공개 주소를 읽어 오기만 한다 (안쪽 주소는 fetch-url.ts 가 막는다)
    'notion_search',      // 내 노션에서 문서 찾기 (읽기만)
    'notion_read_page',   // 내 노션 문서 한 장 읽기 (읽기만)
] as const

/** 사람 승인이 반드시 필요한 행동 → permission_requests.action_type 과 같은 이름 */
export const IRREVERSIBLE_TOOLS: Record<string, IrreversibleAction> = {
    send_message: 'send_message',       // 메시지·메일·문자 보내기
    send_email: 'send_message',
    send_sms: 'send_message',
    slack_post: 'send_message',         // 슬랙 방에 글 올리기 — 올라간 글은 이미 남들이 봤다
    publish_post: 'publish',            // 게시·공개
    purchase: 'purchase',               // 구매
    transfer_money: 'transfer',         // 이체
    delete_data: 'delete',              // 삭제·덮어쓰기
    overwrite_document: 'delete',
    change_permission: 'change_permission',
    accept_terms: 'accept_terms',
}

export type IrreversibleAction =
    | 'send_message' | 'publish' | 'purchase' | 'transfer'
    | 'delete' | 'change_permission' | 'accept_terms' | 'other'

export type ApprovalMode = 'always_ask' | 'draft_only' | 'auto_safe'

export interface GateInput {
    tool: string
    /** team_bots.approval_mode. 모르면 always_ask 로 본다 */
    approvalMode?: ApprovalMode
    /** 이 호출이 이미 사람 승인을 받은 카드(status=allowed|edited_allowed)를 들고 있나 */
    approvedRequestId?: string | null
}

export type GateResult =
    | { allowed: true; needsApproval: false }
    | { allowed: false; needsApproval: true; actionType: IrreversibleAction; reason: string }
    | { allowed: false; needsApproval: false; reason: string }

/**
 * 도구 호출을 관문에 세운다.
 * - 안전 목록 → 통과
 * - 되돌릴 수 없는 목록 → 승인 카드가 없으면 멈춤(needsApproval), draft_only 봇은 아예 거절
 * - 둘 다 아님 → 거절 (기본 거절)
 */
export function gateTool(input: GateInput): GateResult {
    const { tool, approvalMode = 'always_ask', approvedRequestId } = input

    if ((SAFE_TOOLS as readonly string[]).includes(tool)) {
        return { allowed: true, needsApproval: false }
    }

    const actionType = IRREVERSIBLE_TOOLS[tool]
    if (actionType) {
        if (approvalMode === 'draft_only') {
            return { allowed: false, needsApproval: false, reason: `이 봇은 초안만 만든다(draft_only). ${tool} 은 할 수 없다` }
        }
        if (approvedRequestId) {
            return { allowed: true, needsApproval: false }
        }
        return { allowed: false, needsApproval: true, actionType, reason: `${tool} 은 되돌릴 수 없는 행동이라 사람 승인이 필요하다` }
    }

    return { allowed: false, needsApproval: false, reason: `${tool} 은 허용 목록에 없는 도구다(기본 거절)` }
}
