# Claude Code rules / Claude Code 운영 규칙

Claude Code must follow these rules for every task in `jinsoo-world/curi-ai`.

- 최신 `main`을 가져온 뒤 새 브랜치에서 시작한다. Always branch from the latest `main`.
- `main`에 직접 push하거나 merge하지 않는다. Never push or merge directly to `main`.
- 작업이 끝나면 반드시 `git push -u origin HEAD`를 실행하고 `gh pr create --repo jinsoo-world/curi-ai --base main`으로 PR을 연다.
- 완료 보고에는 GitHub PR URL을 반드시 포함한다. Never finish without a GitHub PR URL in the report.
- PR 하나는 한 경로만 다룬다. Keep one path per PR and keep the diff readable.
- Cursor Cloud Agent는 사용하지 않는다. Work locally and use direct tools only.
- `.env`, API key, `service_role`, Toss secret 등 비밀값을 커밋하거나 출력하지 않는다. Never expose or commit secrets.
- Day plan과 security rules는 [Notion ops brief](https://app.notion.com/p/3e47d4c95d0081dfb82fd0f0475e63d8?pvs=204)를 먼저 읽는다.
