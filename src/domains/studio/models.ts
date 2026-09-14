// 큐리AI 자체 사진 모델 — 대표 지시 2026-09-14 「우리 모델명도 하나 만들자. 우리 모델은 커스텀해서 제공하는거야」
//
// 참고 = pfpmaker 는 「PFPMaker v1 (균형 잡힌)」이라는 자기 이름을 붙여 판다.
// 우리도 같은 방식이다. 속은 구글 모델이지만, 중장년 얼굴이 딴사람이 되지 않게
// 우리가 손본 지시문을 얹은 것이라 우리 이름으로 부른다.
//
// ⚠️ engine 은 화면에 절대 내보내지 않는다. 고객에게는 「큐리」라는 이름만 보인다.

export interface CuriModel {
    id: string
    /** 화면에 보일 이름 */
    label: string
    /** 이름 옆 작은 딱지 */
    badge: string
    /** 한 줄 설명 */
    desc: string
    /** 실제로 부르는 구글 모델 (화면 노출 금지) */
    engine: string
    /** 한 장에 드는 클로버 */
    cost: number
}

export const CURI_MODELS: CuriModel[] = [
    {
        id: 'curi-v1',
        label: '큐리 v1',
        badge: '기본',
        desc: '얼굴을 그대로 살리면서 빠르게 만들어요',
        engine: 'gemini-3-pro-image-preview',
        cost: 20,
    },
    {
        id: 'curi-v1-light',
        label: '큐리 v1 라이트',
        badge: '빠름',
        desc: '조금 더 빠르고 값이 쌉니다',
        engine: 'gemini-2.5-flash-image',
        cost: 12,
    },
]

export const DEFAULT_MODEL_ID = 'curi-v1'

export function getModel(id: string): CuriModel | undefined {
    return CURI_MODELS.find(m => m.id === id)
}

/** 브라우저가 보낸 모델 이름이 우리 것인지 확인한다 */
export function isValidModelId(v: unknown): v is string {
    return typeof v === 'string' && CURI_MODELS.some(m => m.id === v)
}
