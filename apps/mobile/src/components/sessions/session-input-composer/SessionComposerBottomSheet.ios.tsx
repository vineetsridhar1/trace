import { getIOSMajorVersion, isIOS26OrLater } from "@/lib/ios-version";
import {
  SessionComposerBottomSheetBase,
  type SessionComposerBottomSheetProps,
} from "./SessionComposerBottomSheetBase";

export type { SessionComposerBottomSheetProps };

let loggedComposerSheetFallback = false;

function logComposerSheetFallback(reason: string) {
  if (loggedComposerSheetFallback) return;
  loggedComposerSheetFallback = true;
  console.info("[SessionComposerBottomSheet] using custom fallback", {
    reason,
    iosMajorVersion: getIOSMajorVersion(),
  });
}

export function SessionComposerBottomSheet(props: SessionComposerBottomSheetProps) {
  const ios26OrLater = isIOS26OrLater();
  logComposerSheetFallback(
    ios26OrLater ? "native composer contents not converted yet" : "not ios 26 or later",
  );
  return <SessionComposerBottomSheetBase {...props} />;
}
