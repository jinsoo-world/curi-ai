// domains/os — 화면 글자 사전 (한국어, 영어, 일본어) 와 언어 고르기.
//
// 쓰는 법: `t(locale, 'settings.title')`. 값에 `{n}` 처럼 구멍이 있으면 셋째 인자로 채운다.
// 사전은 한국어(ko)가 기준이다. en, ja 는 ko 와 **키 집합이 똑같아야** 한다(시험이 지킨다).
// 이번에 옮긴 범위 = 설정 화면, /os/welcome, 사용량 모달, 알림 설정. 다른 화면은 여기 키만 더하면 된다.
// 브라우저(localStorage, navigator)는 여기서 직접 만지지 않는다. 화면이 넘겨 준다.

import { kstDayHourText, untilText, usageDetail, withComma, type UsageDetail, type UsageLike } from '@/domains/os/usage'

export const LOCALES = ['ko', 'en', 'ja'] as const
export type Locale = typeof LOCALES[number]
/** 「시스템 설정 따르기」까지 포함한 선택지 */
export type LocaleChoice = 'system' | Locale
export const LOCALE_CHOICES: readonly LocaleChoice[] = ['system', ...LOCALES]

/** 브라우저에 적어 두는 열쇠 */
export const LOCALE_KEY = 'os-locale'

