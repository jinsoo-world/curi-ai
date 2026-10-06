// domains/mcp — 숫자는 여기만 바꾼다 (대표 확정 1006: 무료 1·베이직 3·프로 10)

import type { PlanId } from '@/domains/os/plan'

/** 요금제별로 붙일 수 있는 MCP 서버 수 */
export const MCP_SERVER_LIMITS: Record<PlanId, number> = {
    free: 1,
    basic: 3,
    pro: 10,
}

/** 한 번 대화(사용자 말 한 번)에 봇이 부를 수 있는 도구 호출 최대 횟수 */
export const MAX_TOOL_CALLS_PER_TURN = 5
/** 도구 하나(서버 한 번 요청) 최대 시간 */
export const TOOL_TIMEOUT_MS = 15_000
/** 도구 단계 전체에 쓰는 시간 상한. 대화 함수 상한(60초) 안에서 답 만들 시간을 남긴다 */
export const TOOL_PHASE_BUDGET_MS = 25_000
/** MCP 서버 응답 한 번의 최대 크기 */
export const MAX_RESPONSE_BYTES = 1024 * 1024
/** 도구 결과를 모델에 넣을 때 최대 글자 수 (하나당) */
export const MAX_TOOL_RESULT_CHARS = 4_000
/** 한 대화에 모델에게 보여 줄 도구 수 상한 (서버 여러 개 합쳐서) */
export const MAX_TOOLS_PER_TURN = 32
/** 서버 하나에서 받아 쓰는 도구 수 상한 */
export const MAX_TOOLS_PER_SERVER = 20
/** 도구 설명 최대 글자 수 */
export const MAX_TOOL_DESCRIPTION_CHARS = 500
/** 도구 입력 모양(JSON 스키마) 최대 크기. 넘으면 빈 객체 모양으로 줄인다 */
export const MAX_TOOL_SCHEMA_CHARS = 4_000
/** 서버 하나에 지정할 수 있는 봇 수 */
export const MAX_BOTS_PER_SERVER = 50

export function mcpServerLimit(plan: PlanId): number {
    return MCP_SERVER_LIMITS[plan] ?? MCP_SERVER_LIMITS.free
}
