import { describe, it, expect, vi } from 'vitest'
import { generateKeyPairSync, verify, createVerify } from 'node:crypto'
import { classifyApns, createApnsTransport, makeApnsJwt, apnsPayload, APNS_HOSTS } from '../apns'
import { classifyFcm, createFcmTransport, fcmConfig, fcmMessage } from '../fcm'
import type { PushDevice, PushMessage } from '../types'

const MSG: PushMessage = { title: '제목', body: '본문', deeplink: 'curiai://bot/m-1', type: 'P001', sendId: 's-1' }
const IOS: PushDevice = { id: 'd1', userId: 'u1', platform: 'ios', token: 'abc123', apnsEnv: 'sandbox' }
const AND: PushDevice = { id: 'd2', userId: 'u1', platform: 'android', token: 'fcm-token', apnsEnv: null }

const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const P8 = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
const RSA_PEM = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

describe('애플(APNs)', () => {
    it('서명표는 ES256 으로 서명되고 애플이 읽는 칸(kid, iss, iat)을 담는다', () => {
        const jwt = makeApnsJwt({ keyId: 'KEY1', teamId: 'TEAM1', p8: P8 }, 1_700_000_000)
        const [h, c, s] = jwt.split('.')
        expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1' })
        expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ iss: 'TEAM1', iat: 1_700_000_000 })
        const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
        expect(ok).toBe(true)
    })

    it('200 이면 성공', () => {
        expect(classifyApns(200, '')).toEqual({ ok: true })
    })
    it('410 · BadDeviceToken · Unregistered 는 죽은 번호 = 기기를 끈다', () => {
        expect(classifyApns(410, '{"reason":"Unregistered"}')).toMatchObject({ ok: false, disable: true })
        expect(classifyApns(400, '{"reason":"BadDeviceToken"}')).toMatchObject({ ok: false, disable: true })
    })
    it('DeviceTokenNotForTopic 은 앱 번호(APNS_BUNDLE_ID) 설정 실수일 수 있어 끄지 않는다', () => {
        expect(classifyApns(400, '{"reason":"DeviceTokenNotForTopic"}')).toMatchObject({ ok: false, disable: false })
    })
    it('일시 오류(429, 500, 503)는 기기를 끄지 않는다', () => {
        expect(classifyApns(429, '{"reason":"TooManyRequests"}')).toMatchObject({ ok: false, disable: false })
        expect(classifyApns(503, '')).toMatchObject({ ok: false, disable: false })
        expect(classifyApns(403, '{"reason":"InvalidProviderToken"}')).toMatchObject({ ok: false, disable: false })
    })

    it('알림 몸통에 sendId·deeplink 와 예전 앱용 mentorId 를 싣는다', () => {
        expect(apnsPayload(MSG)).toEqual({
            aps: { alert: { title: '제목', body: '본문' }, sound: 'default' },
            sendId: 's-1', type: 'P001', deeplink: 'curiai://bot/m-1', mentorId: 'm-1',
        })
    })

    it('열쇠 4개가 다 있어야 준비된다', () => {
        expect(createApnsTransport({ env: {} }).ready()).toBe(false)
        expect(createApnsTransport({ env: { APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_KEY_P8: P8 } }).ready()).toBe(false)
        expect(createApnsTransport({ env: { APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_KEY_P8: P8, APNS_BUNDLE_ID: 'b' } }).ready()).toBe(true)
    })

    it('기기가 sandbox 면 개발 주소, production 이면 운영 주소로 보낸다', async () => {
        const request = vi.fn(async () => ({ status: 200, body: '' }))
        const t = createApnsTransport({
            env: { APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_KEY_P8: P8.replace(/\n/g, '\\n'), APNS_BUNDLE_ID: 'com.missiondriven.curiai' },
            request,
        })
        await t.send(IOS, MSG)
        await t.send({ ...IOS, apnsEnv: 'production' }, MSG)
        const calls = request.mock.calls as unknown as [string, string, Record<string, string>, string][]
        expect(calls[0][0]).toBe(APNS_HOSTS.sandbox)
        expect(calls[1][0]).toBe(APNS_HOSTS.production)
        expect(calls[0][1]).toBe('/3/device/abc123')
        expect(calls[0][2]['apns-topic']).toBe('com.missiondriven.curiai')
        expect(calls[0][2].authorization).toMatch(/^bearer ey/)
    })
})

