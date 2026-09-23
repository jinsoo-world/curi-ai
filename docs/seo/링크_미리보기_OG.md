# 카톡 / 아이메시지 / 슬랙 링크 미리보기 (OG)

작성 2026-09-23.

## 지금
- 사이트 기본 OG = `src/app/layout.tsx` (`metadataBase` = `https://www.curi-ai.com`)
- OG 이미지 = `public/og.png` (1200x630, 절대 URL `https://www.curi-ai.com/og.png`)
- `/os`, `/os/welcome`, `/landing` 도 같은 카드 문구와 이미지를 심음
- 제목 기본: 「인생 후반전 에이전트 OS, 큐리AI」
- 제품 카피에는 가운데점(·)과 긴 대시(—)를 쓰지 않는다

## 카톡에서 다시 보기
1. 배포 뒤 `curl -sL https://www.curi-ai.com/os | grep og:` 로 태그 확인
2. 카카오 디버거(개발자용 Open Graph 도구)에 URL을 넣고 **캐시 초기화** 후 다시 수집
   - 도구 주소가 바뀌면 카카오 디벨로퍼스 문서의 「메시지 / 스크랩」 안내를 본다
3. 디버거가 없으면 링크 끝에 `?v=날짜` 를 붙여 새 주소로 한 번 공유해 본다 (캐시 우회)
4. 아이메시지/슬랙도 자체 캐시가 있다. 같은 URL을 다시 붙이면 옛 카드가 남을 수 있다

## 다음에 (봇별 공유 카드)
핸들/봇 공개 페이지(`/[handle]`, `/os/chat/[botId]` 공개분)마다
`og:title` = 봇 이름, `og:image` = 봇 아바타 또는 전용 카드로 나누면 된다.
지금은 사이트 공통 카드만 맞춰 두었다.
