import type { ComponentType, Ref } from "react";
import type { IconHandle } from "@animateicons/react";

export interface AnimatedIconProps {
  size?: number;
  isAnimated?: boolean;
  className?: string;
  ref?: Ref<IconHandle>;
  "aria-hidden"?: boolean | "true" | "false";
}

export type AnimatedIcon = ComponentType<AnimatedIconProps>;