describe('구글(FCM)', () => {
    const SA = JSON.stringify({ client_email: 'push@curiai-57dc7.iam.gserviceaccount.com', private_key: RSA_PEM, project_id: 'curiai-57dc7' })

    it('열쇠 JSON 이 없거나 깨졌으면 준비 안 됨', () => {
        expect(fcmConfig({})).toBeNull()
        expect(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: '{깨짐' })).toBeNull()
        expect(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: SA })?.projectId).toBe('curiai-57dc7')
    })

    it('404 만으로는 끄지 않는다(프로젝트 번호가 틀려도 404)', () => {
        expect(classifyFcm(404, JSON.stringify({ error: { status: 'NOT_FOUND', message: 'Requested entity was not found.' } }))).toMatchObject({ ok: false, disable: false })
    })
    it('UNREGISTERED 는 죽은 번호 = 기기를 끈다', () => {
        const body = JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } })
        expect(classifyFcm(404, body)).toMatchObject({ ok: false, disable: true, error: 'fcm 404 UNREGISTERED' })
        const bad = JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })
        expect(classifyFcm(400, bad)).toMatchObject({ ok: false, disable: true })
    })
    it('권한 없음·일시 오류는 기기를 끄지 않는다', () => {
        expect(classifyFcm(403, JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }))).toMatchObject({ ok: false, disable: false })
        expect(classifyFcm(503, '')).toMatchObject({ ok: false, disable: false })
        expect(classifyFcm(200, '{"name":"x"}')).toEqual({ ok: true })
    })

    it('data 칸은 모두 글자로 싣는다', () => {
        expect(fcmMessage('tok', MSG)).toEqual({
            message: { token: 'tok', notification: { title: '제목', body: '본문' }, data: { sendId: 's-1', type: 'P001', deeplink: 'curiai://bot/m-1' }, android: { priority: 'HIGH' } },
        })
    })

    it('구글 출입증을 받아 보내고, 출입증은 끝나기 전까지 다시 쓴다', async () => {
        const calls: { url: string; body: string; headers: Record<string, string> }[] = []
        const fetch = vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
            calls.push({ url, body: init.body, headers: init.headers })
            if (url.includes('oauth2')) return { status: 200, text: async () => JSON.stringify({ access_token: 'ya29.x', expires_in: 3600 }) }
            return { status: 200, text: async () => '{"name":"projects/curiai-57dc7/messages/1"}' }
        })
        const t = createFcmTransport({ env: { FCM_SERVICE_ACCOUNT_JSON: SA }, fetch, nowSec: () => 1_700_000_000 })
        expect(await t.send(AND, MSG)).toEqual({ ok: true })
        expect(await t.send(AND, MSG)).toEqual({ ok: true })
        expect(calls.filter(c => c.url.includes('oauth2'))).toHaveLength(1)
        expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/curiai-57dc7/messages:send')
        expect(calls[1].headers.authorization).toBe('Bearer ya29.x')

        // 출입증 서명은 RS256 으로 검증된다
        const assertion = new URLSearchParams(calls[0].body).get('assertion')!
        const [h, c, s] = assertion.split('.')
        const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`)
        expect(v.verify(rsa.publicKey, Buffer.from(s, 'base64url'))).toBe(true)
        expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toMatchObject({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    })

    it('구글이 UNREGISTERED 를 주면 끄라고 알린다', async () => {
        const fetch = vi.fn(async (url: string) => url.includes('oauth2')
            ? { status: 200, text: async () => '{"access_token":"t","expires_in":3600}' }
            : { status: 404, text: async () => JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) })
        const t = createFcmTransport({ env: { FCM_SERVICE_ACCOUNT_JSON: SA }, fetch })
        expect(await t.send(AND, MSG)).toMatchObject({ ok: false, disable: true })
    })
})
