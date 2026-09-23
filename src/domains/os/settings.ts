// domains/os — 화면 설정에서 쓰는 「셈만 하는」 함수들.
//
// 왜 도메인에 두나 = 글자 크기 저장·클로버 띠 문구·칩 고르기는 화면마다 조금씩 다르게 베껴 쓰기 쉽다.
// 한 곳에 두고 시험을 붙여 두면 어느 화면에서도 같은 답이 나온다. 브라우저·DB 는 여기서 만지지 않는다.

import { isLowClover } from '@/domains/credit/charge-flow'

/* ────────────────────────── 글자 크기 ────────────────────────── */

/** 3단. 화면에는 한국어로, 저장·CSS 에는 영어로 (CSS 선택자에 한글을 넣지 않는다) */
export const FONT_SIZES = ['small', 'normal', 'large'] as const
export type FontSize = typeof FONT_SIZES[number]

export const FONT_LABELS: Record<FontSize, string> = { small: '작게', normal: '보통', large: '크게' }

/** 브라우저에 적어 두는 열쇠 */
export const FONT_KEY = 'curi_os_font'

/** 봇 팀 화면이 쓰는 시간대. 루틴·체크인·이번 주가 모두 이 달력을 본다 */
export const OS_TIMEZONE = 'Asia/Seoul'

/** 우리가 아는 값이면 그대로, 아니면 기본값 */
export function cleanFontSize(v: unknown, fallback: FontSize = 'normal'): FontSize {
    return (FONT_SIZES as readonly string[]).includes(String(v)) ? (v as FontSize) : fallback
}

/** 저장해 둔 글자 크기 읽기. 저장이 막혀 있어도(사파리 비공개) 죽지 않는다 */
export function readFontSize(store?: Pick<Storage, 'getItem'> | null): FontSize {
    try {
        return cleanFontSize(store?.getItem(FONT_KEY))
    } catch {
        return 'normal'
    }
}

/** 글자 크기 저장. 저장이 막혀 있어도 고른 값은 그대로 돌려준다 */
export function saveFontSize(size: unknown, store?: Pick<Storage, 'setItem'> | null): FontSize {
    const 값 = cleanFontSize(size)
    try {
        store?.setItem(FONT_KEY, 값)
    } catch { /* 저장이 막혀도 이번 화면에는 적용된다 */ }
    return 값
}

/**
 * 문서 뿌리에 글자 크기를 붙인다 → os.css 의 `[data-font="large"] …` 가 받는다.
 * 「보통」은 붙이지 않는다(기본값이라 규칙이 없다).
 */
export function applyFontSize(root: { dataset: Record<string, string | undefined> } | null | undefined, size: unknown): FontSize {
    const 값 = cleanFontSize(size)
    if (!root) return 값
    if (값 === 'normal') delete root.dataset.font
    else root.dataset.font = 값
    return 값
}

/* ────────────────────────── 클로버 잔량 띠 ────────────────────────── */

export interface CloverBarView {
    /** 띠에 그대로 찍는 글 */
    text: string
    /** 누르면 가는 곳 */
    href: string
    /** 단추에 적는 글 */
    action: string
    /** 경고색으로 그릴지 (20개 이하) */
    warn: boolean
}

/** 로그인 전에 주는 선물 개수 (대표 확정 0915) */
export const SIGNUP_CLOVERS = 40

/**
 * 입력창 위 「🍀 클로버 N개 남음 [충전]」 한 줄.
 * ⛔ 원화 환산은 넣지 않는다(대표 확정 0915).
 * 잔량을 아직 못 읽었으면 null = 띠를 아예 안 그린다(0 으로 깜빡이면 놀란다).
 */
export function cloverBarView(balance: number | null | undefined, guest: boolean, from: string): CloverBarView | null {
    if (guest) {
        return {
            text: `로그인하고 클로버 ${SIGNUP_CLOVERS}개 받기`,
            href: '/login?next=/os',
            action: '로그인',
            warn: false,
        }
    }
    if (balance === null || balance === undefined || Number.isNaN(balance)) return null
    return {
        text: `클로버 ${balance}개 남음`,
        href: `/os/charge?from=${encodeURIComponent(from || '/os')}`,
        action: '충전',
        warn: isLowClover(balance),
    }
}

/* ────────────────────── 서버에 묻기 전에 알아채는 가벼운 규칙 ────────────────────── */

/**
 * 사람 말이 「모델을 부를 것도 없는 일」인지 먼저 본다.
 *  - 주소 + 넣어/추가/저장/기억/자료  → 자료로 **넣기** (모델 안 부름 = 클로버 안 씀)
 *  - 그룹/단톡/여러 봇                → 그룹 채팅 만드는 곳 안내
 * 애매하면 null = 평소대로 봇에게 물어본다. 넓게 잡으면 사람 말을 가로챈다.
 *
 * ⚠️ 「읽어와·요약해·읽고」는 여기서 잡지 않는다(2026-09-28 갈라 놓음).
 *    그건 **바로 읽기** = /api/chat 이 그 자리서 주소를 열어 읽고 이번 답에만 쓰고 버린다.
 *    저장(여기)과 그냥 읽기(거기)는 다른 일이다. 읽어 달라는 말을 저장으로 바꿔 버리면
 *    사람이 시키지도 않은 자료가 봇에 쌓인다(자료는 봇 하나당 10개뿐이다).
 */
export type LocalIntent = { kind: 'knowledge'; url: string } | { kind: 'group' } | null

const URL_RE = /https?:\/\/[^\s<>"')]+/i
/** 「저장해 둬」 쪽 말만. 「읽어줘」는 일부러 뺐다 */
const 넣어달라 = /(자료로|자료에|자료 로|넣어|넣어줘|넣어 줘|추가|저장|기억)/
const 그룹말 = /(그룹|단톡|여러\s*봇)/

export function readLocalIntent(text: string): LocalIntent {
    const 말 = (text ?? '').trim()
    if (!말) return null

    const m = 말.match(URL_RE)
    if (m && 넣어달라.test(말)) {
        // 문장 끝 따옴표·마침표가 주소에 딸려오는 것만 떼어 낸다
        return { kind: 'knowledge', url: m[0].replace(/[.,!?)\]]+$/, '') }
    }
    // 주소를 넣어 달라는 말이 아니면서 그룹 이야기면 안내
    if (!m && 그룹말.test(말)) return { kind: 'group' }
    return null
}

/* ────────────────────────── 여러 개 고르는 칩 ────────────────────────── */

/**
 * 칩 하나를 눌렀을 때의 새 목록. 이미 골랐으면 빼고, 아니면 넣는다.
 * 넣을 자리가 없으면(최대치) 그대로 둔다 — 조용히 앞의 것을 밀어내면 사람이 속는다.
 */
export function toggleChip(list: readonly string[], chip: string, max = 6): string[] {
    if (list.includes(chip)) return list.filter(v => v !== chip)
    if (list.length >= max) return [...list]
    return [...list, chip]
}