const ko = {
    // ── 설정: 뼈대 ──
    'settings.title': '설정',
    'tab.general': '일반',
    'tab.alerts': '알림',
    'tab.usage': '사용량과 요금제',
    'tab.app': '앱',

    // ── 설정: 계정 ──
    'sec.account': '계정',
    'account.name': '이름',
    'account.email': '이메일',
    'account.noName': '(이름 없음)',
    'account.loading': '읽는 중…',
    'account.guest': '로그인하면 이름과 이메일이 보여요.',
    'account.login': '로그인',
    'account.manage': '내 계정',
    'account.logout': '로그아웃',
    'account.logoutConfirm': '로그아웃 할까요?',

    // ── 설정: 외관 ──
    'sec.appearance': '외관',
    'theme.label': '화면 모드',
    'theme.sub': '밝게 볼지 어둡게 볼지 정해요.',
    'theme.system': '시스템 설정 따르기',
    'theme.light': '라이트',
    'theme.dark': '다크',
    'lang.label': '언어',
    'lang.sub': '화면 글자의 언어예요. 봇은 내가 쓴 말의 언어로 답해요.',
    'lang.system': '시스템 설정 따르기',
    'lang.ko': '한국어',
    'lang.en': 'English',
    'lang.ja': '日本語',

    // ── 설정: 봇 ──
    'sec.bot': '봇',
    'tz.label': '시간대',
    'tz.sub': '루틴과 이번 주가 보는 달력이에요. 자동으로 잡혀요.',
    'tz.value': '{tz} (한국)',
    'review.label': '자동 검토',
    'review.sub': '봇이 일을 하기 전에 스스로 확인하고, 밖으로 나가는 일은 먼저 물어봐요.',
    'review.count': '내 봇 {n}개에 같이 적용돼요.',
    'review.mixed': '지금은 봇마다 달라요. 하나를 고르면 전부 맞춰져요.',
    'review.more': '자세히',
    'review.less': '접기',
    'review.guest': '로그인하면 고를 수 있어요.',
    'review.noBot': '봇을 먼저 만들면 고를 수 있어요.',
    'review.saveFail': '저장 못 했어요. 잠시 뒤 다시 눌러 주세요.',
    'approval.title': '승인 모드',
    'approval.always_ask': '항상 물어보기',
    'approval.always_ask.sub': '보내기, 게시, 구매, 이체, 삭제는 카드로 묻고 내가 허용해야 나가요.',
    'approval.draft_only': '초안만 만들기',
    'approval.draft_only.sub': '봇은 글만 써 두고, 밖으로는 아무것도 안 보내요.',
    'approval.auto_safe': '되돌릴 수 있는 일은 알아서',
    'approval.auto_safe.sub': '지금은 「항상 물어보기」와 같게 움직여요. 나중에 열려요.',
    'font.label': '글자 크기',
    'font.sub': '대화 글자가 커지고 작아져요.',
    'font.small': '작게',
    'font.normal': '보통',
    'font.large': '크게',
    'connect.line': '카카오, 유튜브 같은 바깥 서비스 연결은 연결 관리 화면에서 해요.',
    'connect.link': '연결 관리',

    // ── 설정: 사용량과 요금제 ──
    'usage.title': '사용량',
    'usage.5h': '5시간 창',
    'usage.week': '이번 주',
    'usage.weekLine': '주간 사용량 {pct}% ({limit}번 중 {used}번)',
    'usage.weekReset': '월요일 0시에 다시 채워져요',
    'usage.guest': '로그인하면 사용량이 보여요.',
    'usage.fail': '사용량을 못 읽었어요. 잠시 뒤 다시 열어 주세요.',
    'usage.loading': '사용량을 읽는 중…',
    'usage.close': '닫기',
    'usage.planView': '요금제 보기',
    'extra.label': '추가 사용 월 한도',
    'extra.q': '한도를 다 쓰면 추가로 얼마까지 쓸까요?',
    'extra.none': '안 씀',
    'extra.fixed': '정해둔 만큼',
    'extra.unlimited': '제한 없음',
    'extra.amount': '한 달 최대 금액 (원)',
    'extra.soon': '준비 중',
    'extra.soonSub': '지금은 선택만 저장돼요. 실제 결제와 연결되면 알려 드릴게요.',
    'plan.label': '요금제',
    'plan.current': '지금 요금제',
    'plan.free': '무료(기본)',
    'plan.manage': '요금제 관리',
    'clover.label': '클로버',
    'clover.balance': '지금 가진 클로버 {n}개',
    'clover.counting': '지금 가진 클로버를 세고 있어요',
    'clover.sub': '내 팀 봇과의 대화는 클로버를 쓰지 않아요. 봇 마켓의 다른 리더 봇과 대화할 때만 써요.',
    'clover.charge': '클로버 충전하기',

    // ── 설정: 앱 ──
    'app.install': '앱으로 설치',
    'app.installSub': '홈 화면에 넣으면 앱처럼 바로 열려요.',
    'app.installed': '이미 앱으로 쓰고 있어요.',
    'app.version': '버전',
    'app.latest': '최신 상태예요',
    'app.latestSub': '새 버전이 나오면 다음에 열 때 자동으로 바뀌어요.',

    // ── 알림 설정 ──
    'noti.push': '푸시',
    'noti.sms': '문자',
    'noti.email': '이메일',
    'noti.guest': '로그인하면 알림을 켤 수 있어요.',
    'noti.fail': '알림 설정을 못 불러왔어요. 잠시 뒤 다시 열어 주세요.',
    'noti.loading': '알림 설정을 불러오는 중…',
    'noti.netFail': '저장 못 했어요. 인터넷을 확인해 주세요.',
    'noti.noKey': '푸시 열쇠가 아직 서버에 없어요(관리자에게 알려 주세요).',
    'noti.push.ios': '아이폰은 사파리 공유 단추 → 「홈 화면에 추가」한 앱에서 켤 수 있어요',
    'noti.push.unsupported': '이 브라우저는 푸시를 지원하지 않아요',
    'noti.push.denied': '브라우저 설정에서 알림이 차단돼 있어요. 풀어 주면 켤 수 있어요',
    'noti.push.on': '이 기기로 알림이 와요',
    'noti.push.off': '루틴 결과, 승인 요청이 오면 바로 알려 드려요',
    'noti.sms.soon': '문자 보내기는 준비 중이라 아직 켤 수 없어요',
    'noti.sms.noPhone': '전화번호가 없어 문자를 켤 수 없어요. 내 계정에서 번호를 넣어 주세요',
    'noti.sms.to': '{phone} 로 보내요',
    'noti.email.none': '이메일이 없어 켤 수 없어요. 내 계정에서 이메일을 넣어 주세요',
    'noti.email.notReady': ' (서버 준비 중이라 지금은 안 가요)',
    'noti.quiet': '조용한 시간',
    'noti.quietFrom': '조용한 시간 시작',
    'noti.quietTo': '조용한 시간 끝',
    'noti.from': '부터',
    'noti.to': '까지',
    /** 시각 칸 앞에 붙이나(prefix) 뒤에 붙이나(suffix). 영어만 앞 */
    'noti.quietOrder': 'suffix',
    'noti.quietSub': '이 시간엔 푸시, 문자를 보내지 않아요. 이메일은 가요. (한국 시간)',

    // ── 손님 첫 화면 (/os/welcome) ──
    'wel.kicker': '큐리AI',
    'wel.h1': '이름 있는 AI 팀원(봇)이\n내 자료로 답하고 초안을 만들어요',
    'wel.p1': '강의 자료, 써 둔 글, 유튜브 원고를 올려 두면 봇이 그 안에서만 답합니다. 팬 질문 답장, 이번 주 글감, 자료 요약 같은 일을 봇 하나가 하나씩 맡아요. 자료에 없는 건 지어내지 않고 「제가 가진 자료에는 없어요」라고 말합니다.',
    'wel.cta': '카카오/구글로 시작',
    'wel.tour': '먼저 둘러보기',
    'wel.h2': '밖으로 나가는 건\n내가 허용한 뒤에만',
    'wel.p2': '정리하고 요약하고 초안 쓰는 일은 봇이 알아서 끝냅니다. 하지만 메시지를 보내거나, 글을 올리거나, 돈이 움직이는 일은 이 카드가 먼저 뜹니다. 허용을 누르기 전에는 한 글자도 밖으로 나가지 않아요.',
    'wel.cardAria': '승인 카드 예시. 팬 3명에게 답장 보내기. 허용, 거절, 고쳐서 허용 단추',
    'wel.cardTitle': '답장봇이 허용을 기다려요',
    'wel.cardSub': '팬 3명에게 답장 보내기',
    'wel.cardPreview': '「질문 주셔서 감사해요. 강의 영상은 마이페이지에서 다시 볼 수 있어요. 안 보이면 저한테 바로 말씀 주세요.」',
    'wel.cardMore': '외 2건',
    'wel.allow': '허용',
    'wel.deny': '거절',
    'wel.editAllow': '고쳐서 허용',
    'wel.note': '카드에 답한 기록은 전부 남아요. 언제 무엇을 허용했는지 나중에 다시 볼 수 있습니다.',
    'wel.h3': '시작은 봇 하나, 일 하나',
    'wel.p3': '처음엔 내가 매일 말하는 한 명만 만들면 됩니다. 칩 세 번만 누르면 끝나요.',
    'wel.step1': '이 봇이 맡을 일 한 가지를 고른다',
    'wel.step2': '어디까지 알아서 할지 정한다. 기본은 「보내기 전 항상 물어봐」',
    'wel.step3': '모양과 색을 고르고 이름을 붙인다',
    'wel.p4': '만들자마자 봇이 첫 인사를 하고, 30초면 확인할 수 있는 첫 일을 추천해 줍니다.',
    'wel.terms': '이용약관',
    'wel.privacy': '개인정보 처리방침',
    'wel.bot.fan_reply': '답장봇',
    'wel.bot.fan_reply.line': '팬 질문에 내 말투로 답해요',
    'wel.bot.content_ideas': '글감봇',
    'wel.bot.content_ideas.line': '글감과 영상 소재를 찾아요',
    'wel.bot.chief': '비서실장',
    'wel.bot.chief.line': '결정이 필요한 것만 가져와요',
} as const

