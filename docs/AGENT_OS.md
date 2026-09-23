# 큐리AI 에이전트 OS — 인계 문서 (누가 와도 여기서부터)

작성 2026-09-23. 다음 사람(사람이든 봇이든)이 이 저장소를 이어받을 때 읽는 첫 문서다.
기획 정본은 회사 드라이브 `02_제품/큐리스/큐리스_리뉴얼_기획고도화_0923.md`(대표 소유). 여기엔 **코드에 관한 것만** 적는다.
호칭 = AI 팀원은 **봇**이다(대표 지시 0923). 「멘토」「코치」는 옛 이름이라 화면 글자·새 코드·문서에 쓰지 않는다. DB 표 `mentors` 는 당장 그대로.

## 0. 한 줄

큐리AI = 한국형 「제2의 그록봇」. 사용자가 이름 있는 AI 봇 팀을 만들고, 봇은 사용자 자료로 답하고 초안을 만들며, 보내기·게시·구매·이체·삭제는 **승인 카드** 뒤에서만 한다. 모델은 업스테이지 솔라. 손님은 4060 한국인 강사·작가·크리에이터.

## 1. 지금 구조 (2026-09-23 기준)

```
src/app/                Next.js 화면·API (App Router)
src/domains/            업무 규칙. 화면은 여기만 부른다
  ├ llm/                ★ 새로 생김. 모델 드라이버 (솔라 / Gemini) — 아래 §2
  ├ chat/               대화. stream.ts 가 드라이버를 골라 답을 흘린다
  ├ mentor/             봇의 몸 (mentors 표: 이름·아바타·성격·말투 프롬프트·인사말)
  ├ knowledge/          자료 커널 (PDF·URL·유튜브 → 업스테이지 Document Parse → 벡터 검색)
  ├ credit/             클로버 (선불 재화). 1개 = 25원
  ├ notification/       먼저 말 걸기 (크론) — 루틴의 씨앗
  └ creator/ studio/ subscription/ trial/ traffic/ user/
supabase/schema.sql     처음 표. migrations/ 에 그 뒤 변경
docs/AGENT_OS.md        이 문서
```

- 배포 = Vercel(대표 개인 계정 `jin-7378`, 프로젝트 `app`). `main` 에 푸시하면 자동 배포.
- DB = Supabase `ueemicebrauwddtzvuyb`(본체 큐리어스와 완전히 다른 계정 묶음).
- 계측 = PostHog(큐리AI 전용 조직)·Clarity·GA/GTM·자체 `/api/track`.
- 공개 저장소다. **시크릿을 코드에 넣으면 즉시 유출된다.** §5.

## 2. 모델 드라이버 (`src/domains/llm`)

```
chat/stream.ts ─ generateChatStream()
   │ pickDriverFromEnv(hasImage)     ← llm/driver.ts  규칙 한 곳
   ├ solar  → llm/solar.ts  (fetch, OpenAI 호환, SSE)  실패(첫 글자 전) → gemini 로 되돌아감
   ├ gemini → chat/gemini.ts (기존)
   └ none   → 「지금은 잠깐 쉬는 중이에요」 한 줄. 절대 throw 안 함
```

| 환경변수 | 뜻 | 기본 |
|---|---|---|
| `UPSTAGE_API_KEY` | 솔라 열쇠(Document Parse 와 같은 열쇠) | Vercel 에 이미 있음 |
| `LLM_DRIVER` | `solar` / `gemini` 못 박기. **되돌리기 스위치** | 비움 = 솔라 열쇠 있으면 솔라 |
| `LLM_MODEL_CHAT` | 대화 모델 별명 | `solar-pro4` |
| `LLM_MODEL_MINI` | 분류·요약용 | `solar-mini4` |

- 사진이 붙은 대화는 Gemini 가 본다(솔라 대화 모델은 사진 못 봄).
- 답하다 중간에 끊기면 나온 글은 살리고 조용히 끝낸다(반쪽 답 뒤에 다른 모델을 이어 붙이지 않는다).
- 요금(2026-09-23 콘솔) = 솔라 프로 4 입력 $0.30 / 출력 $1.20 (100만 토큰), 미니 4 $0.10 / $0.40. 한도 분당 100회 / 25만 토큰.
- 로그 = `[LLM] driver=solar model=… ms=… prompt=… completion=…` (Vercel 로그에서 비용 추적).

