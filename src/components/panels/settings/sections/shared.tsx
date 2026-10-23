import type { ReactNode } from "react";

function SettingsSectionHeading({
  title,
  description,
  actions,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  if (!title && !description && !actions) return null;
  return (
    <div className="settings-section-heading">
      <div className="settings-section-heading-text">
        {title ? <span className="settings-section-title">{title}</span> : null}
        {description ? (
          <span className="settings-section-description">{description}</span>
        ) : null}
      </div>
      {actions ? (
        <div className="settings-section-actions">{actions}</div>
      ) : null}
    </div>
  );
}

function SettingsCard({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-card">
      <SettingsSectionHeading
        title={title}
        description={description}
        actions={actions}
      />
      <div className="settings-card-content">{children}</div>
    </section>
  );
}

export { SettingsSectionHeading, SettingsCard };
