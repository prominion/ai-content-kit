#!/usr/bin/env bash
# AI 콘텐츠 키트 설치 · 업데이트 (맥)
# 사용:  curl -fsSL https://raw.githubusercontent.com/prominion/ai-content-kit/main/kit/install/install.sh | bash
#        … | bash -s -- --dir <폴더> [-y] [--skip-prefetch]     (같은 명령을 다시 실행하면 업데이트)
# 하는 일: ① 준비물(git · Node 22 · FFmpeg · yt-dlp) 확인 · 설치  ② 설치 폴더 묻기(기본 ~/AI콘텐츠키트)
#          ③ 키트 받기(git clone) 또는 업데이트(git pull)  ④ HyperFrames · Chrome 미리 받기  ⑤ 다음 할 일 안내
set -euo pipefail

REPO="${KIT_REPO:-https://github.com/prominion/ai-content-kit.git}"
DEFAULT_DIR="$HOME/AI콘텐츠키트"
DIR=""; YES=0; PREFETCH=1
while [ $# -gt 0 ]; do case "$1" in
  --dir) DIR="${2:-}"; shift 2 ;;
  -y|--yes) YES=1; shift ;;
  --skip-prefetch) PREFETCH=0; shift ;;
  -h|--help) echo "사용: install.sh [--dir <폴더>] [-y] [--skip-prefetch]"; exit 0 ;;
  *) echo "모르는 옵션: $1"; exit 1 ;;
esac; done

say()  { printf '\n%s\n' "$*"; }
ok()   { printf '✅ %s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*"; }
die()  { printf '❌ %s\n' "$*" >&2; exit 1; }
# curl | bash 로 돌면 stdin이 스크립트 본문이라, 질문은 터미널(/dev/tty)에서 읽는다
ask() { local a=""; if [ "$YES" = 1 ]; then printf '%s' "${2:-}"; return; fi; read -r -p "$1" a < /dev/tty || true; printf '%s' "${a:-${2:-}}"; }
confirm() { local a; a=$(ask "$1 [${2:-Y}/$([ "${2:-Y}" = Y ] && echo n || echo y)] " "${2:-Y}"); case "$a" in [Yy]*) return 0 ;; *) return 1 ;; esac; }

[ "$(uname -s)" = "Darwin" ] || die "이 스크립트는 맥용입니다. 윈도우는 install.ps1 을 쓰세요."
say "== AI 콘텐츠 키트 설치 =="

# ① 준비물
if ! command -v brew >/dev/null 2>&1; then
  warn "Homebrew가 없습니다. Node · FFmpeg · yt-dlp 설치에 필요합니다."
  confirm "Homebrew를 지금 설치할까요? (맥 비밀번호를 물을 수 있습니다)" || die "https://brew.sh 를 보고 Homebrew를 설치한 뒤 다시 실행하세요."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" < /dev/tty
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
fi
need=()
command -v git >/dev/null 2>&1 || need+=(git)
if command -v node >/dev/null 2>&1; then
  [ "$(node -v | sed 's/^v//' | cut -d. -f1)" -ge 22 ] || need+=(node)