## 3. 새 표 4개 (`supabase/migrations/20260923_agent_os_p0.sql`)

| 표 | 무엇 | 핵심 칸 |
|---|---|---|
| `team_bots` | 사용자 팀의 봇 명단(캐릭터·역할·승인 모드). 몸은 `mentors` | role twin/chief/helper · shape 6종 · color 8종 · approval_mode |
| `permission_requests` | 승인 카드 + 감사로그. 지우지 않는다 | action_type 8종(보내기·게시·구매·이체·삭제·권한·약관·기타) · status pending→allowed/denied/edited_allowed |
| `checkins` | 오늘 체크인(칩) 하루 한 줄 | mood·energy 1~5 · did[] · blocked |
| `next_steps` | 다음 한 걸음. 미룬 일 게이지 | due_on · done_at |

전부 RLS 켬 + 본인 행만. 서버 코드는 service_role 로 RLS 를 우회하니 **API 에서 user_id 를 꼭 검사**한다.
적용은 Supabase SQL 편집기에 통째로 붙여 실행(여러 번 실행해도 안전).

## 4. 운영 규칙 (그록봇 팀·사용자들이 배운 것. 봇 설명·화면에 그대로 심는다)

1. **승인선 = 되돌릴 수 있나.** 조사·요약·분류·초안·정리는 알아서 끝낸다. 보내기·게시·구매·이체·삭제/덮어쓰기·권한 변경·약관 동의는 카드 뒤에서만.
2. **봇을 나누는 5신호** = 목표 / 도구 / 일하는 방식 / 승인 경계 / 주기. 「초안 봇」과 「보내는 봇」은 한 봇이 아니다.
3. **설명(description)에 쓰면 영원, 채팅에 쓰면 한 번.** 상시 규칙은 `mentors.system_prompt` 에.
4. **자료가 없으면 지어내지 말고 실패를 보고한다.** 출처 없는 답 금지.
5. **루틴은 재시도·실패 규칙을 정한 뒤에만.** 「새 메시지마다」 같은 넓은 트리거 금지.
6. **조용함 규칙** = 바뀐 게 없으면 말하지 않는다.
7. **검증이 일이다.** 고치기 전에 재현, 배포 전에 화면·숫자로 증명(`npm run test:run` · `npx tsc --noEmit` · `npm run lint` · `npm run build` 넷 다 초록).

## 5. 보안 (공개 저장소 전제) — 반드시

- `.env*` 는 절대 커밋하지 않는다(`.gitignore` 확인). 로컬 `.env.local` 은 더미값이다. 진짜 열쇠는 Vercel 환경변수에만.
- 커밋 전 시크릿 스캔: `npx gitleaks detect --no-git -s .`(설치 안 됐으면 `brew install gitleaks`). GitHub 저장소 설정에서 **Secret scanning + Push protection** 켜기(대표 계정).
- 사용자 자료·대화는 `user_id` 로 격리(RLS). 로그에 본문·개인정보를 남기지 않는다.
- 봇 도구는 기본 거절 + 화이트리스트. 카드 없이 밖으로 나가는 길을 만들지 않는다.
- 상세 = 드라이브 `02_제품/큐리AI_보안설계_크리밋기준_0923.md`.

## 6. 하지 않는 것

자체 모델 학습 · 클라우드 컴퓨터(봇마다 VM) · Teach a task · 마켓플레이스 · 외부 커넥터 OAuth · 고객 계정 비공식 스크래핑 · 「24시간 AI 직원」 카피 · 계정풀·토큰 차익 · 화면에 원화 환산 강제 · 본체(curious-frontend-next) 손대기.

## 7. 명령

```bash
npm ci                 # 설치
npm run test:run       # 테스트 (2026-09-23: 17파일 136개)
npx tsc --noEmit       # 타입
npm run lint           # 린트
npm run build          # 빌드
```

## 7-1. 3일차에 생긴 것 (2026-09-25)