export type TKey = keyof typeof ko

const en: Record<TKey, string> = {
    'settings.title': 'Settings',
    'tab.general': 'General',
    'tab.alerts': 'Notifications',
    'tab.usage': 'Usage & Plan',
    'tab.app': 'App',

    'sec.account': 'Account',
    'account.name': 'Name',
    'account.email': 'Email',
    'account.noName': '(no name yet)',
    'account.loading': 'Loading…',
    'account.guest': 'Sign in to see your name and email.',
    'account.login': 'Sign in',
    'account.manage': 'My account',
    'account.logout': 'Sign out',
    'account.logoutConfirm': 'Sign out now?',

    'sec.appearance': 'Appearance',
    'theme.label': 'Theme',
    'theme.sub': 'Choose a light or dark screen.',
    'theme.system': 'Follow system',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'lang.label': 'Language',
    'lang.sub': 'Language of the screen. Bots reply in the language you write in.',
    'lang.system': 'Follow system',
    'lang.ko': '한국어',
    'lang.en': 'English',
    'lang.ja': '日本語',

    'sec.bot': 'Bot',
    'tz.label': 'Time zone',
    'tz.sub': 'Used by routines and the weekly view. Detected automatically.',
    'tz.value': '{tz} (Korea)',
    'review.label': 'Auto review',
    'review.sub': 'Bots check each task before doing it, and ask you first before anything goes out.',
    'review.count': 'Applies to all {n} of your bots.',
    'review.mixed': 'Your bots are set differently right now. Pick one to line them all up.',
    'review.more': 'Details',
    'review.less': 'Hide',
    'review.guest': 'Sign in to change this.',
    'review.noBot': 'Make a bot first to change this.',
    'review.saveFail': "Couldn't save. Please try again in a moment.",
    'approval.title': 'Approval mode',
    'approval.always_ask': 'Always ask',
    'approval.always_ask.sub': 'Sending, posting, buying, transfers and deletes wait for your approval card.',
    'approval.draft_only': 'Drafts only',
    'approval.draft_only.sub': 'Bots only write drafts and never send anything out.',
    'approval.auto_safe': 'Handle reversible tasks',
    'approval.auto_safe.sub': 'Works the same as "Always ask" for now. Coming later.',
    'font.label': 'Text size',
    'font.sub': 'Makes chat text bigger or smaller.',
    'font.small': 'Small',
    'font.normal': 'Normal',
    'font.large': 'Large',
    'connect.line': 'Connections to outside services like Kakao and YouTube are managed on the Connections screen.',
    'connect.link': 'Manage connections',

    'usage.title': 'Usage',
    'usage.5h': '5-hour window',
    'usage.week': 'This week',
    'usage.weekLine': 'Weekly usage {pct}% ({used} of {limit})',
    'usage.weekReset': 'Refills Monday at 0:00 (Korea time)',
    'usage.guest': 'Sign in to see your usage.',
    'usage.fail': "Couldn't load usage. Please try again soon.",
    'usage.loading': 'Loading usage…',
    'usage.close': 'Close',
    'usage.planView': 'See plans',
    'extra.label': 'Extra usage monthly cap',
    'extra.q': 'When you hit the limit, how much extra may be used?',
    'extra.none': 'None',
    'extra.fixed': 'Up to a set amount',
    'extra.unlimited': 'No limit',
    'extra.amount': 'Monthly maximum (KRW)',
    'extra.soon': 'Coming soon',
    'extra.soonSub': "Only your choice is saved for now. We'll let you know when billing connects.",
    'plan.label': 'Plan',
    'plan.current': 'Current plan',
    'plan.free': 'Free (default)',
    'plan.manage': 'Manage plan',
    'clover.label': 'Clovers',
    'clover.balance': 'You have {n} clovers',
    'clover.counting': 'Counting your clovers…',
    'clover.sub': "Chatting with your own bots is free. Clovers are only used with other leaders' bots in the Bot Market.",
    'clover.charge': 'Get clovers',

    'app.install': 'Install as app',
    'app.installSub': 'Add it to your home screen and open it like an app.',
    'app.installed': "You're already using the app.",
    'app.version': 'Version',
    'app.latest': "You're up to date",
    'app.latestSub': 'New versions apply automatically the next time you open the app.',

    'noti.push': 'Push',
    'noti.sms': 'SMS',
    'noti.email': 'Email',
    'noti.guest': 'Sign in to turn on notifications.',
    'noti.fail': "Couldn't load notification settings. Please try again soon.",
    'noti.loading': 'Loading notification settings…',
    'noti.netFail': "Couldn't save. Please check your internet.",
    'noti.noKey': 'The push key is not on the server yet (please tell the admin).',
    'noti.push.ios': 'On iPhone, open the app you added via Safari Share → "Add to Home Screen" to turn this on',
    'noti.push.unsupported': "This browser doesn't support push",
    'noti.push.denied': 'Notifications are blocked in your browser settings. Unblock them to turn this on',
    'noti.push.on': 'Notifications come to this device',
    'noti.push.off': "We'll tell you right away when a routine finishes or a bot needs approval",
    'noti.sms.soon': "SMS is still being prepared, so it can't be turned on yet",
    'noti.sms.noPhone': 'No phone number, so SMS is off. Add one in My account',
    'noti.sms.to': 'Sent to {phone}',
    'noti.email.none': 'No email, so this is off. Add one in My account',
    'noti.email.notReady': ' (server not ready yet, nothing is sent for now)',
    'noti.quiet': 'Quiet hours',
    'noti.quietFrom': 'Quiet hours start',
    'noti.quietTo': 'Quiet hours end',
    'noti.from': 'from',
    'noti.to': 'to',
    'noti.quietOrder': 'prefix',
    'noti.quietSub': 'No push or SMS during these hours. Email still goes out. (Korea time)',

    'wel.kicker': 'Curi AI',
    'wel.h1': 'AI teammates with names (bots)\nanswer from your own material and draft for you',
    'wel.p1': "Upload your lecture notes, past writing or YouTube scripts, and your bots answer only from that. One bot takes one job: replying to fans, finding this week's ideas, summarizing files. If it's not in your material, they say so instead of making it up.",
    'wel.cta': 'Start with Kakao or Google',
    'wel.tour': 'Take a look first',
    'wel.h2': 'Nothing goes out\nuntil you allow it',
    'wel.p2': 'Sorting, summarizing and drafting get done on their own. But sending a message, posting, or moving money always shows this card first. Not a single word leaves until you press Allow.',
    'wel.cardAria': 'Example approval card. Reply to 3 fans. Allow, Decline, Edit and allow buttons',
    'wel.cardTitle': 'Reply Bot is waiting for your OK',
    'wel.cardSub': 'Reply to 3 fans',
    'wel.cardPreview': '"Thanks for asking! You can rewatch the lecture on My Page. If it\'s not there, just let me know."',
    'wel.cardMore': 'and 2 more',
    'wel.allow': 'Allow',
    'wel.deny': 'Decline',
    'wel.editAllow': 'Edit and allow',
    'wel.note': 'Every answer you give on a card is kept. You can always look back at what you allowed and when.',
    'wel.h3': 'Start with one bot, one job',
    'wel.p3': 'Begin with just the one you would talk to every day. Three taps and it is ready.',
    'wel.step1': 'Pick the one job this bot will do',
    'wel.step2': 'Decide how much it does on its own. Default: "Always ask before sending"',
    'wel.step3': 'Choose a shape and color, then give it a name',
    'wel.p4': 'Your bot says hello right away and suggests a first task you can check in 30 seconds.',
    'wel.terms': 'Terms',
    'wel.privacy': 'Privacy',
    'wel.bot.fan_reply': 'Reply Bot',
    'wel.bot.fan_reply.line': 'Answers fans in your voice',
    'wel.bot.content_ideas': 'Idea Bot',
    'wel.bot.content_ideas.line': 'Finds topics for posts and videos',
    'wel.bot.chief': 'Chief of Staff',
    'wel.bot.chief.line': 'Brings you only what needs a decision',
}

