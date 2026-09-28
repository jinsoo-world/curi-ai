// 봇 공유 미리보기 그림 (1200x630) — 초록 바탕에 봇 얼굴과 이름. 공개 봇만, 아니면 기본 그림
import { ImageResponse } from 'next/og'
import { getPublicMentorById } from '@/domains/mentor'
import { absoluteUrl, botOneLiner, BRAND_GREEN, type ShareBot } from '@/domains/share/botMeta'

export async function GET(_req: Request, { params }: { params: Promise<{ botId: string }> }) {
    const { botId } = await params
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.curi-ai.com'
    let bot: ShareBot | null = null
    try { bot = (await getPublicMentorById(botId)) as ShareBot | null } catch { bot = null }
    const face = bot ? absoluteUrl(baseUrl, bot.avatar_url) : null
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
