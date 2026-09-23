// 리더 정산 정보 — 검사·가림·잠금을 인터넷·DB 없이 확인한다.
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { encryptSecret, decryptSecret } from '@/domains/connectors/crypto'
import { BANKS, accountLast4, digitsOnly, maskAccount, toPayoutView, validatePayoutInput } from '../payout'

const 정상 = {
    legalName: '열정진', email: 'Jin@Example.com', phone: '010-1234-5678', birthDate: '1990-05-01',
    bankName: BANKS[0], accountNumber: '110-123-456789', accountHolder: '열정진', agreed: true,
}
const 오늘 = new Date('2026-09-23T00:00:00.000Z')

describe('os/payout — 폼 검사', () => {
    it('정상 입력은 정리해서 돌려준다(이메일 소문자, 번호는 숫자만)', () => {
        const r = validatePayoutInput(정상, 오늘)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.value.email).toBe('jin@example.com')
            expect(r.value.phone).toBe('01012345678')
            expect(r.value.accountNumber).toBe('110123456789')
            expect(r.value.bankName).toBe(BANKS[0])
        }
    })

    it('동의 없으면 저장 못 한다', () => {
        const r = validatePayoutInput({ ...정상, agreed: false }, 오늘)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toContain('동의')
    })

    it('틀린 칸은 이유 하나를 쉬운 말로', () => {
        expect(validatePayoutInput({ ...정상, phone: '02-123-4567' }, 오늘)).toMatchObject({ ok: false, error: expect.stringContaining('휴대폰') })
        expect(validatePayoutInput({ ...정상, birthDate: '1990-13-01' }, 오늘)).toMatchObject({ ok: false, error: expect.stringContaining('생년월일') })
        expect(validatePayoutInput({ ...정상, birthDate: '2020-01-01' }, 오늘)).toMatchObject({ ok: false, error: expect.stringContaining('생년월일') })
        expect(validatePayoutInput({ ...정상, bankName: '없는은행' }, 오늘)).toMatchObject({ ok: false, error: expect.stringContaining('은행') })
        expect(validatePayoutInput({ ...정상, accountNumber: '123' }, 오늘)).toMatchObject({ ok: false, error: expect.stringContaining('계좌번호') })
        expect(validatePayoutInput({ ...정상, email: '이메일아님' }, 오늘)).toMatchObject({ ok: false, error: expect.stringContaining('이메일') })
        expect(validatePayoutInput(null, 오늘)).toMatchObject({ ok: false })
    })
})

describe('os/payout — 계좌 가림·잠금', () => {
    it('가림 글은 뒤 4자리만', () => {
        expect(maskAccount('110-123-456789')).toBe('****6789')
        expect(accountLast4('110-123-456789')).toBe('6789')
        expect(maskAccount('12')).toBe('****')
        expect(digitsOnly(' 010-1234 5678 ')).toBe('01012345678')
    })

    it('잠근 계좌에는 원문이 없고, 같은 열쇠로만 풀린다', () => {
        const 자물쇠 = randomBytes(32)
        const 잠김 = encryptSecret('110123456789', 자물쇠)
        expect(잠김).not.toContain('110123456789')
        expect(decryptSecret(잠김, 자물쇠)).toBe('110123456789')
        expect(() => decryptSecret(잠김, randomBytes(32))).toThrow()
    })

    it('화면 모양에는 계좌 전체·잠긴 원문이 없다', () => {
        const view = toPayoutView({
            legal_name: '열정진', email: 'jin@example.com', phone: '01012345678', birth_date: '1990-05-01',
            bank_name: '국민은행', account_last4: '6789', account_holder: '열정진',
            agreed_at: '2026-09-23T00:00:00.000Z', updated_at: '2026-09-23T00:00:00.000Z',
        })
        expect(view.accountLast4).toBe('6789')
        expect(JSON.stringify(view)).not.toContain('110123456789')
        expect(Object.keys(view)).not.toContain('accountNumber')
        expect(Object.keys(view)).not.toContain('accountNumberEncrypted')
    })
})
