# 답변 품질 점검 0929 — DB 확인용 조회문 (읽기 전용)

이 Mac의 .env.local 은 가짜 키라 실제 DB를 못 봤다. DB 권한 있는 사람이 Supabase SQL 편집기에서 아래를 그대로 실행하면 된다. 전부 SELECT 라 데이터는 바뀌지 않는다.

## 1. 도여사 지침 중 가격·링크·날짜가 들어간 줄

```sql
select m.name, t.line_no, t.line
from mentors m,
     lateral regexp_split_to_table(m.system_prompt, E'\n') with ordinality as t(line, line_no)
where m.name ilike '%도여사%'
  and t.line ~ '([0-9,]+ ?원|₩|만 ?원|https?://|www\.|[0-9]{1,2} ?월|[0-9]{1,2} ?일|[0-9]{4}[.-][0-9]{1,2}|요일|가격|비용|참여비|수강료|일정|마감|모집)'
order by m.name, t.line_no;
```

## 2. 실패한 자료 (봇, 제목, 실패 이유, 요약)

```sql
select m.name as bot, s.title, s.failure_reason, left(s.summary, 200) as summary, s.created_at
from knowledge_sources s
join mentors m on m.id = s.mentor_id
where s.status = 'failed'
order by m.name, s.created_at desc;
```

summary 칸이 없다는 오류가 나면 `left(s.summary, 200) as summary,` 줄만 지우고 다시 실행한다.
