// domains/connectors — 「밖의 도구와 연결하기」 공통 타입.
//
// 13개 서비스는 사용자 본인 계정 로그인(OAuth)으로 붙는다(providers.ts). 노션·슬랙은 열쇠를 손으로 붙여 넣는 옛길도 남겨 둔다.
// 계획은 docs/connectors/외부연결_계획.md, 열쇠 발급은 docs/connect/공급자_열쇠_발급.md.

import { PROVIDERS, PROVIDER_IDS, type ProviderId } from './providers'

/** 연결 종류 13가지 = 공급자 등록표(providers.ts)와 같은 글자. connectors.kind CHECK 도 같다 */
export const CONNECTOR_KINDS = PROVIDER_IDS
export type ConnectorKind = ProviderId

/** 열쇠를 손으로 붙여 넣어도 되는 것(OAuth 열쇠가 아직 없을 때의 뒷길). 나머지는 본인 계정 로그인(OAuth)으로만 붙는다 */
export const READY_KINDS: readonly ConnectorKind[] = ['notion', 'slack']

export interface ConnectorMeta {
    /** 화면에 보이는 이름 */
    name: string
    /** 한 줄 설명 (비개발자 말로) */
    hint: string
    /** 붙여 넣는 칸에 적는 안내(손으로 붙이는 두 개만) */
    placeholder: string
    /** 손으로 붙여 넣을 수 있나 */
    ready: boolean
    /** 이 연결로 봇이 할 수 있는 일 */
    can: string
}

const PLACEHOLDER: Partial<Record<ConnectorKind, string>> = {
    notion: 'ntn_ 로 시작하는 내 통합 토큰',
    slack: 'https://hooks.slack.com/services/... 웹훅 주소',
}

export const CONNECTOR_INFO: Record<ConnectorKind, ConnectorMeta> = Object.fromEntries(
    PROVIDERS.map(p => [p.id, {
        name: p.name, hint: p.hint, can: p.can,
        placeholder: PLACEHOLDER[p.id] ?? '',
        ready: READY_KINDS.includes(p.id),
    } satisfies ConnectorMeta]),
) as Record<ConnectorKind, ConnectorMeta>

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
