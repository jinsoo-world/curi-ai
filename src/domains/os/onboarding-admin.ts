// 관리자 「가입 온보딩」 화면과 CSV (대표 승인 0928). 가입(users) → 온보딩 시작, 완료(user_onboarding)
// → 첫 봇(team_bots) → 첫 메시지(chat_sessions.message_count > 0) 흐름과 들어온 길, 기기, 앱 여부, 업종 나눔.
// 합치는 계산(summarizeOnboarding, toCsv)은 순수 함수라 시험한다. 읽기는 service_role 로만.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACQUISITION, AGE_BANDS, OCCUPATIONS, RUNS, USE_CASES, labelOf, type Choice } from './onboarding'

export interface OnbRow {
    user_id: string
    status: string
    acquisition_source: string | null
    acquisition_detail: string | null
    referral_code: string | null
    referral_via: string | null
    use_cases: string[] | null
    age_band: string | null
    gender: string | null
    occupation: string | null
    runs_class_or_group: string | null
    audience_size_band: string | null
    org_name: string | null
    leader_contact_ok: boolean | null
    marketing_agreed: boolean | null
    terms_agreed_at: string | null
    device: string | null
    os: string | null
    app_shell: string | null
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    referrer: string | null
    started_at: string
    completed_at: string | null
}
export interface SignupUser { id: string; email: string | null; display_name: string | null; created_at: string }

export interface Funnel { signups: number; started: number; done: number; skipped: number; firstBot: number; firstMessage: number }
export type Breakdown = { key: string; label: string; count: number }[]
export interface OnbSummary {
    funnel: Funnel
    bySource: Breakdown
    byDevice: Breakdown
    byShell: Breakdown
    byOccupation: Breakdown
    byAge: Breakdown
    byUseCase: Breakdown
    byRuns: Breakdown
    byUtm: Breakdown
}

const SHELL: Choice[] = [{ id: 'web', label: '웹' }, { id: 'ios_app', label: '아이폰 앱' }, { id: 'android_app', label: '안드로이드 앱' }]
const DEVICE: Choice[] = [{ id: 'mobile', label: '휴대폰' }, { id: 'pc', label: 'PC' }]

