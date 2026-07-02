import type { ReactNode } from "react";

function SettingsSectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="settings-section-heading">
      <span className="settings-section-title">{title}</span>
      {description ? (
        <span className="settings-section-description">{description}</span>
      ) : null}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card">
      <SettingsSectionHeading title={title} description={description} />
      <div className="settings-card-content">{children}</div>
    </section>
  );
}

export { SettingsSectionHeading, SettingsCard };
