import app from "./app";
import { seedModelProfiles } from "./seed-profiles";
import { sandboxHelpers } from "./lib/command-sandbox";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Log which sandbox helpers were picked up at module load. The OS-level
 * helper line is the important one: when it shows a real helper
 * (`bwrap` / `firejail` / `nsjail`) the Workbench shell runs inside a
 * kernel-enforced filesystem jail. When it shows `null` we are running
 * with the path-validation-only fallback (e.g. on hosts where
 * unprivileged user namespaces are blocked). Surfacing this on boot
 * makes it trivial to confirm in production logs which posture the
 * server is actually serving traffic with.
 */
function logSandboxPosture(): void {
  const os = sandboxHelpers.osIsolation;
  if (os) {
    console.log(
      `[sandbox] OS-level isolation: kind=${os.kind} bin=${os.bin} ` +
        `(setpriv=${sandboxHelpers.setpriv ?? "null"} prlimit=${sandboxHelpers.prlimit ?? "null"})`,
    );
  } else {
    console.warn(
      "[sandbox] OS-level isolation: null (no working bwrap/firejail/nsjail). " +
        "Workbench shell will use path-validation fallback only. " +
        "Install `bubblewrap` and ensure unprivileged user namespaces are enabled " +
        "on the host kernel to promote to a real kernel-enforced jail. " +
        `(setpriv=${sandboxHelpers.setpriv ?? "null"} prlimit=${sandboxHelpers.prlimit ?? "null"})`,
    );
  }
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  logSandboxPosture();
  try {
    await seedModelProfiles();
  } catch (e) {
    console.error("[seed] Failed to seed model profiles:", e);
  }
});
