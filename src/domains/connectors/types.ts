// domains/connectors — 「밖의 도구와 연결하기」 공통 타입.
//
// 1차로 진짜 붙는 것 = 노션(읽기) / 슬랙(보내기).
// 카톡, 인스타, 큐리어스 본체는 칸만 있고 「준비 중」이다(심사, 전용 API 가 있어야 열린다).
// 계획은 docs/connectors/외부연결_계획.md.

/** 연결 종류 5가지 */
export const CONNECTOR_KINDS = ['notion', 'slack', 'kakao', 'instagram', 'curious'] as const
export type ConnectorKind = typeof CONNECTOR_KINDS[number]

/** 지금 정말로 붙일 수 있는 것 */
export const READY_KINDS: readonly ConnectorKind[] = ['notion', 'slack']

export interface ConnectorMeta {
    /** 화면에 보이는 이름 */
    name: string
    /** 한 줄 설명 (비개발자 말로) */
    hint: string
    /** 붙여 넣는 칸에 적는 안내 */
    placeholder: string
    /** 지금 쓸 수 있나 */
    ready: boolean
    /** 이 연결로 봇이 할 수 있는 일 */
    can: string
}

export const CONNECTOR_INFO: Record<ConnectorKind, ConnectorMeta> = {
    notion: {
        name: '노션',
        hint: '내 노션 문서를 봇이 찾아 읽어요. 쓰지는 않아요.',
        placeholder: 'ntn_ 로 시작하는 내 통합 토큰',
        ready: true,
        can: '읽기만',
    },
    slack: {
        name: '슬랙',
        hint: '봇이 우리 방에 글을 올려요. 올리기 전에 꼭 물어봐요.',
        placeholder: 'https://hooks.slack.com/services/... 웹훅 주소',
        ready: true,
        can: '보내기(승인 카드 뒤에서만)',
    },
    kakao: {
        name: '카카오톡',
        hint: '준비 중이에요. 채널 심사가 끝나야 열려요.',
        placeholder: '',
        ready: false,
        can: '준비 중',
    },
    instagram: {
        name: '인스타그램',
        hint: '준비 중이에요. 앱 심사가 끝나야 열려요.',
        placeholder: '',
        ready: false,
        can: '준비 중',
    },
    curious: {
        name: '큐리어스',
        hint: '준비 중이에요. 큐리어스 본체 창구를 여는 중이에요.',
        placeholder: '',
        ready: false,
        can: '준비 중',
    },
}

export type ConnectorStatus = 'connected' | 'error'

/** 화면, API 가 주고받는 모양. **열쇠는 절대 들어가지 않는다** */
export interface ConnectorView {
    id: string
    kind: ConnectorKind
    label: string
    status: ConnectorStatus
    /** 끝 4자만 */
    secretHint: string
    createdAt: string
    lastUsedAt: string | null
}

/** 우리가 아는 종류인가 */
export function cleanKind(v: unknown): ConnectorKind | null {
    return (CONNECTOR_KINDS as readonly string[]).includes(String(v)) ? (v as ConnectorKind) : null
}

/** 지금 붙일 수 있는 종류인가 */
export function isReadyKind(v: unknown): boolean {
    const k = cleanKind(v)
    return !!k && READY_KINDS.includes(k)
}