function tally(values: (string | null | undefined)[], list?: Choice[]): Breakdown {
    const m = new Map<string, number>()
    for (const v of values) {
        const k = v || '(모름)'
        m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()]
        .map(([key, count]) => ({ key, label: list && key !== '(모름)' ? labelOf(list, key) : key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

/** 기간 안 가입자 기준으로 흐름과 나눔을 센다 (온보딩 행은 그 가입자 것만) */
export function summarizeOnboarding(users: SignupUser[], rows: OnbRow[], botOwners: Set<string>, chatUsers: Set<string>): OnbSummary {
    const ids = new Set(users.map(u => u.id))
    const mine = rows.filter(r => ids.has(r.user_id))
    return {
        funnel: {
            signups: users.length,
            started: mine.length,
            done: mine.filter(r => r.status === 'done').length,
            skipped: mine.filter(r => r.status === 'skipped').length,
            firstBot: users.filter(u => botOwners.has(u.id)).length,
            firstMessage: users.filter(u => chatUsers.has(u.id)).length,
        },
        bySource: tally(mine.map(r => r.acquisition_source), ACQUISITION),
        byDevice: tally(mine.map(r => r.device), DEVICE),
        byShell: tally(mine.map(r => r.app_shell), SHELL),
        byOccupation: tally(mine.map(r => r.occupation), OCCUPATIONS),
        byAge: tally(mine.map(r => r.age_band), AGE_BANDS),
        byUseCase: tally(mine.flatMap(r => (r.use_cases?.length ? r.use_cases : [null])), USE_CASES),
        byRuns: tally(mine.map(r => r.runs_class_or_group), RUNS),
        byUtm: tally(mine.map(r => r.utm_source)),
    }
}

/** KST 날짜(YYYY-MM-DD) 두 개 → UTC 경계. to 는 그날 끝까지 */
export function kstRange(from: string | null | undefined, to: string | null | undefined, now = new Date()): { from: string; to: string; startIso: string; endIso: string } {
    const ok = (s: string | null | undefined) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00+09:00`))
    const kstToday = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
    const t = ok(to) ? String(to) : kstToday
    const f = ok(from) ? String(from) : new Date(Date.parse(`${t}T00:00:00+09:00`) - 13 * 86400_000 + 9 * 3600_000).toISOString().slice(0, 10)
    const startIso = new Date(`${f}T00:00:00+09:00`).toISOString()
    const endIso = new Date(Date.parse(`${t}T00:00:00+09:00`) + 86400_000).toISOString()
    return { from: f, to: t, startIso, endIso }
}

const CSV_COLS: [string, (u: SignupUser, r: OnbRow | undefined, bot: boolean, chat: boolean) => unknown][] = [
    ['가입시각_KST', u => new Date(Date.parse(u.created_at) + 9 * 3600_000).toISOString().replace('T', ' ').slice(0, 16)],
    ['이메일', u => u.email],
    ['이름', u => u.display_name],
    ['온보딩', (_u, r) => r?.status ?? ''],
    ['알게된경로', (_u, r) => (r?.acquisition_source ? labelOf(ACQUISITION, r.acquisition_source) : '')],
    ['경로상세', (_u, r) => r?.acquisition_detail],
    ['초대코드', (_u, r) => r?.referral_code],
    ['초대방식', (_u, r) => r?.referral_via],
    ['맡길일', (_u, r) => (r?.use_cases ?? []).map(x => labelOf(USE_CASES, x)).join(' / ')],
    ['나이대', (_u, r) => (r?.age_band ? labelOf(AGE_BANDS, r.age_band) : '')],
    ['성별', (_u, r) => r?.gender],
    ['업종', (_u, r) => (r?.occupation ? labelOf(OCCUPATIONS, r.occupation) : '')],
    ['강의모임', (_u, r) => (r?.runs_class_or_group ? labelOf(RUNS, r.runs_class_or_group) : '')],
    ['인원', (_u, r) => r?.audience_size_band],
    ['모임이름', (_u, r) => r?.org_name],
    ['리더안내동의', (_u, r) => (r ? (r.leader_contact_ok ? 'Y' : 'N') : '')],
    ['마케팅동의', (_u, r) => (r ? (r.marketing_agreed ? 'Y' : 'N') : '')],
    ['약관동의시각', (_u, r) => r?.terms_agreed_at],
    ['기기', (_u, r) => r?.device],
    ['운영체제', (_u, r) => r?.os],
    ['앱여부', (_u, r) => r?.app_shell],
    ['utm_source', (_u, r) => r?.utm_source],
    ['utm_medium', (_u, r) => r?.utm_medium],
    ['utm_campaign', (_u, r) => r?.utm_campaign],
    ['referrer', (_u, r) => r?.referrer],
    ['첫봇', (_u, _r, bot) => (bot ? 'Y' : 'N')],
    ['첫메시지', (_u, _r, _b, chat) => (chat ? 'Y' : 'N')],
]

const esc = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    // 엑셀 수식 주입 막기 (=, +, -, @ 로 시작하면 앞에 작은따옴표)
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(users: SignupUser[], rows: OnbRow[], botOwners: Set<string>, chatUsers: Set<string>): string {
    const byId = new Map(rows.map(r => [r.user_id, r]))
    const lines = [CSV_COLS.map(c => c[0]).join(',')]
    for (const u of users) {
        const r = byId.get(u.id)
        lines.push(CSV_COLS.map(c => esc(c[1](u, r, botOwners.has(u.id), chatUsers.has(u.id)))).join(','))
    }
    return '\uFEFF' + lines.join('\r\n')
}

/** 기간 안 가입자와 그 사람들의 온보딩, 첫 봇, 첫 메시지를 읽는다 */
export async function loadOnboarding(db: SupabaseClient, startIso: string, endIso: string) {
    const { data: users, error } = await db.from('users')
        .select('id, email, display_name, created_at')
        .gte('created_at', startIso).lt('created_at', endIso)
        .order('created_at', { ascending: false }).limit(2000)
    if (error) throw new Error(error.message)
    const list = (users ?? []) as SignupUser[]
    const ids = list.map(u => u.id)
    if (ids.length === 0) return { users: list, rows: [] as OnbRow[], botOwners: new Set<string>(), chatUsers: new Set<string>(), sns: new Map<string, { status: string; bonus: boolean }>() }
    // 주소 길이 제한 때문에 100명씩 나눠 읽는다
    const rows: OnbRow[] = []
    const botOwners = new Set<string>()
    const chatUsers = new Set<string>()
    /** 사람별 SNS 링크 상태 (read 가 하나라도 있으면 read) + 보너스 받음 */
    const sns = new Map<string, { status: string; bonus: boolean }>()
    for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100)
        const [r, b, c, l, g] = await Promise.all([
            db.from('user_onboarding').select('*').in('user_id', part),
            db.from('app_events').select('user_id').eq('name', 'os_bot_created').or('tool.is.null,tool.neq.onboarding').in('user_id', part),
            db.from('chat_sessions').select('user_id').in('user_id', part).gt('message_count', 0),
            db.from('user_sns_links').select('user_id, status').in('user_id', part),
            db.from('sns_link_bonuses').select('user_id').in('user_id', part),
        ])
        rows.push(...((r.data ?? []) as OnbRow[]))
        for (const x of (b.data ?? []) as { user_id: string }[]) botOwners.add(x.user_id)
        for (const x of (c.data ?? []) as { user_id: string }[]) chatUsers.add(x.user_id)
        for (const x of (l.data ?? []) as { user_id: string; status: string }[]) {
            const prev = sns.get(x.user_id)
            if (!prev || x.status === 'read') sns.set(x.user_id, { status: x.status, bonus: prev?.bonus ?? false })
        }
        for (const x of (g.data ?? []) as { user_id: string }[]) sns.set(x.user_id, { status: sns.get(x.user_id)?.status ?? 'read', bonus: true })
    }
    return { users: list, rows, botOwners, chatUsers, sns }
}
