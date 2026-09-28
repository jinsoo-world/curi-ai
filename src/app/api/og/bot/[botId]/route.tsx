// 봇 공유 미리보기 그림 (1200x630) — 초록 바탕에 봇 얼굴과 이름. 공개 봇만, 아니면 기본 그림
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { getPublicMentorById } from '@/domains/mentor'
import { absoluteUrl, botOneLiner, BRAND_GREEN, type ShareBot } from '@/domains/share/botMeta'

export const runtime = 'nodejs'

/** 얼굴 사진을 받아 png 로 바꿔 data 주소로 (webp, svg 는 그림 도구가 못 그림). 실패하면 null = 첫 글자 */
async function faceDataUrl(url: string | null): Promise<string | null> {
    if (!url) return null
    try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5_000) })
        if (!r.ok) return null
        const buf = Buffer.from(await r.arrayBuffer())
        const png = await sharp(buf).resize(320, 320, { fit: 'cover' }).png().toBuffer()
        return `data:image/png;base64,${png.toString('base64')}`
    } catch { return null }
}

export async function GET(_req: Request, { params }: { params: Promise<{ botId: string }> }) {
    const { botId } = await params
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.curi-ai.com'
    let bot: ShareBot | null = null
    try { bot = (await getPublicMentorById(botId)) as ShareBot | null } catch { bot = null }
    const face = await faceDataUrl(bot ? absoluteUrl(baseUrl, bot.avatar_url) : null)
    const name = bot?.name ?? '큐리AI'
    const line = bot ? botOneLiner(bot, 40) : '나를 닮은 AI 봇'

    return new ImageResponse(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: BRAND_GREEN, padding: 80, color: '#fff' }}>
                {face ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={face} width={320} height={320} alt="" style={{ borderRadius: 160, border: '10px solid #fff', objectFit: 'cover' }} />
                ) : (
                    <div style={{ width: 320, height: 320, borderRadius: 160, background: '#fff', color: BRAND_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 160, fontWeight: 800 }}>{name.slice(0, 1)}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 64, flex: 1 }}>
                    <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1 }}>{name}</div>
                    <div style={{ fontSize: 38, marginTop: 20, opacity: 0.92 }}>{line}</div>
                    <div style={{ fontSize: 32, marginTop: 48, fontWeight: 700 }}>큐리AI에서 대화하기 →</div>
                </div>
            </div>
        ),
        { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=3600' } },
    )
}
