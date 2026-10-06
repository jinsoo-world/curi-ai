// 앱 연결 state — 서명·만료·위조·1회용
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { appPkce, appReturnUrl, consumeAppNonce, isAppState, newAppState, verifyAppState } from '../app-state'
import { STATE_MAX_AGE_SEC, randomState } from '../oauth'

const key = randomBytes(32)
const NOW = 1_800_000_000

describe('앱 state', () => {
    it('만들면 사용자·공급자·출처가 돌아온다', () => {
        const { state, nonce } = newAppState('u1', 'notion', key, NOW)
        expect(isAppState(state)).toBe(true)
        expect(verifyAppState(state, key, NOW + 5)).toEqual({ u: 'u1', p: 'notion', n: nonce, src: 'app', iat: NOW })
    })

    it('웹 state 와 구분된다', () => {
        expect(isAppState(randomState())).toBe(false)
        expect(isAppState(null)).toBe(false)
        expect(verifyAppState(randomState(), key)).toBeNull()
    })

    it('10분이 지나면 거절, 10분 안은 통과', () => {
        const { state } = newAppState('u1', 'notion', key, NOW)
        expect(verifyAppState(state, key, NOW + STATE_MAX_AGE_SEC)).not.toBeNull()
        expect(verifyAppState(state, key, NOW + STATE_MAX_AGE_SEC + 1)).toBeNull()
    })

    it('사용자 번호를 바꿔치기하면 서명이 틀려 거절', () => {
        const { state } = newAppState('u1', 'notion', key, NOW)
        const [, body, sig] = state.split('.')
        const j = JSON.parse(Buffer.from(body, 'base64url').toString())
        j.u = 'attacker'
        const forged = `app.${Buffer.from(JSON.stringify(j)).toString('base64url')}.${sig}`
        expect(verifyAppState(forged, key, NOW)).toBeNull()
    })

    it('공급자·서명 변조, 다른 열쇠로 만든 것, 쓰레기는 거절', () => {
        const { state } = newAppState('u1', 'notion', key, NOW)
        expect(verifyAppState(state.slice(0, -2) + 'xx', key, NOW)).toBeNull()
        expect(verifyAppState(newAppState('u1', 'notion', randomBytes(32), NOW).state, key, NOW)).toBeNull()
        expect(verifyAppState('app.', key, NOW)).toBeNull()
        expect(verifyAppState('app.a.b.c', key, NOW)).toBeNull()
        expect(verifyAppState(`${state}.extra`, key, NOW)).toBeNull()
    })

    it('PKCE 는 같은 번호면 같고 state 에 원문이 없다', () => {
        const { state, nonce } = newAppState('u1', 'zoom', key, NOW)
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
