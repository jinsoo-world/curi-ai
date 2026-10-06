// 앱 연결 state — 서명·만료·위조·1회용
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { appPkce, appProofOf, appReturnUrl, consumeAppNonce, isAppState, newAppState, proofMatches, purgeAppConnectRows, verifyAppState } from '../app-state'
import { STATE_MAX_AGE_SEC, deriveKey, randomState, signState, verifyState } from '../oauth'

const key = randomBytes(32)
const NOW = 1_800_000_000
const PR = appProofOf('app-secret-1')

describe('앱 state', () => {
    it('만들면 사용자·공급자·출처가 돌아온다', () => {
        const { state, nonce } = newAppState('u1', 'notion', key, PR, NOW)
        expect(isAppState(state)).toBe(true)
        expect(verifyAppState(state, key, NOW + 5)).toEqual({ u: 'u1', p: 'notion', n: nonce, pr: PR, src: 'app', iat: NOW })
    })

    it('웹 state 와 구분된다', () => {
        expect(isAppState(randomState())).toBe(false)
        expect(isAppState(null)).toBe(false)
        expect(verifyAppState(randomState(), key)).toBeNull()
    })

    it('10분이 지나면 거절, 10분 안은 통과', () => {
        const { state } = newAppState('u1', 'notion', key, PR, NOW)
        expect(verifyAppState(state, key, NOW + STATE_MAX_AGE_SEC)).not.toBeNull()
        expect(verifyAppState(state, key, NOW + STATE_MAX_AGE_SEC + 1)).toBeNull()
    })

    it('사용자 번호를 바꿔치기하면 서명이 틀려 거절', () => {
        const { state } = newAppState('u1', 'notion', key, PR, NOW)
        const [, body, sig] = state.split('.')
        const j = JSON.parse(Buffer.from(body, 'base64url').toString())
        j.u = 'attacker'
        const forged = `app.${Buffer.from(JSON.stringify(j)).toString('base64url')}.${sig}`
        expect(verifyAppState(forged, key, NOW)).toBeNull()
    })

    it('공급자·서명 변조, 다른 열쇠로 만든 것, 쓰레기는 거절', () => {
        const { state } = newAppState('u1', 'notion', key, PR, NOW)
        expect(verifyAppState(state.slice(0, -2) + 'xx', key, NOW)).toBeNull()
        expect(verifyAppState(newAppState('u1', 'notion', randomBytes(32), PR, NOW).state, key, NOW)).toBeNull()
        expect(verifyAppState('app.', key, NOW)).toBeNull()
        expect(verifyAppState('app.a.b.c', key, NOW)).toBeNull()
        expect(verifyAppState(`${state}.extra`, key, NOW)).toBeNull()
    })

    it('열쇠 용도 분리: 앱 state 는 웹 쿠키로, 웹 쿠키는 앱 state 로 통하지 않는다', () => {
        const { state } = newAppState('u1', 'notion', key, PR, NOW)
        const asCookie = state.slice('app.'.length)                 // 앞 표시를 떼서 웹 쿠키 자리에 넣기
        expect(verifyState(asCookie, key, NOW)).toBeNull()
        expect(verifyState(state, key, NOW)).toBeNull()             // 표시를 붙인 채로도 안 됨
        const web = signState({ provider: 'notion', state: 'x', iat: NOW }, key)
        expect(verifyAppState(`app.${web}`, key, NOW)).toBeNull()   // 웹 쿠키에 app. 만 붙여도 안 됨
        expect(deriveKey(key, 'a').equals(deriveKey(key, 'b'))).toBe(false)
        expect(deriveKey(key, 'a').equals(key)).toBe(false)
    })

    it('proof 모양이 틀린 state 는 거절', () => {
        const { state } = newAppState('u1', 'notion', key, 'not-a-hash', NOW)
        expect(verifyAppState(state, key, NOW)).toBeNull()
    })

    it('proof 는 원문과 맞을 때만', () => {
        expect(proofMatches('app-secret-1', PR)).toBe(true)
        expect(proofMatches('other', PR)).toBe(false)
        expect(proofMatches('', PR)).toBe(false)
    })

    it('청소는 하루 지난 행만 지우는 질의를 낸다', async () => {
        const calls: string[] = []
        const db = { from: (t: string) => ({ delete: () => ({ lt: async (c: string, v: string) => { calls.push(`${t}.${c}<${v}`); return { error: null } } }) }) } as never
        await purgeAppConnectRows(db, Date.parse('2026-10-20T00:00:00Z'))
        expect(calls).toEqual(['connector_app_nonces.created_at<2026-10-19T00:00:00.000Z', 'connector_app_pending.expires_at<2026-10-19T00:00:00.000Z'])
    })

    it('PKCE 는 같은 번호면 같고 state 에 원문이 없다', () => {
        const { state, nonce } = newAppState('u1', 'zoom', key, PR, NOW)
        const a = appPkce(key, nonce)
        expect(appPkce(key, nonce)).toEqual(a)
        expect(appPkce(key, 'other').verifier).not.toBe(a.verifier)
        expect(state).not.toContain(a.verifier)
    })

    it('1회용: 처음 true, 두 번째 false, 표 없음은 오류', async () => {
        const used = new Set<string>()
        const db = (code?: string) => ({
            from: () => ({
                insert: async (r: { nonce: string }) => {
                    if (code) return { error: { code, message: 'x' } }
                    if (used.has(r.nonce)) return { error: { code: '23505', message: 'dup' } }
                    used.add(r.nonce); return { error: null }
                },
            }),
        }) as never
        expect(await consumeAppNonce(db(), 'n1', 'u1')).toBe(true)
        expect(await consumeAppNonce(db(), 'n1', 'u1')).toBe(false)
        await expect(consumeAppNonce(db('42P01'), 'n2', 'u1')).rejects.toThrow()
    })

    it('딥링크 모양', () => {
        expect(appReturnUrl({ connected: 'notion' })).toBe('curiai://connect?connected=notion')
        expect(appReturnUrl({ error: 'denied', provider: 'zoom' })).toBe('curiai://connect?error=denied&provider=zoom')
    })
})
