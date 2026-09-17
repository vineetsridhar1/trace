import { getCodingToolCli } from "@trace/shared";
import { Button } from "../ui/button";

export function CodingToolExecutableDetails({
  status,
  onChooseExecutable,
  onClearExecutable,
}: {
  status: DesktopCodingToolStatus;
  onChooseExecutable: () => void;
  onClearExecutable: () => void;
}) {
  const cli = getCodingToolCli(status.tool);

  return (
    <div className="border-t border-[#3f3f46] bg-[#18181b] px-4 py-3.5 pl-16">
      <dl className="flex flex-wrap gap-x-10 gap-y-2.5">
        <div className="min-w-0 max-w-full">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">
            Executable
          </dt>
          <dd className="mt-0.5 truncate font-mono text-xs text-[#fafafa]">
            {status.executablePath ?? status.executableOverride ?? "Not found"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">
            Source
          </dt>
          <dd className="mt-0.5 font-mono text-xs text-[#fafafa]">
            {status.executableSource === "override"
              ? "Selected manually"
              : status.executableSource === "automatic"
                ? "Automatic detection"
                : status.executableOverride
                  ? "Manual selection unavailable"
                  : "Not resolved"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">
            Powers
          </dt>
          <dd className="mt-0.5 text-xs text-[#fafafa]">{status.label} sessions</dd>
        </div>
      </dl>
      {cli ? (
        <a
          href={cli.installUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs font-semibold text-[#3b82f6] underline-offset-2 hover:underline"
        >
          Installation documentation
        </a>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          variant="link"
          size="xs"
          onClick={onChooseExecutable}
          className="h-auto p-0 text-xs font-semibold text-[#3b82f6] underline-offset-2"
        >
          Choose executable
        </Button>
        {status.executableOverride ? (
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={onClearExecutable}
            className="h-auto p-0 text-xs font-semibold text-[#a1a1aa] underline-offset-2 hover:text-[#fafafa]"
          >
            Use automatic detection
          </Button>
        ) : null}
      </div>
    </div>
  );
}
