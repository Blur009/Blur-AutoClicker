<div align="center">
  <p align="center">
    <a href="https://github.com/Blur009/Blur-AutoClicker/releases"><img src="https://img.shields.io/github/downloads/Blur009/Blur-AutoClicker/total?style=for-the-badge&label=downloads" alt="Downloads"></a>
    <img src="https://img.shields.io/github/package-json/v/Blur009/Blur-AutoClicker?style=for-the-badge&label=version" alt="Version">
    <img src="https://img.shields.io/github/license/Blur009/Blur-AutoClicker?style=for-the-badge" alt="License">
    <img src="https://img.shields.io/github/stars/Blur009/Blur-AutoClicker?style=for-the-badge&label=stars" alt="Stars">
    <a href="https://discord.gg/jhWEW747x5"><img src="https://img.shields.io/badge/Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  </p>

  

  # Blur Auto Clicker


  <img src="https://github.com/Blur009/Blur-AutoClicker/blob/main/public/V3.0.0_UI.png" width="600"/>

  <p align="center"><em>An auto clicker that actually clicks at the speed you set.</em></p>

  <p align="center"><a href="README.ko.md">🇰🇷 한국어 번역판 안내</a></p>
  
  <a href="https://ko-fi.com/blur009">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Donate on Ko-fi" width="350">
  </a>

  ---

  <a href="#korean-translation">🇰🇷 한국어 번역판</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="#license">License</a>
  
  

</div>

---
Most auto clickers aren't accurate at high speeds. Set it to 50 CPS and you might get 40. Or 60. This one actually hits the speed you set. It also bundles the useful features from other auto clickers into one place, and adds a few extras. RAM is around 100mb and stays under 200mb (yes its a lot but sadly it cant be reduced due to Webview2).

---

<a id="korean-translation"></a>

## 🇰🇷 한국어 번역판

이 저장소에는 한국어 Windows 사용자가 프로그램을 더 쉽게 사용할 수 있도록 사용자 화면과 안내 문구를 한국어로 번역한 커뮤니티 번역판이 포함되어 있습니다. 단순히 첫 화면만 번역한 것이 아니라 클릭 설정, 설정 메뉴, 프리셋 관리, 보조 창과 오류 안내까지 실제 사용 흐름 전체를 한국어로 사용할 수 있도록 정리했습니다.

### 한국어 번역 범위

- 메인 화면, 간단 모드, 고급 모드의 클릭 설정과 실행 상태
- 설정 화면의 일반, 동작, 화면, 단축키, 유지 관리, 시작, 프로세스 목록, 프리셋 메뉴
- 클릭 지점, 중지 영역, 오버레이, 트레이 메뉴와 긴급 정지 안내
- 클릭 속도, 랜덤 속도, 듀티 사이클, 제한 시간·횟수, 마우스 버튼과 시간 단위
- 오류 메시지, 확인 대화상자, 업데이트 안내, 변경 기록과 상태 표시
- 한국어 환경에서 길어지는 버튼과 설명이 서로 겹치지 않도록 프리셋 카드 레이아웃 수정

### 프리셋도 한국어로 표시됩니다

기본 제공 프리셋은 다음과 같이 표시됩니다.

| 기존 이름 | 한국어 이름 |
| --- | --- |
| `Standard Clicking` | `표준 클릭` |
| `Rapid Fire` | `연속 클릭` |
| `Precision Mode` | `정밀 모드` |

기존 설정 파일에 영어 이름으로 저장되어 있던 기본 프리셋도 실행 시 한국어 이름으로 자동 변환됩니다. 사용자가 직접 만든 프리셋 이름은 임의로 바꾸지 않으며, 프리셋 요약의 마우스 버튼과 시간 단위도 한국어로 표시합니다.

### 한국어 배포판 다운로드

현재 한국어 번역 빌드는 커뮤니티 포크의 공개 릴리스에서 받을 수 있습니다.