const ja: Record<TKey, string> = {
    'settings.title': '設定',
    'tab.general': '一般',
    'tab.alerts': '通知',
    'tab.usage': '利用量とプラン',
    'tab.app': 'アプリ',

    'sec.account': 'アカウント',
    'account.name': 'お名前',
    'account.email': 'メール',
    'account.noName': '(名前なし)',
    'account.loading': '読み込み中…',
    'account.guest': 'ログインするとお名前とメールが表示されます。',
    'account.login': 'ログイン',
    'account.manage': 'マイアカウント',
    'account.logout': 'ログアウト',
    'account.logoutConfirm': 'ログアウトしますか？',

    'sec.appearance': '外観',
    'theme.label': '画面モード',
    'theme.sub': '明るい画面か暗い画面かを選べます。',
    'theme.system': 'システム設定に従う',
    'theme.light': 'ライト',
    'theme.dark': 'ダーク',
    'lang.label': '言語',
    'lang.sub': '画面の文字の言語です。ボットはあなたが書いた言語で返答します。',
    'lang.system': 'システム設定に従う',
    'lang.ko': '한국어',
    'lang.en': 'English',
    'lang.ja': '日本語',

    'sec.bot': 'ボット',
    'tz.label': 'タイムゾーン',
    'tz.sub': 'ルーティンと今週の予定が使う暦です。自動で設定されます。',
    'tz.value': '{tz}(韓国)',
    'review.label': '自動チェック',
    'review.sub': 'ボットは作業の前に自分で確認し、外部に出る作業は先にお尋ねします。',
    'review.count': 'ボット{n}体すべてに適用されます。',
    'review.mixed': '現在はボットごとに設定が異なります。ひとつ選ぶと全部そろいます。',
    'review.more': '詳しく',
    'review.less': '閉じる',
    'review.guest': 'ログインすると変更できます。',
    'review.noBot': 'まずボットを作ると変更できます。',
    'review.saveFail': '保存できませんでした。しばらくしてからもう一度お試しください。',
    'approval.title': '承認モード',
    'approval.always_ask': 'いつも確認する',
    'approval.always_ask.sub': '送信、投稿、購入、送金、削除はカードで確認し、許可した後に実行します。',
    'approval.draft_only': '下書きのみ',
    'approval.draft_only.sub': 'ボットは下書きだけ作り、外部には何も送りません。',
    'approval.auto_safe': '元に戻せる作業は自動で',
    'approval.auto_safe.sub': '現在は「いつも確認する」と同じ動きです。今後対応します。',
    'font.label': '文字の大きさ',
    'font.sub': '会話の文字が大きくなったり小さくなったりします。',
    'font.small': '小',
    'font.normal': '標準',
    'font.large': '大',
    'connect.line': 'カカオやYouTubeなど外部サービスの接続は、接続管理画面で行います。',
    'connect.link': '接続を管理',

    'usage.title': '利用量',
    'usage.5h': '5時間の枠',
    'usage.week': '今週',
    'usage.weekLine': '週間利用量 {pct}%({limit}回中{used}回)',
    'usage.weekReset': '月曜0時にリセットされます(韓国時間)',
    'usage.guest': 'ログインすると利用量が表示されます。',
    'usage.fail': '利用量を読み込めませんでした。しばらくしてからもう一度お開きください。',
    'usage.loading': '利用量を読み込み中…',
    'usage.close': '閉じる',
    'usage.planView': 'プランを見る',
    'extra.label': '追加利用の月上限',
    'extra.q': '上限に達したら、追加でいくらまで使いますか？',
    'extra.none': '使わない',
    'extra.fixed': '決めた金額まで',
    'extra.unlimited': '制限なし',
    'extra.amount': '月の上限金額(ウォン)',
    'extra.soon': '準備中',
    'extra.soonSub': '今は選択だけ保存されます。実際の課金につながったらお知らせします。',
    'plan.label': 'プラン',
    'plan.current': '現在のプラン',
    'plan.free': '無料(基本)',
    'plan.manage': 'プランを管理',
    'clover.label': 'クローバー',
    'clover.balance': '現在のクローバー {n}個',
    'clover.counting': 'クローバーを数えています…',
    'clover.sub': '自分のチームのボットとの会話にはクローバーを使いません。ボットマーケットの他のリーダーのボットと話すときだけ使います。',
    'clover.charge': 'クローバーをチャージ',

    'app.install': 'アプリとして使う',
    'app.installSub': 'ホーム画面に追加すると、アプリのようにすぐ開けます。',
    'app.installed': 'すでにアプリとして使っています。',
    'app.version': 'バージョン',
    'app.latest': '最新の状態です',
    'app.latestSub': '新しいバージョンは、次に開いたときに自動で反映されます。',

    'noti.push': 'プッシュ',
    'noti.sms': 'SMS',
    'noti.email': 'メール',
    'noti.guest': 'ログインすると通知をオンにできます。',
    'noti.fail': '通知設定を読み込めませんでした。しばらくしてからもう一度お開きください。',
    'noti.loading': '通知設定を読み込み中…',
    'noti.netFail': '保存できませんでした。インターネット接続をご確認ください。',
    'noti.noKey': 'プッシュの鍵がまだサーバーにありません(管理者にお知らせください)。',
    'noti.push.ios': 'iPhoneでは、Safariの共有ボタン →「ホーム画面に追加」したアプリからオンにできます',
    'noti.push.unsupported': 'このブラウザはプッシュ通知に対応していません',
    'noti.push.denied': 'ブラウザの設定で通知がブロックされています。解除するとオンにできます',
    'noti.push.on': 'この端末に通知が届きます',
    'noti.push.off': 'ルーティンの結果や承認のお願いが来たら、すぐにお知らせします',
    'noti.sms.soon': 'SMSは準備中のため、まだオンにできません',
    'noti.sms.noPhone': '電話番号がないためSMSをオンにできません。マイアカウントで番号を登録してください',
    'noti.sms.to': '{phone} に送ります',
    'noti.email.none': 'メールがないためオンにできません。マイアカウントでメールを登録してください',
    'noti.email.notReady': '(サーバー準備中のため、今は送られません)',
    'noti.quiet': '通知を止める時間',
    'noti.quietFrom': '通知を止める時間の開始',
    'noti.quietTo': '通知を止める時間の終了',
    'noti.from': 'から',
    'noti.to': 'まで',
    'noti.quietOrder': 'suffix',
    'noti.quietSub': 'この時間はプッシュとSMSを送りません。メールは送られます。(韓国時間)',

    'wel.kicker': 'キュリAI',
    'wel.h1': '名前のあるAIチームメイト(ボット)が\nあなたの資料から答え、下書きを作ります',
    'wel.p1': '講義資料、書いた文章、YouTubeの台本を入れておくと、ボットはその中からだけ答えます。ファンへの返信、今週のネタ探し、資料の要約など、ボット1体が仕事1つを担当します。資料にないことは作り話をせず「手元の資料にはありません」と伝えます。',
    'wel.cta': 'カカオ/Googleで始める',
    'wel.tour': 'まず見てみる',
    'wel.h2': '外に出るものは\nあなたが許可してから',
    'wel.p2': '整理、要約、下書きはボットが自分で仕上げます。ただし、メッセージを送る、投稿する、お金が動く作業は、まずこのカードが表示されます。許可を押すまで、一文字も外に出ません。',
    'wel.cardAria': '承認カードの例。ファン3人に返信を送る。許可、却下、修正して許可のボタン',
    'wel.cardTitle': '返信ボットが許可を待っています',
    'wel.cardSub': 'ファン3人に返信を送る',
    'wel.cardPreview': '「ご質問ありがとうございます。講義動画はマイページからもう一度ご覧いただけます。見つからなければ、私にすぐお知らせください。」',
    'wel.cardMore': '他2件',
    'wel.allow': '許可',
    'wel.deny': '却下',
    'wel.editAllow': '修正して許可',
    'wel.note': 'カードへの返答はすべて記録に残ります。いつ何を許可したか、後から見直せます。',
    'wel.h3': 'まずはボット1体、仕事1つから',
    'wel.p3': '最初は、毎日話しかける1体だけ作れば十分です。チップを3回押すだけで完成します。',
    'wel.step1': 'このボットが担当する仕事を1つ選ぶ',
    'wel.step2': 'どこまで自分で進めるかを決める。基本は「送る前にいつも確認する」',
    'wel.step3': '形と色を選んで名前を付ける',
    'wel.p4': '作った瞬間にボットが最初のあいさつをし、30秒で確認できる最初の仕事を提案します。',
    'wel.terms': '利用規約',
    'wel.privacy': 'プライバシーポリシー',
    'wel.bot.fan_reply': '返信ボット',
    'wel.bot.fan_reply.line': 'ファンの質問にあなたの口調で答えます',
    'wel.bot.content_ideas': 'ネタボット',
    'wel.bot.content_ideas.line': '記事や動画のネタを探します',
    'wel.bot.chief': '秘書室長',
    'wel.bot.chief.line': '決断が必要なことだけ持ってきます',
}

