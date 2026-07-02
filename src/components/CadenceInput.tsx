import type { Settings } from "../store";
import SimpleCadenceInput from "./panels/SimpleCadenceInput";
import AdvancedCadenceInput from "./panels/advanced/sections/AdvancedCadenceInput";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  variant: "simple" | "advanced";
}

export default function CadenceInput({ variant, ...rest }: Props) {
  if (variant === "simple") {
    return <SimpleCadenceInput {...rest} />;
  }
  return <AdvancedCadenceInput {...rest} />;
}
