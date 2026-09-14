// 사진 만드는 모델 — 대표 지시 2026-09-14
// 「우리 모델명도 하나 만들자. 우리 모델은 커스텀해서 제공하는거야」
// 「어떤 모델로 만들까요? 여야지. GPT, 나노바나나 모델도 추가하고」
//
// pfpmaker 도 자기 이름(PFPMaker v1)과 남의 모델(GPT Image 2.5, 나노바나나)을 같이 판다.
// 우리도 같다. 큐리 v1 은 우리가 지시문을 손본 것이고, 나머지는 원본 그대로다.

export interface CuriModel {
    id: string
    label: string
    badge: string
    desc: string
    /** 실제로 부르는 모델 이름 (화면 노출 금지) */
    engine: string
    cost: number
    /** 아직 못 쓰는 모델이면 이유 */
    comingSoon?: string
    /** 카드에 보일 색 (미리보기 느낌) */
    tint: string
    /** 카드에 걸 그림. 우리 모델은 큐리 로고를 쓴다 (대표 지시 0914 「이거 로고로 하고」) */
    logo?: string
}

export const CURI_MODELS: CuriModel[] = [
    {
        id: 'curi-v1',
        label: '큐리 v1',
        badge: '우리 모델',
        desc: '중장년 얼굴이 딴사람이 되지 않게 우리가 손봤어요',
        engine: 'gemini-3-pro-image-preview',
        cost: 20,
        tint: '#22c55e',
        logo: '/logo.png',
    },
    {
        id: 'nano-banana-2',
        label: '나노바나나 2',
        badge: '빠름',
        desc: '구글 모델 그대로. 값이 싸고 빨라요',
        engine: 'gemini-2.5-flash-image',
        cost: 12,
        tint: '#eab308',
    },
    {
        id: 'gpt-image',
        label: 'GPT 이미지',
        badge: '준비 중',
        desc: '곧 쓸 수 있게 준비하고 있어요',
        engine: '',
        cost: 25,
        comingSoon: '아직 연결 전이에요. 조금만 기다려 주세요.',
        tint: '#a1a1aa',
    },
]

export const DEFAULT_MODEL_ID = 'curi-v1'

export function getModel(id: string): CuriModel | undefined {
    return CURI_MODELS.find(m => m.id === id)
}

/** 지금 실제로 쓸 수 있는 모델만 통과시킨다 */
export function isValidModelId(v: unknown): v is string {
    return typeof v === 'string' && CURI_MODELS.some(m => m.id === v && !m.comingSoon)
}
