// domains/os — 리더 정산 정보(이름·이메일·휴대폰·생년월일·은행·계좌·예금주·동의).
//
// 규칙
//  - 계좌번호는 그대로 저장하지 않는다. connectors/crypto 의 자물쇠(CONNECTOR_SECRET_KEY)로 잠가 넣는다.
//  - 밖으로 나가는 모양(PayoutView)에는 계좌 뒤 4자리만 담는다. 잠긴 원문도 담지 않는다.
//  - 서버(service_role)에서만 쓴다. user_id 는 여기서 반드시 건다.
//  - 실제 정산 금액 산식은 여기 없다(대표 확정 전). 화면은 「정산 기준은 준비 중이에요」.

import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptSecret } from '@/domains/connectors/crypto'

const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

export class PayoutTableMissing extends Error {
    constructor() { super('creator_payout_profiles 표가 아직 없다. supabase/migrations/20260931_bot_links_payout.sql 을 실행해야 한다') }
}

/** 은행 고르기 목록 (화면 select 와 검사가 같은 목록을 쓴다) */
export const BANKS = [
    '국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', 'IBK기업은행', 'SC제일은행', '씨티은행',
    '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '신협', '우체국', '수협은행',
    '부산은행', '대구은행', '경남은행', '광주은행', '전북은행', '제주은행', 'KDB산업은행', '저축은행',
] as const
export type BankName = typeof BANKS[number]

/** 폼에서 들어오는 그대로 */
export interface PayoutInput {
    legalName: string
    email: string
    phone: string
    birthDate: string        // 'YYYY-MM-DD'
    bankName: string
    accountNumber: string
    accountHolder: string
    agreed: boolean
}

/** 검사 통과 뒤 정리된 값 */
export interface PayoutClean {
    legalName: string
    email: string
    phone: string            // 숫자만
    birthDate: string
    bankName: BankName
    accountNumber: string    // 숫자만
    accountHolder: string
}

/** 화면으로 나가는 모양. 계좌는 뒤 4자리만 */
export interface PayoutView {
    legalName: string
    email: string
    phone: string
    birthDate: string
    bankName: string
    accountLast4: string
    accountHolder: string
    agreedAt: string
    updatedAt: string
}

// ───────────────────────── 순수 규칙 ─────────────────────────

/** 숫자만 남긴다 (하이픈·공백 제거) */
export function digitsOnly(v: unknown): string {
    return String(v ?? '').replace(/\D/g, '')
}

/** 계좌번호 가림 글 = 뒤 4자리만 */
export function maskAccount(accountNumber: string): string {
    const d = digitsOnly(accountNumber)
    if (d.length < 4) return '****'
    return `****${d.slice(-4)}`
}

/** 뒤 4자리 (DB 의 account_last4 에 넣는 값) */
export function accountLast4(accountNumber: string): string {
    return digitsOnly(accountNumber).slice(-4)
}

