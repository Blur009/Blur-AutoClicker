import { error } from "@tauri-apps/plugin-log";
import { open } from "@tauri-apps/plugin-dialog";
import { DEFAULT_ACCENT_COLOR } from "../../../../settingsSchema";
import type { IconColor, IconTheme } from "../../../../settingsSchema";
import type { Settings } from "../../../../store";
import { SettingsCard } from "./shared";

const IMAGE_FILTERS = [
  {
    name: "이미지",
    extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
  },
];

const PAGES = [
  { suffix: "Simple", label: "간단 페이지" },
  { suffix: "Advanced", label: "고급 페이지" },
  { suffix: "Zones", label: "영역 페이지" },
  { suffix: "ClickPoints", label: "클릭 지점 페이지" },
  { suffix: "Settings", label: "설정 페이지" },
] as const;

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

function PageAppearanceControls({
  settings,
  update,
  suffix,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  suffix: string;
}) {
  const bgImageKey = `backgroundImage${suffix}` as keyof Settings;
  const bgOpacityKey = `backgroundOpacity${suffix}` as keyof Settings;
  const winOpacityKey = `windowOpacity${suffix}` as keyof Settings;
  const panelOpacityKey = `panelOpacity${suffix}` as keyof Settings;
  const panelBlurKey = `panelBlur${suffix}` as keyof Settings;

  const bgImage = settings[bgImageKey] as string;
  const bgOpacity = settings[bgOpacityKey] as number;
  const winOpacity = settings[winOpacityKey] as number;
  const panelOpacity = settings[panelOpacityKey] as number;
  const panelBlur = settings[panelBlurKey] as number;

  const handleBrowse = async () => {
    try {
      const selected = await open({ multiple: false, filters: IMAGE_FILTERS });
      if (selected) {
        update({ [bgImageKey]: selected });
      }
    } catch (err) {
      error(
        JSON.stringify({
          source: "SettingsPanel.pickImage",
          error: String(err),
        }),
      );
    }
  };

  return (
    <>
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">배경 이미지</span>
          <span className="settings-sublabel">
            배경 이미지의 경로 또는 URL입니다.
          </span>
        </div>
        <div className="settings-bg-image-row">
          <input
            className="settings-bg-input"
            type="text"
            value={bgImage}
            onChange={(e) => update({ [bgImageKey]: e.target.value })}
            placeholder="https://example.com/image.png"
          />
          <div className="settings-bg-buttons">
            <button className="settings-btn-secondary" onClick={handleBrowse}>
              찾아보기
            </button>
            <button
              className="settings-btn-danger settings-btn-danger--compact"
              onClick={() => update({ [bgImageKey]: "" })}
              disabled={!bgImage}
            >
              제거
            </button>
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">배경 불투명도</span>
          <span className="settings-sublabel">
            앱 창 배경의 투명도입니다.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={winOpacity}
            onChange={(e) =>
              update({ [winOpacityKey]: Number(e.target.value) })
            }
          />
          <span className="settings-slider-value">{winOpacity}%</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">배경 이미지 불투명도</span>
          <span className="settings-sublabel">
            배경 이미지의 투명도입니다.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={bgOpacity}
            disabled={!bgImage}
            onChange={(e) => update({ [bgOpacityKey]: Number(e.target.value) })}
          />
          <span className="settings-slider-value">{bgOpacity}%</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">패널 불투명도</span>
          <span className="settings-sublabel">패널의 투명도입니다.</span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="100"
            value={panelOpacity}
            onChange={(e) =>
              update({ [panelOpacityKey]: Number(e.target.value) })
            }
          />
          <span className="settings-slider-value">{panelOpacity}%</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">패널 흐림 효과</span>
          <span className="settings-sublabel">
            패널 뒤에 흐림 효과를 적용합니다.
          </span>
        </div>
        <div className="settings-opacity-controls">
          <input
            type="range"
            className="settings-opacity-slider"
            min="0"
            max="20"
            value={panelBlur}
            onChange={(e) => update({ [panelBlurKey]: Number(e.target.value) })}
          />
          <span className="settings-slider-value">{panelBlur}px</span>
        </div>
      </div>
    </>
  );
}