else need+=(node); fi
command -v ffmpeg >/dev/null 2>&1 || need+=(ffmpeg)
command -v yt-dlp >/dev/null 2>&1 || need+=(yt-dlp)
if [ ${#need[@]} -gt 0 ]; then
  say "설치할 것: ${need[*]}"
  confirm "Homebrew로 설치할까요?" || die "준비물 없이는 진행할 수 없습니다."
  brew install "${need[@]}" || brew upgrade "${need[@]}" || die "설치에 실패했습니다. 위 메시지를 확인하세요."
  hash -r
fi
ok "준비물: git · node $(node -v) · ffmpeg · yt-dlp"
command -v claude >/dev/null 2>&1 || warn "Claude Code 명령(claude)이 보이지 않습니다. 데스크톱 앱을 쓰면 괜찬습니다. 터미널에서 쓰려면: npm install -g @anthropic-ai/claude-code"

# ② 폴더
if [ -z "$DIR" ]; then
  say "어디에 설치할까요? Finder에서 폴더를 이 창에 끌어다 놓고 Enter."
  echo "   그냥 Enter를 누르면: $DEFAULT_DIR"
  echo "   피할 곳: iCloud · OneDrive · Dropbox가 동기화하는 폴더(문서 · 바탕화면), 외장 드라이브"
  DIR=$(ask "> " "$DEFAULT_DIR")
fi
# 끌어다 놓은 경로 정리: 앞뒤 공백 · 따옴표 · 역슬래시 이스케이프 · ~
DIR=$(printf '%s' "$DIR" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e "s/^['\"]//" -e "s/['\"]$//" -e 's/\\\(.\)/\1/g')
case "$DIR" in "~"*) DIR="$HOME${DIR#\~}" ;; esac
case "$DIR" in /*) ;; *) DIR="$PWD/$DIR" ;; esac
DIR="${DIR%/}"
case "$DIR" in
  *"Mobile Documents"*|*iCloud*|*OneDrive*|*Dropbox*|/Volumes/*)
    warn "동기화 폴더나 외장 드라이브로 보입니다: $DIR  (영상 파일이 올라가거나 비워져 렌더가 깨질 수 있습니다)"
    confirm "그래도 여기에 설치할까요?" n || die "다른 폴더로 다시 실행하세요." ;;
esac

# ③ 받기 · 업데이트
if [ -d "$DIR/.git" ] && [ -f "$DIR/kit/scripts/lib.mjs" ]; then
  say "이미 키트가 있습니다 → 업데이트합니다: $DIR"
  git -C "$DIR" pull --ff-only || die "업데이트 실패. 키트 파일을 직접 고친 게 있으면 되돌린 뒤 다시 실행하세요."
  ok "업데이트 끝 (내 자료 brand/ · references/ · works/ 는 그대로)"
elif [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null | grep -v '^\.DS_Store$' || true)" ]; then
  die "비어 있지 않은 폴더입니다: $DIR  — 사용자 파일을 덮어쓰지 않습니다. 빈 폴더나 새 폴더를 지정하세요."
else
  mkdir -p "$DIR"
  say "키트를 받습니다 → $DIR"
  git clone --depth 1 "$REPO" "$DIR" || die "받기 실패. 인터넷 연결과 주소를 확인하세요: $REPO"
  ok "받기 끝"
fi
git -C "$DIR" config core.quotepath false   # 한글 파일 이름이 깨져 보이지 않게

# ④ 미리 받아 두기 (수업 중 몇 분씩 기다리지 않게)
if [ "$PREFETCH" = 1 ]; then
  HF=$(node -p "require(process.argv[1]).config.hyperframes" "$DIR/package.json")
  say "미리 받아 둡니다: HyperFrames $HF · 캡처 · 렌더용 Chrome (몇 분)"
  if (cd "$DIR" && npx --yes "hyperframes@$HF" --version >/dev/null 2>&1); then ok "HyperFrames $HF"; else warn "HyperFrames 미리 받기 실패 — 처음 영상 작업 때 받습니다"; fi
  if (cd "$DIR" && npx --yes "hyperframes@$HF" browser ensure >/dev/null 2>&1); then ok "Chrome"; else warn "Chrome 미리 받기 실패 — 처음 캡처 · 렌더 때 받습니다"; fi
  if confirm "전사용 whisper(약 490MB)도 지금 받을까요? 안 받으면 첫 전사 때 몇 분 걸립니다." n; then
    tmp=$(mktemp -d)
    ffmpeg -v error -f lavfi -i anullsrc=r=16000:cl=mono -t 1 "$tmp/silent.wav"
    if (cd "$DIR" && npx --yes "hyperframes@$HF" transcribe "$tmp/silent.wav" --dir "$tmp" --model small --language ko >/dev/null 2>&1); then ok "whisper 준비 끝"; else warn "whisper 준비를 시도했습니다. 첫 전사 때 더 받을 게 있으면 그때 받습니다"; fi
    rm -rf "$tmp"
  fi
fi

# ⑤ 끝
say "설치가 끝났습니다: $DIR"
echo "다음: 이 폴더를 Claude Code로 엽니다 (항상 이 폴더에서 엽니다)."
echo "  터미널:      cd \"$DIR\" && claude"
echo "  데스크톱 앱:  폴더 열기 → $DIR"
echo "업데이트: 이 설치 명령을 다시 실행하면 됩니다 (내 자료는 그대로)."
if [ "$YES" = 0 ] && command -v claude >/dev/null 2>&1 && confirm "지금 Claude Code를 열까요?"; then cd "$DIR" && exec claude < /dev/tty; fi
