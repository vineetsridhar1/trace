import { useChannelContext } from "../context/ChannelContext";

export function CreationStatusBar() {
  const { enrichedActiveChannel } = useChannelContext();
  const setupScript = enrichedActiveChannel?.setupScript;

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <div className="flex items-center gap-2 px-1">
        <svg
          className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-orange-400"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
          />
        </svg>
        <span className="text-xs text-orange-400">Running startup scripts...</span>
      </div>
      {setupScript && (
        <div className="mt-2 px-1">
          {setupScript.split("\n").filter(Boolean).map((cmd, i) => (
            <div key={i} className="font-mono text-[11px] text-[#565f89]">
              $ {cmd}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