export const DICT: Record<Locale, Record<TKey, string>> = { ko, en, ja }

/** 사전에서 한 줄 꺼내고 `{이름}` 구멍을 채운다. 없는 키는 키 이름 그대로 보여 준다(빈칸보다 낫다) */
export function t(locale: Locale, key: TKey, vars?: Record<string, string | number>): string {
    const raw = DICT[locale]?.[key] ?? ko[key] ?? key
    if (!vars) return raw
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`))
}

/* ────────────────────────── 언어 고르기 ────────────────────────── */

/** 우리가 아는 값이면 그대로, 아니면 「시스템」 */
export function cleanLocaleChoice(v: unknown): LocaleChoice {
    return (LOCALE_CHOICES as readonly string[]).includes(String(v)) ? (v as LocaleChoice) : 'system'
}

/** 브라우저 언어(navigator.language 꼴 'ja-JP', 'en-US') → 우리 세 언어 중 하나. 모르면 한국어 */
export function localeFromSystem(systemLang: string | null | undefined): Locale {
    const head = (systemLang ?? '').toLowerCase().split(/[-_]/)[0]
    return (LOCALES as readonly string[]).includes(head) ? (head as Locale) : 'ko'
}

/** 선택지 + 시스템 언어 → 실제로 그릴 언어 */
export function resolveLocale(choice: LocaleChoice, systemLang: string | null | undefined): Locale {
    return choice === 'system' ? localeFromSystem(systemLang) : choice
}

/** 저장해 둔 선택 읽기. 저장이 막혀 있어도(사파리 비공개) 죽지 않는다 */
export function readLocaleChoice(store?: Pick<Storage, 'getItem'> | null): LocaleChoice {
    try { return cleanLocaleChoice(store?.getItem(LOCALE_KEY)) } catch { return 'system' }
}

/** 선택 저장. 「시스템」이면 열쇠를 지운다(기본값은 남기지 않는다) */
export function saveLocaleChoice(choice: unknown, store?: Pick<Storage, 'setItem' | 'removeItem'> | null): LocaleChoice {
    const 값 = cleanLocaleChoice(choice)
    try {
        if (값 === 'system') store?.removeItem(LOCALE_KEY)
        else store?.setItem(LOCALE_KEY, 값)
    } catch { /* 저장이 막혀도 이번 화면에는 적용된다 */ }
    return 값
}

/** html lang 에 넣는 값 */
export const HTML_LANG: Record<Locale, string> = { ko: 'ko', en: 'en', ja: 'ja' }

/* ────────────────────── 사용량 글자 (언어별) ────────────────────── */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_NAMES: Record<Locale, string[]> = {
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ja: ['日', '月', '火', '水', '木', '金', '土'],
}

/** 「1시간 35분 후」를 언어별로. 한국어는 usage.ts 의 것을 그대로 쓴다 */
export function untilTextL(locale: Locale, target: Date, now: Date): string {
    if (locale === 'ko') return untilText(target, now)
    const ms = target.getTime() - now.getTime()
    if (ms < 60_000) return locale === 'ja' ? 'まもなく' : 'soon'
    const totalMin = Math.round(ms / 60_000)
    const h = Math.floor(totalMin / 60), m = totalMin % 60
    if (locale === 'ja') {
        if (h === 0) return `${m}分後`
        if (m === 0) return `${h}時間後`
        return `${h}時間${m}分後`
    }
    if (h === 0) return `in ${m} min`
    if (m === 0) return `in ${h} h`
    return `in ${h} h ${m} min`
}

/** 서울 기준 「(월) 0시」를 언어별로 */
export function dayHourTextL(locale: Locale, d: Date): string {
    if (locale === 'ko') return kstDayHourText(d)
    const kst = new Date(d.getTime() + KST_OFFSET_MS)
    const day = DAY_NAMES[locale][kst.getUTCDay()], hour = kst.getUTCHours()
    return locale === 'ja' ? `(${day}) ${hour}時` : `${day} ${hour}:00`
}

/** 사용량 모달 글자. 한국어는 usage.ts 의 usageDetail 그대로, 다른 언어는 같은 숫자로 다시 쓴다. 분모는 항상 같이 */
export function usageDetailL(locale: Locale, v: UsageLike, now: Date): UsageDetail {
    if (locale === 'ko') return usageDetail(v, now)
    const toDate = (d: Date | string | null) => d === null ? null : d instanceof Date ? d : new Date(d)
    const resetAt5h = toDate(v.resetAt5h)
    const weekResetAt = toDate(v.weekResetAt) as Date
    const limit5h = withComma(v.limit5h), used5h = withComma(v.used5h)
    const limitW = withComma(v.limitWeek), usedW = withComma(v.usedWeek)
    let blockedText: string | null = null
    if (v.blocked) {
        const at = v.used5h >= v.limit5h && resetAt5h ? resetAt5h : weekResetAt
        blockedText = locale === 'ja'
            ? `上限に達しました。${untilTextL(locale, at, now)}にまた使えます`
            : `You've reached the limit. You can use it again ${untilTextL(locale, at, now)}`
    }
    if (locale === 'ja') {
        return {
            fiveHourText: `${v.pct5h}% 使いました(${limit5h}回中${used5h}回)`,
            fiveHourReset: resetAt5h ? `${untilTextL(locale, resetAt5h, now)}に回復します` : 'まだ使っていません',
            weekText: `${v.pctWeek}%(${limitW}回中${usedW}回)`,
            weekReset: `${dayHourTextL(locale, weekResetAt)}にリセット`,
            blockedText,
        }
    }
    return {
        fiveHourText: `${v.pct5h}% used (${used5h} of ${limit5h})`,
        fiveHourReset: resetAt5h ? `Refills ${untilTextL(locale, resetAt5h, now)}` : 'Not used yet',
        weekText: `${v.pctWeek}% (${usedW} of ${limitW})`,
        weekReset: `Resets ${dayHourTextL(locale, weekResetAt)} (Korea time)`,
        blockedText,
    }
}
