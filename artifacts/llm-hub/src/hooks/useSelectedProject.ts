import { useCallback, useEffect, useState } from "react";

export interface SelectedProject {
  origin: "local" | "vps" | "replit";
  path: string;
  name?: string;
  url?: string;
}

const KEY = "workbench-selected-project";

function read(): SelectedProject | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.origin || !parsed.path) return null;
    return parsed as SelectedProject;
  } catch {
    return null;
  }
}

export function useSelectedProject(): {
  project: SelectedProject | null;
  setProject: (p: SelectedProject | null) => void;
} {
  const [project, setProjectState] = useState<SelectedProject | null>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setProjectState(read());
    };
    const onCustom = () => setProjectState(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("workbench-project-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("workbench-project-changed", onCustom);
    };
  }, []);

  const setProject = useCallback((p: SelectedProject | null) => {
    if (p) {
      try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
    } else {
      try { localStorage.removeItem(KEY); } catch {}
    }
    setProjectState(p);
    try { window.dispatchEvent(new CustomEvent("workbench-project-changed")); } catch {}
  }, []);

  return { project, setProject };
}

export function projectDescriptorFromSidebar(p: any): SelectedProject {
  return {
    origin: p.origin || "local",
    path: p.path,
    name: p.name,
    url: p.url,
  };
}
