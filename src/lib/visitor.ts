// 비회원 식별 ID (브라우저 저장소). 대화 화면과 OS 화면이 같은 값을 쓴다.
// (원래 chat/[mentorId]/page.tsx 안에 있던 함수를 밖으로 뺐다. 값·열쇠 이름은 그대로)

const KEY = 'curi_visitor_id'

export function getVisitorId(): string {
    if (typeof window === 'undefined') return ''
    let vid = localStorage.getItem(KEY)
    if (!vid) {
        vid = crypto.randomUUID()
        localStorage.setItem(KEY, vid)
    }
    return vid
}
