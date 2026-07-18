import type { Settings } from "../store";
import SimpleCadenceInput from "./panels/SimpleCadenceInput";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  variant: string;
}

export default function CadenceInput({ settings, update }: Props) {
  return <SimpleCadenceInput settings={settings} update={update} />;
}
