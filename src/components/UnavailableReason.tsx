import type { ReactNode } from "react";
import "./UnavailableReason.css";

interface Props {
  reason?: string | null;
  children: ReactNode;
  className?: string;
}

export default function UnavailableReason({
  reason,
  children,
  className,
}: Props) {
  if (!reason) {
    return <>{children}</>;
  }

  return (
    <div className={`unavailable-reason ${className ?? ""}`.trim()}>
      {children}
      <div className="unavailable-reason-tooltip">{reason}</div>
    </div>
  );
}
