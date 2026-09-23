// 봇 마켓 (/os/market) = 리더들이 만든 공개 봇 목록을 큐리AI 뼈대(왼쪽 명단) 안에서 그린다.
//
// 왜 옛 /mentors 로 안 보내나 (대표 지시 0923 「봇마켓 들어갔다가 뒤로 다시 대화로 못간다」):
//  /mentors 는 큐리AI 뼈대 밖의 옛 화면이라 /os 로 돌아오는 단추가 하나도 없고(아래 탭에도 /os 없음),
//  홈 화면에 추가한 앱(standalone)엔 브라우저 뒤로 단추가 없다. 게다가 거기서 봇을 누르면 옛 /chat/ 화면으로 나가 버린다.
//  여기서는 왼쪽 명단이 그대로 있으니 봇을 누르면 바로 그 대화로, 브라우저 뒤로도 직전 대화로 돌아간다.
import Link from 'next/link'
import { getActiveMentors } from '@/domains/mentor'
import BotAvatar from '@/components/os/BotAvatar'

export const revalidate = 30   // /mentors 와 같은 주기

export default async function OsMarketPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
    const { demo } = await searchParams
    const tail = demo === '1' ? '?demo=1' : ''
    const mentors = await getActiveMentors()

    return (
        <div className="os-market">
            <h1>봇 마켓</h1>
            <p className="os-market-sub">리더들이 만든 공개 봇이에요. 눌러서 바로 이야기해 보세요. 왼쪽 명단을 누르면 내 봇 대화로 돌아가요.</p>
            {mentors.length === 0 ? (
                <div className="os-market-empty">아직 공개 봇이 없어요.</div>
            ) : (
                <div className="os-market-grid">
                    {mentors.map(m => (
                        <Link key={m.id} href={`/os/chat/${m.id}${tail}`} className="os-market-card" prefetch={false}>
                            <BotAvatar shape="circle" color="white" state="idle" size={64} faceUrl={m.avatar_url ?? null} name={m.name} />
                            <span className="os-market-name">{m.name}</span>
                            {m.title && <span className="os-market-title">{m.title}</span>}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
