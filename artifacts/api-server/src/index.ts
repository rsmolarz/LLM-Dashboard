import app from "./app";
import { seedModelProfiles } from "./seed-profiles";

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

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  try {
    await seedModelProfiles();
  } catch (e) {
    console.error("[seed] Failed to seed model profiles:", e);
  }
});
