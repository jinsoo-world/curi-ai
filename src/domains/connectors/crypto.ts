// domains/connectors — 연결 열쇠 잠그기·풀기 (AES-256-GCM).
//
// 왜 필요한가 = 사용자가 붙여 넣는 노션 토큰·슬랙 웹훅 주소는 **그 사람 계정을 여는 열쇠**다.
// DB 에 그대로 적어 두면, DB 한 번 새는 날 모든 사용자의 노션이 같이 샌다.
// 그래서 서버만 아는 자물쇠(CONNECTOR_SECRET_KEY)로 잠가서 넣고, 쓸 때만 푼다.
//
// 규칙
//  - 자물쇠는 환경변수에만 있다. 코드·DB 에 절대 넣지 않는다(공개 저장소다).
//  - 자물쇠가 없으면 연결 기능 자체가 「준비 중」으로 꺼진다(잠그지 않고 저장하는 길을 만들지 않는다).
//  - GCM 은 「누가 중간에 고쳤는지」까지 잡는다. 한 글자라도 바뀌면 풀 때 터진다.
//  - 같은 글을 두 번 잠가도 결과가 다르다(매번 새 iv). 같은 글인지 눈으로 못 알아본다.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/** 잠금 방식 이름. 나중에 바꿀 때를 대비해 맨 앞에 적어 둔다 */
const V1 = 'v1'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12      // GCM 권장값
const KEY_BYTES = 32     // 256비트

export class ConnectorKeyMissing extends Error {
    constructor() { super('CONNECTOR_SECRET_KEY 가 없어서 연결 기능이 꺼져 있다') }
}

/**
 * 환경변수에서 자물쇠를 읽는다. base64 든 hex 든 32바이트면 받는다.
 * 없거나 길이가 틀리면 null = 기능 꺼짐.
 */
export function readConnectorKey(raw = process.env.CONNECTOR_SECRET_KEY): Buffer | null {
    const v = String(raw ?? '').trim()
    if (!v) return null
    for (const enc of ['base64', 'hex'] as const) {
        try {
            const buf = Buffer.from(v, enc)
            if (buf.length === KEY_BYTES) return buf
        } catch { /* 다음 방식으로 */ }
    }
    return null
}

/** 연결 기능을 켤 수 있나 (자물쇠가 있나) */
export function connectorsEnabled(raw = process.env.CONNECTOR_SECRET_KEY): boolean {
    return readConnectorKey(raw) !== null
}

/** 자물쇠를 가져온다. 없으면 던진다 — 잠그지 않고 저장하는 길은 없다 */
export function requireConnectorKey(raw = process.env.CONNECTOR_SECRET_KEY): Buffer {
    const key = readConnectorKey(raw)
    if (!key) throw new ConnectorKeyMissing()
    return key
}

/** 잠근다 → "v1.iv.tag.암호문" (전부 base64) */
export function encryptSecret(plain: string, key: Buffer = requireConnectorKey()): string {
    const text = String(plain ?? '')
    if (!text) throw new Error('잠글 내용이 비어 있다')
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGO, key, iv)
    const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [V1, iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join('.')
}

/** 푼다. 모양이 틀리거나 중간에 고쳐졌으면 던진다 */
export function decryptSecret(blob: string, key: Buffer = requireConnectorKey()): string {
    const parts = String(blob ?? '').split('.')
    if (parts.length !== 4 || parts[0] !== V1) throw new Error('잠긴 내용의 모양이 아니다')
    const [, ivB64, tagB64, bodyB64] = parts
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * 화면에 보여 줄 때 쓰는 가림 글. 끝 4자만 남긴다.
 * (열쇠 전체는 다시 보여 주지 않는다 — 넣을 때만 본다)
 */
export function maskSecret(plain: string): string {
    const v = String(plain ?? '')
    if (v.length <= 4) return '••••'
    return `••••${v.slice(-4)}`
}