function isValidDate(s: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    const d = new Date(`${s}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return false
    return d.toISOString().slice(0, 10) === s
}

export type ValidateResult = { ok: true; value: PayoutClean } | { ok: false; error: string }

/** 폼 검사. 하나라도 틀리면 쉬운 한국어로 이유 하나만 돌려준다 */
export function validatePayoutInput(raw: Partial<PayoutInput> | null | undefined, today: Date = new Date()): ValidateResult {
    const r = raw ?? {}
    const legalName = String(r.legalName ?? '').trim()
    if (legalName.length < 2 || legalName.length > 30) return { ok: false, error: '이름을 2자 이상 써 주세요' }

    const email = String(r.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return { ok: false, error: '이메일 주소를 다시 확인해 주세요' }

    const phone = digitsOnly(r.phone)
    if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, error: '휴대폰 번호는 010으로 시작하는 10~11자리로 써 주세요' }

    const birthDate = String(r.birthDate ?? '').trim()
    if (!isValidDate(birthDate)) return { ok: false, error: '생년월일을 연-월-일 순서로 골라 주세요' }
    const year = Number(birthDate.slice(0, 4))
    const thisYear = today.getUTCFullYear()
    if (year < thisYear - 120 || year > thisYear - 14) return { ok: false, error: '생년월일을 다시 확인해 주세요' }

    const bankName = String(r.bankName ?? '').trim()
    if (!(BANKS as readonly string[]).includes(bankName)) return { ok: false, error: '은행을 목록에서 골라 주세요' }

    const accountNumber = digitsOnly(r.accountNumber)
    if (accountNumber.length < 8 || accountNumber.length > 16) return { ok: false, error: '계좌번호는 숫자 8~16자리로 써 주세요' }

    const accountHolder = String(r.accountHolder ?? '').trim()
    if (accountHolder.length < 2 || accountHolder.length > 30) return { ok: false, error: '예금주 이름을 써 주세요' }

    if (r.agreed !== true) return { ok: false, error: '개인정보 수집에 동의해 주셔야 저장할 수 있어요' }

    return { ok: true, value: { legalName, email, phone, birthDate, bankName: bankName as BankName, accountNumber, accountHolder } }
}

type Row = {
    legal_name: string; email: string; phone: string; birth_date: string; bank_name: string
    account_last4: string; account_holder: string; agreed_at: string; updated_at: string
}

/** DB 줄 → 화면 모양. 잠긴 계좌는 애초에 SELECT 하지 않는다 */
export function toPayoutView(r: Row): PayoutView {
    return {
        legalName: r.legal_name, email: r.email, phone: r.phone, birthDate: r.birth_date, bankName: r.bank_name,
        accountLast4: r.account_last4, accountHolder: r.account_holder, agreedAt: r.agreed_at, updatedAt: r.updated_at,
    }
}

const SELECT = 'legal_name, email, phone, birth_date, bank_name, account_last4, account_holder, agreed_at, updated_at'

// ───────────────────────── DB ─────────────────────────

/** 내 정산 정보 (없으면 null). 표가 없으면 null 로 본다 — 화면이 죽지 않는다 */
export async function getPayoutProfile(db: SupabaseClient, userId: string): Promise<PayoutView | null> {
    const { data, error } = await db.from('creator_payout_profiles').select(SELECT).eq('user_id', userId).maybeSingle()
    if (error) {
        if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) return null
        throw new Error(error.message)
    }
    return data ? toPayoutView(data as Row) : null
}

/** 정산 정보가 들어 있나 (대시보드 「정산 정보 넣기」 표시용) */
export async function hasPayoutProfile(db: SupabaseClient, userId: string): Promise<boolean> {
    return (await getPayoutProfile(db, userId)) !== null
}

/**
 * 정산 정보 저장(처음이면 넣고, 있으면 덮어쓴다). 계좌는 잠가서 넣는다.
 * 자물쇠(CONNECTOR_SECRET_KEY)가 없으면 crypto 가 ConnectorKeyMissing 을 던진다 = 저장 안 됨.
 */
export async function savePayoutProfile(db: SupabaseClient, userId: string, value: PayoutClean, now: Date = new Date()): Promise<PayoutView> {
    const encrypted = encryptSecret(value.accountNumber)
    const { data, error } = await db
        .from('creator_payout_profiles')
        .upsert({
            user_id: userId,
            legal_name: value.legalName,
            email: value.email,
            phone: value.phone,
            birth_date: value.birthDate,
            bank_name: value.bankName,
            account_number_encrypted: encrypted,
            account_last4: accountLast4(value.accountNumber),
            account_holder: value.accountHolder,
            agreed_at: now.toISOString(),
            updated_at: now.toISOString(),
        }, { onConflict: 'user_id' })
        .select(SELECT)
        .single()
    if (error || !data) {
        if ((error?.code === TABLE_MISSING || error?.code === TABLE_MISSING_REST)) throw new PayoutTableMissing()
        throw new Error(error?.message ?? '정산 정보를 저장하지 못했다')
    }
    return toPayoutView(data as Row)
}
