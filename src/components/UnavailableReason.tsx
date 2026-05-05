import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./UnavailableReason.css";

interface Props {
  reason?: string | null;
  children: ReactNode;
  className?: string;
}

type TooltipStyle = CSSProperties & {
  "--unavailable-reason-offset-x": string;
};

export default function UnavailableReason({
  reason,
  children,
  className,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const [tooltipStyle, setTooltipStyle] = useState<TooltipStyle>({
    "--unavailable-reason-offset-x": "0px",
  });

  const updateTooltipPosition = useEffectEvent(() => {
    const wrapper = wrapperRef.current;
    const tooltip = tooltipRef.current;

    if (!wrapper || !tooltip) {
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipGap = 8;
    const viewportPadding = 8;
    const titleBarClearance = 52;
    const topSpace = wrapperRect.top - titleBarClearance;
    const shouldPlaceBelow = topSpace < tooltipRect.height + tooltipGap;
    const idealLeft =
      wrapperRect.left + wrapperRect.width / 2 - tooltipRect.width / 2;
    const minLeft = viewportPadding;
    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - tooltipRect.width - viewportPadding,
    );
    const clampedLeft = Math.min(Math.max(idealLeft, minLeft), maxLeft);
    const offsetX = clampedLeft - idealLeft;

    setPlacement(shouldPlaceBelow ? "below" : "above");
    setTooltipStyle({
      "--unavailable-reason-offset-x": `${offsetX}px`,
    });
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    updateTooltipPosition();

    const handleWindowChange = () => {
      updateTooltipPosition();
    };

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open]);

  if (!reason) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      className={`unavailable-reason ${className ?? ""}`.trim()}
      data-open={open ? "true" : "false"}
      data-placement={placement}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      {children}
      <div
        ref={tooltipRef}
        className="unavailable-reason-tooltip"
        style={tooltipStyle}
      >
        {reason}
      </div>
    </div>
  );
}
