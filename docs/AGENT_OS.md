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

## 8. 변경 이력

- 2026-09-23 · 솔라 드라이버(`domains/llm`) + `chat/stream.ts` 되돌아가기 · 표 4개 마이그레이션 · 다크 토큰 `[data-theme="os"]` · 이 문서.
