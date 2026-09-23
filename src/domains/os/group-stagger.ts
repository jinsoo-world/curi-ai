// 그룹방 다봇 답 간격 (짧고 조절 가능). 제품 카피에 가운뎃점 긴 줄표 금지.
// @한 명만 답할 때는 간격 없이 한 봇만 생각→답.

/** 각 봇이 답을 올리기 전 「생각 중」을 보여주는 시간 */
export const GROUP_THINK_MS = 700
/** 한 봇 답이 보인 뒤 다음 봇 생각으로 넘어가기 전 간격 */
export const GROUP_GAP_MS = 450
/** 서버에서 멤버 봇을 이어서 부를 때 넣는 아주 짧은 간격 (병렬 폭주 완화) */
export const GROUP_SERVER_GAP_MS = 280

export function sleep(ms: number): Promise<void> {
    const n = Math.max(0, Math.floor(ms))
    return new Promise(resolve => setTimeout(resolve, n))
}