| 무엇 | 어디 | 알아 둘 것 |
|---|---|---|
| 봇 자료 창구 | `src/app/api/os/knowledge/*` · `src/domains/os/knowledge.ts` | 첫 줄이 늘 `assertBotOwned`(team_bots.user_id = 나). 링크는 SSRF 차단(사설·메타데이터 주소 금지). 유튜브는 제목·주소만 기억(자막 못 읽음) |
| 파일 올리기 | `/api/os/knowledge/upload-url` → 브라우저가 직접 올림 → `/api/creator/knowledge/process` | 글 뽑기는 기존 창구를 그대로 쓴다. `lib/mentor-owner.ts` 에 team_bots 주인 길을 하나 더했다 |
| 인용 | `/api/chat` 마지막 조각에 `sources:[{id,title}]` | 검색 함수가 출처를 안 주므로 조각 글로 되짚는다(`findSourcesOfChunks`). 실패해도 대화는 그대로 |
| 승인 카드 | `src/domains/agent/intent.ts`(규칙) · `permissions.ts`(DB) · `/api/os/chat/draft` · `/api/os/permissions*` | 규칙으로 먼저 보고 애매할 때만 솔라 미니. 허용해도 **여기서 보내지 않는다**. draft_only 봇은 카드도 안 만든다 |
| 그룹 채팅 | `supabase/migrations/20260925_channels.sql` · `src/domains/os/channels.ts` · `/api/os/channels/*` | 사람 말 한 번에 봇은 **최대 2번**. 봇이 부를 수 있는 건 한 명, 지목당한 봇은 다시 지목 못 한다(안티패턴 ㉟) |

## 9-1. 링크 바로 읽기 + 외부 연결(커넥터) — 2026-09-28 (브랜치 agent/n)

- **링크 바로 읽기** = `src/domains/agent/fetch-url.ts`. 사람이 쓴 말에 주소가 있으면 `/api/chat` 이 그 자리서 열어 읽고(최대 3개) 자료와 **같은 울타리**(`fenceKnowledge`)로 시스템 프롬프트에 넣는다. `usedSources` 에 `{id:'url:…', title}` 로 붙어 답 아래 📎 에 보인다. **읽은 글은 대화 기록에 저장하지 않는다**(이번 답에만 쓰고 버린다).
  - SSRF 방어 = http/https 만 · 안쪽 주소 차단(localhost·127.·10.·172.16~31.·192.168.·169.254.·::1·`*.supabase.co`·`*.vercel.app`) · **이름을 IP 로 풀어 한 번 더 검사**(DNS 되돌리기) · 리다이렉트 3회까지 **매번 재검사** · 2MB · 8초.
  - 네이버 블로그는 본문이 iframe 뒤라 `PostView.naver?blogId=…&logNo=…` 로 바꿔 읽는다. 유튜브는 제목·og:description 만(자막 못 읽음).
  - 못 읽으면 프롬프트에 「그 주소는 못 읽었어요(이유)」를 첫 줄에 밝히라고 못 박는다(지어내지 않게).
