import { useState } from "react";
import { ChevronDown, ChevronRight, FilePlus, FileText, Loader2, RotateCcw, RotateCw, Check } from "lucide-react";

export interface FileEdit {
  editId?: string;
  path: string;
  diff: string;
  isNew: boolean;
  added: number;
  removed: number;
  previousBytes: number;
  newBytes: number;
  truncated?: boolean;
  undone?: boolean;
  undoing?: boolean;
  undoError?: string | null;
  undoDisabled?: boolean;
  undoSkipReason?: string;
  stackDepth?: number;
  // Redo support — set after a successful undo. canRedo flips back to false
  // either when the redo lands or when a newer AI edit invalidates it.
  canRedo?: boolean;
  redoing?: boolean;
  redoError?: string | null;
  // Used by the parent to figure out which redoable entry is at the top of
  // the per-file redo stack (latest undone wins).
  undoneAt?: number;
}

interface Props {
  edit: FileEdit;
  onUndo: (editId: string) => void;
  onRedo: (editId: string) => void;
  defaultOpen?: boolean;
  isLatestForFile?: boolean;
  isTopOfRedoForFile?: boolean;
}

export function FileEditCard({ edit, onUndo, onRedo, defaultOpen = false, isLatestForFile = true, isTopOfRedoForFile = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = edit.diff.split("\n");

  return (
    <div className="rounded-md border border-[#313244] bg-[#11111b] text-xs my-2 overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 bg-[#181825] border-b border-[#313244]">
        <button
          onClick={() => setOpen(o => !o)}
          className="text-[#a6adc8] hover:text-[#cdd6f4] flex items-center"
          aria-label={open ? "Collapse diff" : "Expand diff"}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {edit.isNew ? (
          <FilePlus className="h-3 w-3 text-[#a6e3a1]" />
        ) : (
          <FileText className="h-3 w-3 text-[#89b4fa]" />
        )}
        <span className="font-mono text-[#cdd6f4] truncate" title={edit.path}>{edit.path}</span>
        {edit.isNew ? (
          <span className="text-[9px] uppercase px-1 rounded bg-[#a6e3a1]/20 text-[#a6e3a1] border border-[#a6e3a1]/30">new</span>
        ) : (
          <span className="font-mono text-[10px] text-[#a6adc8]">
            <span className="text-[#a6e3a1]">+{edit.added}</span>{" "}
            <span className="text-[#f38ba8]">-{edit.removed}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {edit.undone ? (
            <>
              <span className="flex items-center gap-1 text-[10px] text-[#a6adc8]">
                <Check className="h-3 w-3 text-[#a6e3a1]" /> Undone
              </span>
              {edit.canRedo && edit.editId && (
                isTopOfRedoForFile ? (
                  <button
                    onClick={() => edit.editId && onRedo(edit.editId)}
                    disabled={edit.redoing}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] disabled:opacity-50"
                    title="Re-apply the AI's content"
                  >
                    {edit.redoing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCw className="h-3 w-3" />
                    )}
                    Redo
                  </button>
                ) : (
                  <span
                    className="text-[10px] text-[#6c7086] italic"
                    title="A newer undo is on top. Redo the most recent undo first."
                  >
                    Older undo
                  </span>
                )
              )}
            </>
          ) : edit.undoDisabled || !edit.editId ? (
            <span
              className="text-[10px] text-[#a6adc8] italic"
              title={edit.undoSkipReason || "Undo unavailable for this edit"}
            >
              Undo unavailable
            </span>
          ) : !isLatestForFile ? (
            <span
              className="text-[10px] text-[#6c7086] italic"
              title="A newer edit was made to this file. Undo the most recent edit first."
            >
              Older edit
            </span>
          ) : (
            <button
              onClick={() => edit.editId && onUndo(edit.editId)}
              disabled={edit.undoing}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-[#313244] hover:bg-[#45475a] text-[#cdd6f4] disabled:opacity-50"
              title="Restore previous content"
            >
              {edit.undoing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Undo
            </button>
          )}
        </span>
      </div>
      {edit.undoError && (
        <div className="px-2 py-1 text-[10px] text-[#f38ba8] bg-[#f38ba8]/10 border-b border-[#f38ba8]/30">
          {edit.undoError}
        </div>
      )}
      {edit.redoError && (
        <div className="px-2 py-1 text-[10px] text-[#f38ba8] bg-[#f38ba8]/10 border-b border-[#f38ba8]/30">
          {edit.redoError}
        </div>
      )}
      {open && (
        <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
          <pre className="font-mono text-[10px] leading-tight">
            {lines.map((line, i) => {
              let cls = "text-[#a6adc8]";
              let bg = "";
              if (line.startsWith("+++") || line.startsWith("---")) {
                cls = "text-[#6c7086]";
              } else if (line.startsWith("+")) {
                cls = "text-[#a6e3a1]";
                bg = "bg-[#a6e3a1]/10";
              } else if (line.startsWith("-")) {
                cls = "text-[#f38ba8]";
                bg = "bg-[#f38ba8]/10";
              }
              return (
                <div key={i} className={`px-2 ${cls} ${bg} whitespace-pre`}>
                  {line || " "}
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
}
