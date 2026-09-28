# 답 품질 관문 (rag-eval)

봇이 올린 자료에서 제대로 찾아오는지 40문제로 점수를 매긴다. 40개 중 32개 이상 맞히면 통과한다.

## 준비
`.env.local` 에 진짜 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` (답 모드에는 `UPSTAGE_API_KEY` 도) 가 있어야 한다.

## 1. 문제 40개 만들기 (처음 한 번, 0원, DB 는 읽기만)
```
node scripts/rag-eval-build.mjs --bots 열정진,도여사,글담쌤,남기훈
```
- `docs/qa/rag-eval-golden.json` 이 생긴다. 봇 5~8개, 가격(price)·일정(schedule)·이름(name)·일반 사실(fact) 32문제 + 자료에 없는 질문(notin) 8문제.
- 전화번호·메일이 든 조각은 뺀다. 만든 뒤 한 번 훑어보고 어색한 질문은 손으로 고친 뒤 올린다(커밋).

## 2. 점수 매기기
```
node scripts/rag-eval.mjs                 # 검색만 (임베딩 40번, 거의 0원)
node scripts/rag-eval.mjs --answer        # 답까지 만들어 검사 (솔라 미니 40번, 수십 원)
node scripts/rag-eval.mjs --fixture 다른파일.json --no-write
```
- 맞힘(검색) = 위 5개 조각 안에 기대한 말(`expectAny`)이 있음. notin 은 가장 가까운 조각 유사도가 `notinMaxSim`(0.75) 보다 낮으면 맞힘.
- 답 검사 = 핵심 사실(`keyFacts`)이 답에 다 있고, 자료에 없는 숫자를 지어내지 않음. notin 은 "모른다"고 해야 맞힘.
- 표와 종류별 점수, 합계를 찍는다. 기준(`threshold`, 기본 32) 미만이면 종료 코드 1.
- 결과 한 줄을 `rag_eval_runs` (status=`golden`) 에 남긴다. 표가 없으면 건너뛴다.

채점 규칙: `src/domains/knowledge/rag-eval.ts`, 시험: `src/domains/knowledge/__tests__/rag-eval.test.ts`.
