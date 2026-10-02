// domains/push — 앱 기기 번호 등록·해제·알림 열림 기록. db 는 service_role(서버 전용 표)이라 user_id 를 여기서 꼭 건다.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApnsEnv, Platform } from './types'

export interface RegisterInput {
    platform: Platform
    token: string
    apnsEnv: ApnsEnv | null
    appVersion: string | null
    locale: string | null
    timezone: string | null
}

/** 애플 기기 번호 = 16진수, 구글 = 영문·숫자·:_-. 그 밖의 글자가 있으면 받지 않는다 */
const TOKEN_RE = /^[A-Za-z0-9:_\-.]{8,4096}$/

const short = (v: unknown, max: number): string | null => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t ? t.slice(0, max) : null
}

/** POST /api/push/register 몸통 읽기. 틀리면 이유 글 */
export function parseRegisterBody(body: unknown): { ok: true; value: RegisterInput } | { ok: false; error: string } {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const platform = b.platform
    if (platform !== 'ios' && platform !== 'android') return { ok: false, error: 'platform 은 ios 또는 android 여야 해요' }
    const token = typeof b.token === 'string' ? b.token.trim() : ''
    if (!TOKEN_RE.test(token)) return { ok: false, error: '기기 번호가 비었거나 모양이 틀려요' }
    let apnsEnv: ApnsEnv | null = null
    if (platform === 'ios') {
        if (b.apnsEnv !== undefined && b.apnsEnv !== null && b.apnsEnv !== 'sandbox' && b.apnsEnv !== 'production') {
            return { ok: false, error: 'apnsEnv 는 sandbox 또는 production 이에요' }
        }
        apnsEnv = (b.apnsEnv as ApnsEnv | undefined) ?? 'production'
    }
    return {
        ok: true,
        value: {
            platform,
            token: platform === 'ios' ? token.toLowerCase() : token,
            apnsEnv,
            appVersion: short(b.appVersion, 40),
            locale: short(b.locale, 20),
            timezone: short(b.timezone, 64),
        },
    }
}

/** push_devices 에 넣을 한 줄. 같은 기기 번호가 다른 사람 것이었으면 지금 사람으로 옮기고 다시 켠다 */
export function deviceRow(userId: string, input: RegisterInput, now: Date) {
    return {
        user_id: userId,
        platform: input.platform,
        token: input.token,
        apns_env: input.apnsEnv,
        app_version: input.appVersion,
        locale: input.locale,
        timezone: input.timezone,
        last_seen_at: now.toISOString(),
        disabled_at: null,
        disabled_reason: null,
    }
}

type Db = Pick<SupabaseClient, 'from'>
type DbError = { code?: string; message?: string } | null

/** 기기 번호는 한 줄만(token unique). 한 기기에서 계정을 바꿔 로그인하면 알림이 새 계정으로 간다 */
export async function registerDevice(db: Db, userId: string, input: RegisterInput, now = new Date()): Promise<DbError> {
    const { error } = await db.from('push_devices').upsert(deviceRow(userId, input, now), { onConflict: 'token' })
    return error
}

/** 로그아웃·탈퇴 때. 내 기기 번호만 지운다 */
export async function unregisterDevice(db: Db, userId: string, token: string): Promise<DbError> {
    const t = token.trim()
    const { error } = await db.from('push_devices').delete().eq('user_id', userId).in('token', [t, t.toLowerCase()])
    return error
}

/** 알림을 눌렀다. 내 기록만, 처음 누른 시각만 남긴다 */
export async function markOpened(db: Db, userId: string, sendId: string, now = new Date()): Promise<DbError> {
    const { error } = await db.from('push_sends').update({ opened_at: now.toISOString() })
        .eq('id', sendId).eq('user_id', userId).is('opened_at', null)
    return error
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
