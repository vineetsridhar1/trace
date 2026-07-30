import SettingsRepositories from "./SettingsRepositories";
import { AutomationDialog } from "../components/settings/automation";

export default function SettingsAutomationEnvVar() {
  return <AutomationDialog active="setup" addingEnv background={<SettingsRepositories />} />;
}