export default function AppearanceSection({ settings, update }: Props) {
  const isPerPage = settings.perPageAppearance;

  const handleModeChange = (individual: boolean) => {
    update({ perPageAppearance: individual });
  };

  const themeAccent = (
    <SettingsCard title="테마 및 강조 색상" description="모든 페이지에 적용됩니다.">
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">테마</span>
          <span className="settings-sublabel">
            어두운 모드와 밝은 모드 중 선택합니다.
          </span>
        </div>
        <div className="settings-seg-group">
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              className={`settings-seg-btn ${settings.theme === theme ? "active" : ""}`}
              onClick={() => update({ theme })}
            >
              {theme === "dark" ? "어두운 모드" : "밝은 모드"}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-label-group">
          <span className="settings-label">강조 색상</span>
          <span className="settings-sublabel">기본 강조 색상입니다.</span>
        </div>
        <div className="settings-color-controls">
          <label className="settings-color-picker">
            <input
              type="color"
              value={settings.accentColor}
              onChange={(event) => update({ accentColor: event.target.value })}
            />
          </label>
          <span className="settings-value settings-value--mono">
            {settings.accentColor.toUpperCase()}
          </span>
          <button
            className="settings-btn-secondary"
            onClick={() => update({ accentColor: DEFAULT_ACCENT_COLOR })}
            disabled={settings.accentColor === DEFAULT_ACCENT_COLOR}
          >
            초기화
          </button>
        </div>
      </div>
    </SettingsCard>
  );

  return (
    <>
      {themeAccent}

      <SettingsCard
        title="모양 적용 방식"
        description="모든 페이지에 하나의 스타일을 사용하거나 페이지별로 설정합니다."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">방식</span>
          </div>
          <div className="settings-seg-group">
            <button
              className={`settings-seg-btn ${!isPerPage ? "active" : ""}`}
              onClick={() => handleModeChange(false)}
            >
              전체 적용
            </button>
            <button
              className={`settings-seg-btn ${isPerPage ? "active" : ""}`}
              onClick={() => handleModeChange(true)}
            >
              페이지별
            </button>
          </div>
        </div>
      </SettingsCard>

      {!isPerPage ? (
        <SettingsCard title="페이지 스타일">
          <PageAppearanceControls
            settings={settings}
            update={update}
            suffix=""
          />
        </SettingsCard>
      ) : (
        PAGES.map((page) => (
          <section className="settings-card" key={page.suffix}>
            <span className="settings-page-header">{page.label}</span>
            <div className="settings-card-content">
              <PageAppearanceControls
                settings={settings}
                update={update}
                suffix={page.suffix}
              />
            </div>
          </section>
        ))
      )}

      <SettingsCard
        title="작업 표시줄 아이콘"
        description="작업 표시줄과 트레이 아이콘의 모양을 설정합니다."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">활성 아이콘</span>
            <span className="settings-sublabel">
              클릭기가 활성화되면 다른 아이콘을 표시합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.taskbarIconEnabled ? "on" : "off"}`}
              onClick={() =>
                update({ taskbarIconEnabled: !settings.taskbarIconEnabled })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">아이콘 테마</span>
            <span className="settings-sublabel">
              사용할 테마 아이콘입니다. 자동은 앱 테마를 따릅니다.
            </span>
          </div>
          <div className="settings-seg-group">
            {(["auto", "dark", "light"] as IconTheme[]).map((opt) => (
              <button
                key={opt}
                className={`settings-seg-btn ${settings.taskbarIconTheme === opt ? "active" : ""}`}
                onClick={() => update({ taskbarIconTheme: opt })}
              >
                {opt === "auto" ? "자동" : opt === "dark" ? "어두운 모드" : "밝은 모드"}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`settings-row ${!settings.taskbarIconEnabled ? "settings-row--disabled" : ""}`}
        >
          <div className="settings-label-group">
            <span className="settings-label">아이콘 색상</span>
            <span className="settings-sublabel">
              강조 색상 또는 기본 아이콘 색상을 사용합니다.
            </span>
          </div>
          <div className="settings-seg-group">
            {(["theme", "default"] as IconColor[]).map((opt) => (
              <button
                key={opt}
                className={`settings-seg-btn ${settings.taskbarIconColor === opt ? "active" : ""}`}
                onClick={() =>
                  settings.taskbarIconEnabled &&
                  update({ taskbarIconColor: opt })
                }
              >
                {opt === "theme" ? "테마 색상" : "기본 색상"}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="상태 표시줄"
        description="창 하단에 상태 표시줄을 표시합니다."
      >
        <div className="settings-row">
          <div className="settings-label-group">
            <span className="settings-label">하단 표시줄</span>
            <span className="settings-sublabel">
              활성 프리셋, 버전, 중지 사유를 표시합니다.
            </span>
          </div>
          <div className="settings-toggle-wrapper">
            <button
              className={`settings-toggle ${settings.statusBarEnabled ? "on" : "off"}`}
              onClick={() =>
                update({ statusBarEnabled: !settings.statusBarEnabled })
              }
            >
              <span className="settings-toggle-knob" />
            </button>
          </div>
        </div>
      </SettingsCard>
    </>
  );
}