- **읽기 ↔ 넣기 갈래** (`domains/os/settings.ts` `readLocalIntent`) = 「읽어와·요약해·읽고」 → **바로 읽기**(위 기능, null 을 돌려줘 평소 대화 길로 보낸다). 「자료로 넣어·저장·기억·추가」 → **자료 넣기**(기존 `/api/os/knowledge`). 둘 다 있으면 넣기가 이긴다.
- **커넥터** = `supabase/migrations/20260928_connectors.sql`(`connectors` 표, RLS 본인 행만) · `src/domains/connectors/`.
  - 열쇠는 **평문 저장 금지**. `CONNECTOR_SECRET_KEY`(32바이트) 로 AES-256-GCM. 환경변수가 없으면 연결 기능이 「준비 중」으로 꺼진다. 만들기 = `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  - 노션(읽기) 도구 `notion_search` · `notion_read_page` → tool-gate **안전 목록**. 대화에서 「노션에서 … 찾아줘」 하면 `/api/chat` 이 상위 3개를 울타리로 넣는다.
  - 슬랙(보내기) 도구 `slack_post` → tool-gate **되돌릴 수 없는 목록**(`send_message`). 승인 카드 없이는 안 나간다. 지금은 카드 생성까지(「슬랙에 올려줘」는 `intent.ts` 의 `publish` 규칙에 걸려 카드가 뜬다). 허용된 카드를 읽어 실제로 올리는 연결선은 다음 차례.
  - API = `GET/POST/DELETE /api/os/connectors` · `POST /api/os/connectors/[id]/test`(분당 5회). 화면 = `src/components/os/ConnectorsPanel.tsx` → `/os/settings` 「연결」 칸.
  - 카톡·인스타·큐리어스 본체는 칸만 있고 「준비 중」. 무엇이 필요하고 며칠 걸리는지 = `docs/connectors/외부연결_계획.md`.

## 8. 변경 이력

- 2026-09-23 · 솔라 드라이버(`domains/llm`) + `chat/stream.ts` 되돌아가기 · 표 4개 마이그레이션 · 다크 토큰 `[data-theme="os"]` · 이 문서.

## 9. 메시징(푸시·문자·이메일) + 요청 횟수 제한 — 2026-09-27 (브랜치 agent/c)

- 관문 하나 = `src/domains/messaging/dispatch.ts`. 밖으로 나가는 모든 메시지는 여기를 지난다. 순서: 도구 관문(gateTool) → 문자 스위치(`SMS_ENABLED=true`) → 내 설정 → 조용한 시간(기본 22:00~08:00 서울, 푸시·문자 보류·이메일은 감) → 열쇠 준비 → 보내기 → `message_log`(받는 곳 끝 4자만).
- 내게 오는 알림(audience=self) = 안전 도구 `notify_owner`. **봇이 남에게 보내는 것(audience=other)은 `permission_requests.status IN ('allowed','edited_allowed')` 카드 id 가 있어야만 나간다.** 없으면 blocked 로 기록만.
- 드라이버 3개(같은 모양 `send(msg)`) = `drivers/push.ts`(web-push, VAPID) · `drivers/sms.ts`(기존 `lib/sms.ts` 솔라피) · `drivers/email.ts`(AWS SES v2). 열쇠 없으면 blocked, 죽지 않는다.
- 표 4개 = `supabase/migrations/20260927_messaging.sql` (push_subscriptions · message_log · notification_prefs · rate_limits). rate_limits 는 RLS 켬 + 정책 없음 = 서버 전용.
- API = `POST/DELETE /api/os/push/subscribe` · `GET/PATCH /api/os/notification-prefs` · `POST /api/os/messages/send`(승인 카드 id 필수) · `POST /api/os/messages/notify-me`.
- 화면 조각 = `src/components/os/NotificationSettings.tsx` (`/os/settings` 에 `<NotificationSettings />` 로 끼운다). 브라우저 쪽 = `src/lib/push-client.ts`, 서비스 워커 push 블록 = `public/sw.js` `// === push (메시징) ===` 안.
- 요청 횟수 제한(보안 C-1 9번) = `src/lib/rate-limit.ts` `checkRateLimit(db, key, limit, windowSec)`. 붙인 곳: `/api/chat` 분당 20 · `/api/image/generate` 시간당 10 · `/api/tts` 분당 10 · `/api/os/messages/*` 분당 5. 넘으면 429 + 한국어 안내. 표 없으면 통과 + 경고 로그.
- 환경변수 = `WEBPUSH_VAPID_PUBLIC` `WEBPUSH_VAPID_PRIVATE` `WEBPUSH_SUBJECT`(mailto:) · `SMS_ENABLED` + 솔라피 셋 · `SES_REGION` `SES_FROM` `AWS_ACCESS_KEY_ID` `AWS_SECRET_ACCESS_KEY`. VAPID 열쇠 만들기 = `node scripts/webpush-keys.mjs`(출력만).
- 2026-09-25 · 자료 커널을 봇 안으로(넣기·목록·빼기·인용) · 승인 카드(초안 + 허용/거절/고쳐서 허용) · 그룹 채팅(표 3개, 봇 2턴 상한). 테스트 213개.
