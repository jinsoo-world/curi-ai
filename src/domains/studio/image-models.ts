// 사진 만드는 모델 이름 한 곳 (화면에서도 불러도 되게 서버 전용 코드는 넣지 않는다)
//
// 2026-09-28 바꿈: gemini-2.5-flash-image 가 2026-10-02 에 종료된다 (구글 가격표 경고).
//   빠른 모델 = Nano Banana 2 Lite (gemini-3.1-flash-lite-image). 1K 한 장 $0.0336, 종료 모델 $0.039 보다 싸다.
//   Nano Banana 2 (gemini-3.1-flash-image) 는 1K 한 장 $0.067 이라 비싸서 대표 승인 없이는 안 쓴다.
//   좋은 모델 = Nano Banana Pro 정식판 (gemini-3-pro-image). 미리보기판(-preview)은 2026-06-25 종료 대상이었고 값은 같다($0.134).
// 다시 바꿀 때는 Vercel 환경변수 한 줄: GEMINI_IMAGE_MODEL_FAST, GEMINI_IMAGE_MODEL_PRO

export const IMAGE_MODEL_FAST = (process.env.GEMINI_IMAGE_MODEL_FAST ?? '').trim() || 'gemini-3.1-flash-lite-image'
export const IMAGE_MODEL_PRO = (process.env.GEMINI_IMAGE_MODEL_PRO ?? '').trim() || 'gemini-3-pro-image'
