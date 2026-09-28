// domains/home: 대표 확인용 예시 데이터 (대표 지시 0929 00:32, 00:33 운영에도 켜도 된다로 정정).
// 데이터베이스에는 아무것도 쓰지 않는다. 켜져 있는 동안 화면에 「예시 데이터」 표시가 항상 붙는다.
// 켜고 끄기: Vercel 환경 변수 NEXT_PUBLIC_HOME_FEED_DUMMY=1 (끄려면 변수를 지우고 다시 배포). 끄면 실제 기록과 숨김 기준으로 돌아간다.

import type { HomeFeedItem, HomeStats } from './feed'

export function homeFeedDummyOn(flag: string | undefined = process.env.NEXT_PUBLIC_HOME_FEED_DUMMY): boolean {
    return flag === '1' || flag === 'true'
}

/** 예시 줄. 활동 줄과 돈 줄(비교용) 섞음 */
export const HOME_FEED_DUMMY: HomeFeedItem[] = [
    { key: 'd1', text: '김**님이 상담 봇을 만들었어요', ago: '3분 전' },
    { key: 'd2', text: '이**님 봇에 +1,200원', ago: '5분 전' },
    { key: 'd3', text: '박**님이 홍보팀장을 팀에 들였어요', ago: '8분 전' },
    { key: 'd4', text: '최**님이 나를 닮은 AI를 만들었어요', ago: '12분 전' },
    { key: 'd5', text: '정**님이 글감봇과 대화를 시작했어요', ago: '20분 전' },
    { key: 'd6', text: '한**님 봇에 +800원', ago: '31분 전' },
    { key: 'd7', text: '윤**님이 쇼핑몰 안내 봇을 만들었어요', ago: '45분 전' },
    { key: 'd8', text: '강**님이 조사팀장과 대화를 시작했어요', ago: '1시간 전' },
    { key: 'd9', text: '조**님 봇에 +3,500원', ago: '2시간 전' },
    { key: 'd10', text: '서**님이 팬 질문 답장 초안을 팀에 들였어요', ago: '3시간 전' },
]

export const HOME_STATS_DUMMY: HomeStats = { bots: 1234, chats: 56789 }

export const HOME_DUMMY_LABEL = '예시 데이터'
