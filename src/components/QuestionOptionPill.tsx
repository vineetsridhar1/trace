/**
 * Pill-shaped option button for the AskUserQuestion bottom bar.
 * Renders a radio or checkbox indicator alongside a label,
 * with the description available via tooltip.
 */
export function QuestionOptionPill({
  label,
  description,
  selected,
  multiSelect,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  multiSelect: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={description}
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
        selected
          ? 'border-violet-500 bg-violet-500/20 text-violet-200'
          : 'border-[#292e42] bg-[#1a1b26] text-[#a9b1d6] hover:border-[#3b3f5c] hover:bg-[#1f2335]'
      }`}
    >
      {multiSelect ? (
        <span
          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border ${
            selected ? 'border-violet-500 bg-violet-500' : 'border-[#565f89]'
          }`}
        >
          {selected && (
            <svg
              className="h-2.5 w-2.5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
      ) : (
        <span
          className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
            selected ? 'border-violet-500' : 'border-[#565f89]'
          }`}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
        </span>
      )}
      {label}
    </button>
  );
}