- [한국어 번역판 릴리스 페이지](https://github.com/StandardChartered/Blur-AutoClicker/releases/tag/v3.9.1-ko.1)
- [포터블 ZIP 다운로드](https://github.com/StandardChartered/Blur-AutoClicker/releases/download/v3.9.1-ko.1/BlurAutoClicker-ko-portable.zip)
- [Windows 설치판 다운로드](https://github.com/StandardChartered/Blur-AutoClicker/releases/download/v3.9.1-ko.1/BlurAutoClicker-ko-3.9.1_x64-setup.exe)
- [전체 한국어 사용 안내](README.ko.md)

포터블판은 ZIP 압축을 푼 뒤 `BlurAutoClicker.exe`를 실행하면 됩니다. 별도 설치 과정은 필요하지 않지만 프로그램 설정과 통계는 `%APPDATA%\BlurAutoClicker`에 저장됩니다. 실행하려면 Windows WebView2 Runtime이 필요하며, 최신 Windows 10/11에는 대부분 이미 설치되어 있습니다.

### 번역판 사용 시 참고사항

- 한국어 번역판은 원본 Blur-AutoClicker를 기반으로 한 커뮤니티 빌드입니다.
- Windows SmartScreen이 서명되지 않은 개인 빌드로 경고할 수 있습니다. 릴리스 페이지의 SHA-256 체크섬과 파일 이름을 확인한 뒤 실행하세요.
- 자동 업데이트용 개인 서명 키는 배포 파일에 포함하지 않았습니다.
- 번역 변경은 프로그램의 핵심 클릭 기능을 바꾸지 않으며, 원본 프로젝트의 GNU GPL v3.0 라이선스를 따릅니다.

### 번역 문서와 기여

번역에 사용한 범위와 빌드 방법은 다음 문서에서 확인할 수 있습니다.

- [`README.ko.md`](README.ko.md): 한국어 사용자를 위한 전체 안내
- [`BUILDING-KO.md`](BUILDING-KO.md): 한국어 번역판 빌드 방법과 검증 명령
- [`PORTABLE-KO.md`](PORTABLE-KO.md): 포터블판 실행 및 주의사항
- [`CHANGELOG.ko.md`](CHANGELOG.ko.md): 한국어 번역 변경 기록
- [원본 프로젝트](https://github.com/Blur009/Blur-AutoClicker)
- [한국어 번역 Pull Request #270](https://github.com/Blur009/Blur-AutoClicker/pull/270)

한국어 표현이나 빠진 화면을 발견하면 원본 저장소의 Issue 또는 Pull Request로 알려 주세요. 이번 번역 변경은 원본 저장소의 `main` 반영을 목표로 제안되어 있습니다.

---

## Features

**Simple Mode:**
- On/off indicator (logo turns green when running)
- Left, right, or middle mouse button
- Keyboard key pressing with case control
- Hold or toggle activation
- Customizable hotkeys

**Advanced Mode** (everything in Simple, plus):
- Adjustable click timing (duty cycle)
- Random CPS within a range
- Corner and edge stopping (auto-off near screen edges)
- Click and time limits
- Double clicks
- Position clicking (pick a spot, mouse moves and clicks there)
- Per second, minute, hour, or day


## Quick Start

<a href="https://github.com/Blur009/Blur-AutoClicker/releases/latest">
  <img src="https://github.com/machiav3lli/oandbackupx/blob/034b226cea5c1b30eb4f6a6f313e4dadcbb0ece4/badge_github.png" alt="Download from GitHub" height="50">
</a>

Installed to `%localappdata%/BlurAutoClicker/BlurAutoClicker.exe`.  
Config and stats are saved in `%appdata%/BlurAutoClicker`.

> On version 2.1.2 or below? Delete the old executable first — the installer won't do it. Old configs won't work with v3+, they'll be deleted on first launch.

---

## FAQ

<details>
<summary><b>Why is CPS capped at 500?</b></summary>

Windows has a limit of around 500 CPS for mouse events. The timer resolution bottoms out at about 1ms (1000 CPS), but Windows also needs to do other things, so the practical limit is around 800 CPS. Since I can't guarantee that on every machine, it's set to 500. (A 1000 cps setting is available but not recommended.)
</details>

<details>
<summary><b>Windows SmartScreen warning?</b></summary>

The installer isn't signed, so Windows may show a SmartScreen warning. Tauri updater signing is separate from Windows Authenticode signing. See <a href="docs/windows-release-trust.md">docs/windows-release-trust.md</a> for details.
</details>

<details>
<summary><b>Can I build from source?</b></summary>

Yes — see <a href="BUILDING.md">BUILDING.md</a> for setup, build, and validation commands. For contributing guidelines, see <a href="CONTRIBUTING.md">CONTRIBUTING.md</a>.
</details>

---

## License

Licensed under the [GNU General Public License](LICENSE).
