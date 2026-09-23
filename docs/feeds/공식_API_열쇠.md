# X, Instagram, TikTok 계정 연결을 켜는 데 필요한 것

지금 이 세 곳은 「연결」만 되고 글은 가져오지 않습니다. 화면에는 「준비 중」으로 보입니다.
이 세 회사는 공식 열쇠(개발자 앱 등록)가 있어야 글을 정당하게 가져올 수 있고, 몰래 긁어 오는 방법은 쓰지 않기로 했기 때문입니다.

아래 표를 개발자 앱을 등록해 줄 사람에게 그대로 넘기면 됩니다.

용어 풀이
- API: 회사가 공식으로 열어 둔 「데이터 받는 창구」
- 열쇠(토큰): 그 창구를 쓸 수 있다는 증명서. 비밀번호처럼 다룬다
- 권한(스코프): 열쇠로 할 수 있는 일의 범위. 읽기만 받는다
- 앱 심사: 회사가 「이 앱이 데이터를 바르게 쓰는지」 확인하는 절차. 며칠에서 몇 주 걸린다
- env 변수: 서버(Vercel) 설정 화면에 넣는 이름과 값 한 쌍. 코드에 직접 적지 않는다

| 플랫폼 | 필요한 API | 필요한 권한(스코프) | env 변수 이름 | 비고 |
|---|---|---|---|---|
| X | X API v2 (developer.x.com 에서 프로젝트와 앱 만들기) | 사용자 글 읽기: `tweet.read`, `users.read` | `X_API_BEARER_TOKEN` | 무료 요금제는 글 읽기가 거의 막혀 있어 Basic 이상 유료 요금제가 필요합니다. 공개 글만 읽습니다 |
| Instagram | Instagram Graph API (Meta for Developers 에서 앱 만들기, 크리에이터 계정은 비즈니스 또는 크리에이터 계정이어야 함) | `instagram_basic`, `pages_show_list` (크리에이터 본인이 로그인해서 허락) | `INSTAGRAM_GRAPH_ACCESS_TOKEN` (필요하면 `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`) | Meta 앱 심사를 통과해야 다른 크리에이터 계정에도 쓸 수 있습니다. 열쇠는 60일마다 새로 받아야 합니다 |
| TikTok | TikTok Display API (developers.tiktok.com 에서 앱 만들기) | `user.info.basic`, `video.list` (크리에이터 본인이 로그인해서 허락) | `TIKTOK_API_CLIENT_KEY`, `TIKTOK_API_CLIENT_SECRET` | TikTok 앱 심사가 필요합니다. 영상 설명 글만 가져오고, 영상 속 말은 따로 받아쓰기가 필요합니다 |

## 유튜브 예비 열쇠 (선택)

유튜브 채널은 열쇠 없이 공개 영상 목록(RSS)으로 가져옵니다. 그런데 2026-09-23 시험 때 유튜브 쪽 공개 목록이 모든 채널에서 「없음(404)」을 냈습니다.
예비 열쇠를 넣어 두면 그럴 때 공식 YouTube Data API 로 대신 가져옵니다. 없어도 다음 날 다시 시도합니다.

| 플랫폼 | 필요한 API | 필요한 권한(스코프) | env 변수 이름 | 비고 |
|---|---|---|---|---|
| 유튜브(예비) | YouTube Data API v3 (Google Cloud 콘솔에서 사용 설정 후 API 키 만들기) | 없음(공개 영상 목록 읽기만, 로그인 허락 불필요) | `YOUTUBE_API_KEY` | 무료 하루 한도(1만 단위) 안에서 충분합니다. 키는 YouTube Data API 만 쓰도록 제한해 두세요 |

## 열쇠를 받은 다음

1. Vercel 프로젝트 설정의 환경 변수(Environment Variables)에 위 이름 그대로 값을 넣습니다.
2. 개발자에게 「열쇠 넣었다」고 알려 주면, `src/domains/os/feeds/social-stub.ts` 자리를 실제 가져오기로 바꿉니다.
3. 그 전까지는 크리에이터가 연결해도 「준비 중(관리자가 열쇠를 등록해야 해요)」으로만 보이고, 아무것도 가져오지 않습니다.
