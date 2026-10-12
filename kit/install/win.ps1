# AI Content Kit - Windows bootstrap. ASCII only on purpose: Windows PowerShell 5.1 decodes
# "irm | iex" text as the system code page (CP949 on Korean Windows), which garbles Korean and even
# the param(...) line of install.ps1. This file has no non-ASCII bytes, so it always parses; it then
# downloads install.ps1 as raw bytes, decodes it as UTF-8 and runs it.
# Usage:  irm https://raw.githubusercontent.com/prominion/ai-content-kit/main/kit/install/win.ps1 | iex
#         with options:  & ([scriptblock]::Create((irm <same url>))) -Dir "D:\path" [-Yes] [-SkipPrefetch]
param([string]$Dir = "", [switch]$Yes, [switch]$SkipPrefetch)
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$url = "https://raw.githubusercontent.com/prominion/ai-content-kit/main/kit/install/install.ps1"
if ($env:KIT_INSTALL_URL) { $url = $env:KIT_INSTALL_URL }
$bytes = (Invoke-WebRequest -UseBasicParsing -Uri $url).RawContentStream.ToArray()
$text = [Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF)
$script = [scriptblock]::Create($text)
$params = @{}
if ($Dir) { $params["Dir"] = $Dir }
if ($Yes) { $params["Yes"] = $true }
if ($SkipPrefetch) { $params["SkipPrefetch"] = $true }
& $script @params
