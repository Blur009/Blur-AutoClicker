# 한국어판 빌드 안내

프로젝트 루트는 `C:\WORK\Blur-AutoClicker-ko`입니다. 모든 의존성과 캐시는 이 폴더 아래에 두는 것을 권장합니다.

## 필요한 환경

- Windows 10 이상
- Node.js 20 이상
- Rust 1.77.2 이상
- Visual Studio Build Tools의 MSVC C++ 도구와 Windows SDK
- WebView2 런타임

이 작업에서는 Rust와 Visual Studio Build Tools를 프로젝트 폴더 아래에 준비해 네이티브 실행 파일까지 생성했습니다. 다만 원본 설정에 업데이트 공개 키만 있고 개인 키는 제공되지 않았으므로, `pnpm run tauri build`의 마지막 업데이트 서명 단계는 오류로 끝날 수 있습니다. 이 경우에도 `src-tauri\target\release\BlurAutoClicker.exe`와 NSIS 설치 파일은 생성됩니다.

## 명령

PowerShell에서 다음처럼 실행합니다.

```powershell
$projectRoot = 'C:\WORK\Blur-AutoClicker-ko'
$env:npm_config_cache = Join-Path $projectRoot '.npm-cache'
pnpm install --store-dir (Join-Path $projectRoot '.pnpm-store')
pnpm test
pnpm lint
pnpm run frontend:build
pnpm run tauri build
```

빌드가 성공하면 원본 실행 파일은 `src-tauri\target\release\BlurAutoClicker.exe`, NSIS 설치 파일은 `src-tauri\target\release\bundle\nsis`에 생성됩니다. 실행 파일만 별도 폴더에 복사하면 설치 없이 실행하는 포터블 형태로 사용할 수 있지만, Windows WebView2 런타임은 별도로 필요합니다.
