/**
 * 봇 공유 미리보기(카톡·SNS에 링크를 붙였을 때 뜨는 카드) 글자·그림 정하기.
 * 공개 봇만 봇 이름·한 줄·얼굴을 보여 주고, 비공개 봇은 큐리AI 기본 카드로 둔다.
 */
export const BRAND_GREEN = '#03C124'
export const GENERIC_BOT_META = {
    title: '큐리AI | 나를 닮은 AI 봇',
    description: '큐리AI에서 AI 봇과 지금 바로 대화해 보세요',
} as const

export interface ShareBot {
    id: string
    name: string
    title?: string | null
    description?: string | null
    avatar_url?: string | null
}

export function absoluteUrl(baseUrl: string, path: string | null | undefined): string | null {
    if (!path) return null
    if (/^https?:\/\//i.test(path)) return path
    if (!path.startsWith('/')) return null
    return `${baseUrl.replace(/\/+$/, '')}${path}`
}

/** 봇 한 줄 소개 — 제목(한 줄) → 설명 → 기본 문구 순서. 너무 길면 자른다 */
export function botOneLiner(bot: ShareBot, max = 80): string {
    const raw = (bot.title || bot.description || '').replace(/\s+/g, ' ').trim()
    const text = raw || `${bot.name}와(과) 지금 바로 대화해 보세요`
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export interface BotShareMeta {
    title: string
    description: string
    /** 공개 봇일 때만 채운다 */
    image: string | null
    isPublic: boolean
}

/** bot 이 null 이면(없거나 비공개) 기본 카드 */
export function botShareMeta(bot: ShareBot | null, baseUrl: string): BotShareMeta {
    if (!bot) return { ...GENERIC_BOT_META, image: null, isPublic: false }
    const base = baseUrl.replace(/\/+$/, '')
    return {
        title: `${bot.name} | 큐리AI`,
        description: botOneLiner(bot),
        image: `${base}/api/og/bot/${encodeURIComponent(bot.id)}`,
        isPublic: true,
    }
}
