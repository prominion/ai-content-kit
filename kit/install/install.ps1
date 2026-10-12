# AI 콘텐츠 키트 설치 · 업데이트 (윈도우 · PowerShell) — 윈도우 실기 검증 전
# 사용:  irm https://raw.githubusercontent.com/prominion/ai-content-kit/main/kit/install/install.ps1 | iex
#        옵션을 주려면:  & ([scriptblock]::Create((irm <같은 주소>))) -Dir <폴더> [-Yes] [-SkipPrefetch]
# 하는 일: ① 준비물(git · Node 22 · FFmpeg · yt-dlp) 확인 · winget 설치  ② 설치 폴더 묻기(기본 ~\AI콘텐츠키트)
#          ③ 키트 받기(git clone) 또는 업데이트(git pull)  ④ HyperFrames · Chrome 미리 받기  ⑤ 다음 할 일 안내
param([string]$Dir = "", [switch]$Yes, [switch]$SkipPrefetch)
$ErrorActionPreference = "Stop"
$Repo = if ($env:KIT_REPO) { $env:KIT_REPO } else { "https://github.com/prominion/ai-content-kit.git" }
$DefaultDir = Join-Path $HOME "AI콘텐츠키트"

function Ok($m)   { Write-Host "✅ $m" }
function Warn($m) { Write-Host "⚠️  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "❌ $m" -ForegroundColor Red; exit 1 }
function Ask($q, $default) { if ($Yes) { return $default }; $a = Read-Host $q; if ([string]::IsNullOrWhiteSpace($a)) { $default } else { $a } }
function Confirm($q, $default = "Y") { $a = Ask "$q [Y/n]" $default; return ($a -match '^[Yy]') }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "`n== AI 콘텐츠 키트 설치 (윈도우 · 검증 전) =="

# ① 준비물
if (-not (Has winget)) { Die "winget이 없습니다. Microsoft Store에서 '앱 설치 관리자'를 설치한 뒤 다시 실행하세요." }
$need = @()
if (-not (Has git)) { $need += "Git.Git" }
$nodeOk = $false
if (Has node) { $major = [int]((((node -v) -replace '^v', '') -split '\.')[0]); $nodeOk = $major -ge 22 }
if (-not $nodeOk) { $need += "OpenJS.NodeJS.LTS" }
if (-not (Has ffmpeg)) { $need += "Gyan.FFmpeg" }
if (-not (Has yt-dlp)) { $need += "yt-dlp.yt-dlp" }
if ($need.Count -gt 0) {
  Write-Host "`n설치할 것: $($need -join ', ')"
  if (-not (Confirm "winget으로 설치할까요?")) { Die "준비물 없이는 진행할 수 없습니다." }
  foreach ($p in $need) { winget install --id $p -e --accept-source-agreements --accept-package-agreements }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Has node) -or -not (Has git)) { Warn "새로 설치한 명령이 아직 안 보입니다. PowerShell 창을 닫고 새로 열어 같은 명령을 다시 실행하세요."; exit 0 }
}
Ok "준비물: git · node $(node -v) · ffmpeg · yt-dlp"
if (-not (Has claude)) { Warn "Claude Code 명령(claude)이 보이지 않습니다. 데스크톱 앱을 쓰면 괜찬습니다. 터미널용: npm install -g @anthropic-ai/claude-code" }

# ② 폴더
if (-not $Dir) {
  Write-Host "`n어디에 설치할까요? 탐색기에서 폴더를 이 창에 끌어다 놓고 Enter."
  Write-Host "   그냥 Enter를 누르면: $DefaultDir"
  Write-Host "   피할 곳: OneDrive · Dropbox가 동기화하는 폴더(문서 · 바탕 화면), USB · 외장 드라이브"
  $Dir = Ask ">" $DefaultDir
}
$Dir = $Dir.Trim().Trim('"').Trim("'").TrimEnd('\')
if ($Dir -match 'OneDrive|Dropbox|iCloud') {
  Warn "동기화 폴더로 보입니다: $Dir  (영상 파일이 올라가거나 비워져 렌더가 깨질 수 있습니다)"
  if (-not (Confirm "그래도 여기에 설치할까요?" "N")) { Die "다른 폴더로 다시 실행하세요." }
}

# ③ 받기 · 업데이트
if ((Test-Path "$Dir\.git") -and (Test-Path "$Dir\kit\scripts\lib.mjs")) {
  Write-Host "`n이미 키트가 있습니다 → 업데이트합니다: $Dir"
  git -C $Dir pull --ff-only; if ($LASTEXITCODE -ne 0) { Die "업데이트 실패. 키트 파일을 직접 고친 게 있으면 되돌린 뒤 다시 실행하세요." }
  Ok "업데이트 끝 (내 자료 brand\ · references\ · works\ 는 그대로)"
} elseif ((Test-Path $Dir) -and (Get-ChildItem -Force $Dir | Where-Object { $_.Name -ne 'desktop.ini' } | Select-Object -First 1)) {
  Die "비어 있지 않은 폴더입니다: $Dir  — 사용자 파일을 덮어쓰지 않습니다. 빈 폴더나 새 폴더를 지정하세요."
} else {
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  Write-Host "`n키트를 받습니다 → $Dir"
  git -c core.autocrlf=false clone --depth 1 $Repo $Dir; if ($LASTEXITCODE -ne 0) { Die "받기 실패. 인터넷 연결과 주소를 확인하세요: $Repo" }
  Ok "받기 끝"
}
git -C $Dir config core.quotepath false
git -C $Dir config core.autocrlf false

# ④ 미리 받아 두기
if (-not $SkipPrefetch) {
  $HF = node -p "require(process.argv[1]).config.hyperframes" "$Dir\package.json"
  Write-Host "`n미리 받아 둡니다: HyperFrames $HF · 캡처 · 렌더용 Chrome (몇 분)"
  Push-Location $Dir
  npx --yes "hyperframes@$HF" --version | Out-Null
  if ($LASTEXITCODE -eq 0) { Ok "HyperFrames $HF" } else { Warn "HyperFrames 미리 받기 실패 — 처음 영상 작업 때 받습니다" }
  npx --yes "hyperframes@$HF" browser ensure | Out-Null
  if ($LASTEXITCODE -eq 0) { Ok "Chrome" } else { Warn "Chrome 미리 받기 실패 — 처음 캡처 · 렌더 때 받습니다" }
  Pop-Location
  Warn "전사(whisper)는 윈도우에서 아직 검증하지 않았습니다. 첫 전사가 안 되면 알려 주세요."
}

# ⑤ 끝
Write-Host "`n설치가 끝났습니다: $Dir"
Write-Host "다음: 이 폴더를 Claude Code로 엽니다 (항상 이 폴더에서 엽니다)."
Write-Host "  PowerShell:   cd `"$Dir`"; claude"
Write-Host "  데스크톱 앱:  폴더 열기 → $Dir"
Write-Host "업데이트: 이 설치 명령을 다시 실행하면 됩니다 (내 자료는 그대로)."
