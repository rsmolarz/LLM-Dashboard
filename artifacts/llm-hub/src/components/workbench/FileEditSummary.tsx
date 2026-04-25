import { useMemo } from "react";
import { FilePlus, FileText, Loader2, RotateCcw, RotateCw } from "lucide-react";
import type { FileEdit } from "./FileEditCard";

interface Props {
  edits: FileEdit[];
  onUndoLast: (path: string) => void;
  onRedoLast: (path: string) => void;
  pendingPath?: string | null;
  errorPath?: string | null;
  errorMessage?: string | null;
  redoPendingPath?: string | null;
  redoErrorPath?: string | null;
  redoErrorMessage?: string | null;
}

interface FileGroup {
  path: string;
  total: number;
  active: number;
  isNewLatest: boolean;
  hasUndoableLatest: boolean;
  latestUndoSkipReason?: string;
  hasRedoableTop: boolean;
}

export function FileEditSummary({
  edits,
  onUndoLast,
  onRedoLast,
  pendingPath,
  errorPath,
  errorMessage,
  redoPendingPath,
  redoErrorPath,
  redoErrorMessage,
}: Props) {
  const groups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, FileGroup>();
    const order: string[] = [];
    for (const e of edits) {
      let g = map.get(e.path);
      if (!g) {
        g = { path: e.path, total: 0, active: 0, isNewLatest: e.isNew, hasUndoableLatest: false, hasRedoableTop: false };
        map.set(e.path, g);
        order.push(e.path);
      }
      g.total += 1;
      if (!e.undone) g.active += 1;
      if (e.undone && e.canRedo) g.hasRedoableTop = true;
    }
    // Walk in reverse to find the latest non-undone edit per file and use its
    // metadata to decide whether the per-file undo button should be live.
    for (let i = edits.length - 1; i >= 0; i--) {
      const e = edits[i];
      const g = map.get(e.path);
      if (!g || g.hasUndoableLatest || (g.latestUndoSkipReason && !e.undone)) continue;
      if (e.undone) continue;
      g.isNewLatest = e.isNew;
      if (e.editId && !e.undoDisabled) {
        g.hasUndoableLatest = true;
      } else if (e.undoDisabled) {
        g.latestUndoSkipReason = e.undoSkipReason || "Undo unavailable for the latest edit";
      }
    }
    return order.map(p => map.get(p)!).filter(g => g.total > 0);
  }, [edits]);

  if (groups.length === 0) return null;

  return (
    <div className="rounded-md border border-[#313244] bg-[#11111b] text-xs overflow-hidden">
      <div className="px-2 py-1 bg-[#181825] border-b border-[#313244] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#6c7086] font-mono">
          Files edited ({groups.length})
        </span>
        <span className="text-[9px] text-[#6c7086]">
          {edits.length} edit{edits.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="divide-y divide-[#313244]">
        {groups.map(g => {
          const isPending = pendingPath === g.path;
          const isRedoPending = redoPendingPath === g.path;
          const showError = errorPath === g.path && !!errorMessage;
          const showRedoError = redoErrorPath === g.path && !!redoErrorMessage;
          const fullyUndone = g.active === 0;
          return (
            <li key={g.path} className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                {g.isNewLatest ? (
                  <FilePlus className="h-3 w-3 text-[#a6e3a1] shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-[#89b4fa] shrink-0" />
                )}
                <span
                  className="font-mono text-[#cdd6f4] truncate flex-1"
                  title={g.path}
                >
                  {g.path}
                </span>
                <span className="text-[9px] font-mono text-[#a6adc8] whitespace-nowrap">
                  {g.active}/{g.total} active
                </span>
                {g.hasRedoableTop && (
                  <button
                    onClick={() => onRedoLast(g.path)}
                    disabled={isRedoPending}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] disabled:opacity-50"
                    title={`Re-apply the most recently undone AI edit to ${g.path}`}
                  >
                    {isRedoPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCw className="h-3 w-3" />
                    )}
                    Redo last undo
                  </button>
                )}
                {fullyUndone && !g.hasRedoableTop ? (
                  <span className="text-[10px] text-[#6c7086] italic">All undone</span>
                ) : fullyUndone ? null : g.hasUndoableLatest ? (
                  <button
                    onClick={() => onUndoLast(g.path)}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-[#45475a] hover:bg-[#585b70] text-[#cdd6f4] disabled:opacity-50"
                    title={`Undo the most recent AI edit to ${g.path}`}
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Undo last edit
                  </button>
                ) : (
                  <span
                    className="text-[10px] text-[#a6adc8] italic"
                    title={g.latestUndoSkipReason}
                  >
                    Undo unavailable
                  </span>
                )}
              </div>
              {showError && (
                <div className="mt-1 text-[10px] text-[#f38ba8]">{errorMessage}</div>
              )}
              {showRedoError && (
                <div className="mt-1 text-[10px] text-[#f38ba8]">{redoErrorMessage}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
