export interface DiffStats {
  added: number;
  removed: number;
}

export interface DiffResult {
  diff: string;
  stats: DiffStats;
  truncated: boolean;
}

const MAX_DIFF_LINES = 4000;

function lcsTable(a: string[], b: string[]): Uint16Array {
  const m = a.length;
  const n = b.length;
  const table = new Uint16Array((m + 1) * (n + 1));
  const idx = (i: number, j: number) => i * (n + 1) + j;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        table[idx(i, j)] = table[idx(i + 1, j + 1)] + 1;
      } else {
        const down = table[idx(i + 1, j)];
        const right = table[idx(i, j + 1)];
        table[idx(i, j)] = down > right ? down : right;
      }
    }
  }
  return table;
}

export function unifiedDiff(prev: string, next: string, filePath: string): DiffResult {
  const prevLines = prev === "" ? [] : prev.split("\n");
  const nextLines = next === "" ? [] : next.split("\n");

  if (prevLines.length > MAX_DIFF_LINES || nextLines.length > MAX_DIFF_LINES) {
    return {
      diff: `--- a/${filePath}\n+++ b/${filePath}\n(file too large for inline diff: ${prevLines.length} → ${nextLines.length} lines)`,
      stats: { added: nextLines.length, removed: prevLines.length },
      truncated: true,
    };
  }

  const m = prevLines.length;
  const n = nextLines.length;
  const table = lcsTable(prevLines, nextLines);
  const idx = (i: number, j: number) => i * (n + 1) + j;

  const out: string[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (prevLines[i] === nextLines[j]) {
      out.push(" " + prevLines[i]);
      i++;
      j++;
    } else if (table[idx(i + 1, j)] >= table[idx(i, j + 1)]) {
      out.push("-" + prevLines[i]);
      removed++;
      i++;
    } else {
      out.push("+" + nextLines[j]);
      added++;
      j++;
    }
  }
  while (i < m) {
    out.push("-" + prevLines[i++]);
    removed++;
  }
  while (j < n) {
    out.push("+" + nextLines[j++]);
    added++;
  }

  const header = `--- a/${filePath}\n+++ b/${filePath}`;
  const body = out.join("\n");
  return { diff: `${header}\n${body}`, stats: { added, removed }, truncated: false };
}
