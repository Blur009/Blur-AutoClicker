     1|import "./SettingsPanel.css";
     2|import type {
     3|  AppInfo,
     4|  PresetDefinition,
     5|  PresetId,
     6|  Settings,
     7|} from "../../store";
     8|import {
     9|  isLanguage,
    10|  LANGUAGE_OPTIONS,
    11|  useTranslation,
    12|  type Language,
    13|} from "../../i18n";
    14|import { invoke } from "@tauri-apps/api/core";
    15|import { useEffect, useRef, useState, type ReactNode } from "react";
    16|import { openUrl } from "@tauri-apps/plugin-opener";
    17|import ConfirmDialog from "../ConfirmDialog";
    18|import { AdvDropdown } from "./advanced/shared";
    19|import {
    20|  DEFAULT_MAX_CLICK_SPEED,
    21|  DEFAULT_ACCENT_COLOR,
    22|  getMaxClickSpeed,
    23|  MAX_PRESETS,
    24|  PRESET_NAME_MAX_LENGTH,
    25|} from "../../settingsSchema";
    26|
    27|type PendingAction =
    28|  | "reset-settings"
    29|  | "clear-stats"
    30|  | "extended-click-speed-limit"
    31|  | null;
    32|
    33|const LANGUAGE_DROPDOWN_OPTIONS = LANGUAGE_OPTIONS.map((option) => ({
    34|  value: option.code,
    35|  label: option.label,
    36|}));
    37|
    38|interface CumulativeStats {
    39|  totalClicks: number;
    40|  totalTimeSecs: number;
    41|  totalSessions: number;
    42|  avgCpu: number;
    43|}
    44|
    45|interface Props {
    46|  settings: Settings;
    47|  update: (patch: Partial<Settings>) => void;
    48|  running: boolean;
    49|  appInfo: AppInfo;
    50|  onSavePreset: (name: string) => boolean;
    51|  onApplyPreset: (presetId: PresetId) => boolean;
    52|  onUpdatePreset: (presetId: PresetId) => boolean;
    53|  onRenamePreset: (presetId: PresetId, name: string) => boolean;
    54|  onDeletePreset: (presetId: PresetId) => boolean;
    55|  onToggleAlwaysOnTop: () => Promise<void>;
    56|  onReset: () => Promise<void>;
    57|}
    58|
    59|function formatTime(totalSeconds: number, language: Language): string {
    60|  if (totalSeconds < 0.01) return "0s";
    61|  if (totalSeconds < 60) {
    62|    return `${Math.floor(totalSeconds).toLocaleString(language)}s`;
    63|  }
    64|  if (totalSeconds < 3600) {
    65|    const m = Math.floor(totalSeconds / 60);
    66|    const s = Math.floor(totalSeconds % 60);
    67|    return s > 0
    68|      ? `${m.toLocaleString(language)}m ${s.toLocaleString(language)}s`
    69|      : `${m.toLocaleString(language)}m`;
    70|  }
    71|  const h = Math.floor(totalSeconds / 3600);
    72|  const m = Math.floor((totalSeconds % 3600) / 60);
    73|  return m > 0
    74|    ? `${h.toLocaleString(language)}h ${m.toLocaleString(language)}m`
    75|    : `${h.toLocaleString(language)}h`;
    76|}
    77|
    78|function formatNumber(n: number, language: Language): string {
    79|  return Math.floor(n).toLocaleString(language);
    80|}
    81|
    82|function formatCpu(
    83|  cpu: number,
    84|  language: Language,
    85|  notAvailable: string,
    86|): string {
    87|  if (cpu < 0) return notAvailable;
    88|  return `${cpu.toLocaleString(language, {
    89|    minimumFractionDigits: 1,
    90|    maximumFractionDigits: 1,
    91|  })}%`;
    92|}
    93|
    94|function SettingsSectionHeading({
    95|  title,
    96|  description,
    97|}: {
    98|  title: string;
    99|  description?: string;
   100|}) {
   101|  return (
   102|    <div className="settings-section-heading">
   103|      <span className="settings-section-title">{title}</span>
   104|      {description ? (
   105|        <span className="settings-section-description">{description}</span>
   106|      ) : null}
   107|    </div>
   108|  );
   109|}
   110|
   111|function SettingsCard({
   112|  title,
   113|  description,
   114|  children,
   115|}: {
   116|  title: string;
   117|  description?: string;
   118|  children: ReactNode;
   119|}) {
   120|  return (
   121|    <section className="settings-card">
   122|      <SettingsSectionHeading title={title} description={description} />
   123|      <div className="settings-card-content">{children}</div>
   124|    </section>
   125|  );
   126|}
   127|
   128|function PresetRow({
   129|  preset,
   130|  isActive,
   131|  isEditing,
   132|  isConfirmingDelete,
   133|  running,
   134|  renameDraft,
   135|  onRenameDraftChange,
   136|  onStartRename,
   137|  onCancelRename,
   138|  onCommitRename,
   139|  onApply,
   140|  onUpdatePreset,
   141|  onRequestDelete,
   142|  onCancelDelete,
   143|  onConfirmDelete,
   144|}: {
   145|  preset: PresetDefinition;
   146|  isActive: boolean;
   147|  isEditing: boolean;
   148|  isConfirmingDelete: boolean;
   149|  running: boolean;
   150|  renameDraft: string;
   151|  onRenameDraftChange: (value: string) => void;
   152|  onStartRename: () => void;
   153|  onCancelRename: () => void;
   154|  onCommitRename: () => void;
   155|  onApply: () => void;
   156|  onUpdatePreset: () => void;
   157|  onRequestDelete: () => void;
   158|  onCancelDelete: () => void;
   159|  onConfirmDelete: () => void;
   160|}) {
   161|  const { t } = useTranslation();
   162|
   163|  return (
   164|    <div
   165|      className={`preset-card ${isActive ? "preset-card--active" : ""}`}
   166|      data-preset-id={preset.id}
   167|    >
   168|      <div className="preset-card-head">
   169|        <div className="preset-card-meta">
   170|          {isEditing ? (
   171|            <input
   172|              className="preset-rename-input"
   173|              value={renameDraft}
   174|              maxLength={PRESET_NAME_MAX_LENGTH}
   175|              onChange={(event) => onRenameDraftChange(event.target.value)}
   176|              onKeyDown={(event) => {
   177|                if (event.key === "Enter") {
   178|                  event.preventDefault();
   179|                  onCommitRename();
   180|                }
   181|                if (event.key === "Escape") {
   182|                  event.preventDefault();
   183|                  onCancelRename();
   184|                }
   185|              }}
   186|              autoFocus
   187|            />
   188|          ) : (
   189|            <span className="preset-name">{preset.name}</span>
   190|          )}
   191|          <div className="preset-badges">
   192|            {isActive && (
   193|              <span className="preset-badge preset-badge--active">
   194|                {t("settings.presetActive")}
   195|              </span>
   196|            )}
   197|            <span className="preset-badge">
   198|              {new Date(preset.updatedAt).toLocaleDateString()}
   199|            </span>
   200|          </div>
   201|        </div>
   202|        <div className="preset-actions">
   203|          {isEditing ? (
   204|            <>
   205|              <button
   206|                className="settings-btn-secondary"
   207|                onClick={onCommitRename}
   208|                disabled={running}
   209|              >
   210|                {t("settings.presetSave")}
   211|              </button>
   212|              <button className="settings-btn-quiet" onClick={onCancelRename}>
   213|                {t("settings.presetCancel")}
   214|              </button>
   215|            </>
   216|          ) : isConfirmingDelete ? (
   217|            <>
   218|              <button
   219|                className="settings-btn-danger settings-btn-danger--compact"
   220|                onClick={onConfirmDelete}
   221|                disabled={running}
   222|              >
   223|                {t("settings.presetConfirmDelete")}
   224|              </button>
   225|              <button className="settings-btn-quiet" onClick={onCancelDelete}>
   226|                {t("settings.presetCancel")}
   227|              </button>
   228|            </>
   229|          ) : (
   230|            <>
   231|              <button
   232|                className="settings-btn-primary"
   233|                onClick={onApply}
   234|                disabled={running}
   235|              >
   236|                {t("settings.presetApply")}
   237|              </button>
   238|              <button
   239|                className="settings-btn-secondary"
   240|                onClick={onUpdatePreset}
   241|                disabled={running}
   242|              >
   243|                {t("settings.presetUpdate")}
   244|              </button>
   245|              <button
   246|                className="settings-btn-secondary"
   247|                onClick={onStartRename}
   248|                disabled={running}
   249|              >
   250|                {t("settings.presetRename")}
   251|              </button>
   252|              <button
   253|                className="settings-btn-danger settings-btn-danger--compact"
   254|                onClick={onRequestDelete}
   255|                disabled={running}
   256|              >
   257|                {t("settings.presetDelete")}
   258|              </button>
   259|            </>
   260|          )}
   261|        </div>
   262|      </div>
   263|    </div>
   264|  );
   265|}
   266|
   267|export default function SettingsPanel({
   268|  settings,
   269|  update,
   270|  running,
   271|  appInfo,
   272|  onSavePreset,
   273|  onApplyPreset,
   274|  onUpdatePreset,
   275|  onRenamePreset,
   276|  onDeletePreset,
   277|  onToggleAlwaysOnTop,
   278|  onReset,
   279|}: Props) {
   280|  const [resetting, setResetting] = useState(false);
   281|  const [resettingStats, setResettingStats] = useState(false);
   282|  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
   283|  const [stats, setStats] = useState<CumulativeStats | null>(null);
   284|  const [atBottom, setAtBottom] = useState(false);
   285|  const [presetsAtBottom, setPresetsAtBottom] = useState(true);
   286|  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
   287|    null,
   288|  );
   289|  const [newPresetName, setNewPresetName] = useState("");
   290|  const [editingPresetId, setEditingPresetId] = useState<PresetId | null>(null);
   291|  const [renameDraft, setRenameDraft] = useState("");
   292|  const [confirmingDeleteId, setConfirmingDeleteId] = useState<PresetId | null>(
   293|    null,
   294|  );
   295|
   296|  const panelRef = useRef<HTMLDivElement>(null);
   297|  const presetsListRef = useRef<HTMLDivElement>(null);
   298|  const { language, t } = useTranslation();
   299|
   300|  useEffect(() => {
   301|    invoke<CumulativeStats>("get_stats")
   302|      .then(setStats)
   303|      .catch(() => {});
   304|    invoke<boolean>("get_autostart_enabled")
   305|      .then(setAutostartEnabled)
   306|      .catch(() => setAutostartEnabled(false));
   307|  }, []);
   308|
   309|  useEffect(() => {
   310|    if (!confirmingDeleteId) {
   311|      return;
   312|    }
   313|
   314|    const handlePointerDown = (event: PointerEvent) => {
   315|      const target = event.target;
   316|      if (!(target instanceof Element)) {
   317|        return;
   318|      }
   319|
   320|      const presetCard = target.closest("[data-preset-id]");
   321|      if (presetCard?.getAttribute("data-preset-id") === confirmingDeleteId) {
   322|        return;
   323|      }
   324|
   325|      setConfirmingDeleteId(null);
   326|    };
   327|
   328|    document.addEventListener("pointerdown", handlePointerDown);
   329|    return () => {
   330|      document.removeEventListener("pointerdown", handlePointerDown);
   331|    };
   332|  }, [confirmingDeleteId]);
   333|
   334|  const handleScroll = () => {
   335|    const el = panelRef.current;
   336|    if (!el) return;
   337|    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
   338|  };
   339|
   340|  const handlePresetsScroll = () => {
   341|    const el = presetsListRef.current;
   342|    if (!el) return;
   343|    setPresetsAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
   344|  };
   345|
   346|  const handleSavePreset = () => {
   347|    if (onSavePreset(newPresetName)) {
   348|      setNewPresetName("");
   349|      setConfirmingDeleteId(null);
   350|    }
   351|  };
   352|
   353|  const handleStartRename = (preset: PresetDefinition) => {
   354|    setConfirmingDeleteId(null);
   355|    setEditingPresetId(preset.id);
   356|    setRenameDraft(preset.name);
   357|  };
   358|
   359|  const handleCommitRename = () => {
   360|    if (!editingPresetId) {
   361|      return;
   362|    }
   363|
   364|    if (onRenamePreset(editingPresetId, renameDraft)) {
   365|      setEditingPresetId(null);
   366|      setRenameDraft("");
   367|    }
   368|  };
   369|
   370|  const handleCancelRename = () => {
   371|    setEditingPresetId(null);
   372|    setRenameDraft("");
   373|  };
   374|
   375|  const handleRequestDelete = (presetId: PresetId) => {
   376|    setEditingPresetId(null);
   377|    setRenameDraft("");
   378|    setConfirmingDeleteId(presetId);
   379|  };
   380|
   381|  const handleConfirmDelete = (presetId: PresetId) => {
   382|    if (onDeletePreset(presetId)) {
   383|      setConfirmingDeleteId(null);
   384|    }
   385|  };
   386|
   387|  const handleAlwaysOnTopChange = (nextValue: boolean) => {
   388|    if (settings.alwaysOnTop === nextValue) {
   389|      return;
   390|    }
   391|
   392|    void onToggleAlwaysOnTop();
   393|  };
   394|
   395|  const hasStats = stats !== null && stats.totalSessions > 0;
   396|  const presetLimitReached = settings.presets.length >= MAX_PRESETS;
   397|  const activeEditingPresetId = running ? null : editingPresetId;
   398|  const activeConfirmingDeleteId = running ? null : confirmingDeleteId;
   399|  const onOffOptions = [
   400|    { value: true, label: t("common.on") },
   401|    { value: false, label: t("common.off") },
   402|  ];
   403|  const advancedLayoutOptions = [
   404|    { value: "wide" as const, label: t("settings.advancedLayoutWide") },
   405|    { value: "tall" as const, label: t("settings.advancedLayoutTall") },
   406|  ];
   407|  const maxClickSpeed = getMaxClickSpeed(settings.extendedClickSpeedLimit);
   408|
   409|  const handleConfirmResetSettings = async () => {
   410|    setResetting(true);
   411|    try {
   412|      await onReset();
   413|      setAutostartEnabled(false);
   414|    } finally {
   415|      setResetting(false);
   416|      setPendingAction(null);
   417|    }
   418|  };
   419|
   420|  const handleConfirmClearStats = async () => {
   421|    setResettingStats(true);
   422|    try {
   423|      const next = await invoke<CumulativeStats>("reset_stats");
   424|      setStats(next);
   425|    } catch {
   426|      // swallow ? failure leaves stats unchanged
   427|    } finally {
   428|      setResettingStats(false);
   429|      setPendingAction(null);
   430|    }
   431|  };
   432|
   433|  const handleExtendedClickSpeedLimitChange = (nextValue: boolean) => {
   434|    if (settings.extendedClickSpeedLimit === nextValue) {
   435|      return;
   436|    }
   437|
   438|    if (nextValue) {
   439|      setPendingAction("extended-click-speed-limit");
   440|      return;
   441|    }
   442|
   443|    update({
   444|      extendedClickSpeedLimit: false,
   445|      clickSpeed: Math.min(settings.clickSpeed, DEFAULT_MAX_CLICK_SPEED),
   446|    });
   447|  };
   448|
   449|  const handleConfirmExtendedClickSpeedLimit = () => {
   450|    update({ extendedClickSpeedLimit: true });
   451|    setPendingAction(null);
   452|  };
   453|
   454|  useEffect(() => {
   455|    handlePresetsScroll();
   456|  }, [settings.presets.length]);
   457|
   458|  return (
   459|    <div className="settings-wrapper">
   460|      <div className="settings-panel" ref={panelRef} onScroll={handleScroll}>
   461|        <SettingsCard
   462|          title={t("settings.sectionAbout")}
   463|          description={t("settings.sectionAboutDescription")}
   464|        >
   465|          <div className="social-links">
   466|            <span className="settings-label">{t("settings.supportMe")}</span>
   467|            <div className="social-icons">
   468|              <a
   469|                className="social-icon social-icon--kofi"
   470|                href="#"
   471|                title="Ko-fi"
   472|                onClick={(e) => {
   473|                  e.preventDefault();
   474|                  void openUrl("https://ko-fi.com/Z8Z71T8QD4");
   475|                }}
   476|              >
   477|                <img
   478|                  height="28"
   479|                  style={{ border: 0, height: "28px" }}
   480|                  src="https://storage.ko-fi.com/cdn/kofi3.png?v=6"
   481|                  alt="Buy Me a Coffee at ko-fi.com"
   482|                />
   483|              </a>
   484|
   485|              <a
   486|                className="social-icon social-icon--youtube"
   487|                href="#"
   488|                title="YouTube"
   489|                onClick={(e) => {
   490|                  e.preventDefault();
   491|                  void openUrl("");
   492|                }}
   493|              >
   494|                <svg
   495|                  viewBox="0 0 24 24"
   496|                  fill="currentColor"
   497|                  width="18"
   498|                  height="18"
   499|                >
   500|                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
   501|