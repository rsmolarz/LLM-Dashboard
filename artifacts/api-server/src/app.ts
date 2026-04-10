import express, { type Express } from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { auditLog } from "./middlewares/auditLog";
import router from "./routes";

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(authMiddleware);
app.use(auditLog);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const currentDir = typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
  const staticDir = path.resolve(currentDir, "../../llm-hub/dist/public");
  app.use(express.static(staticDir));
  app.get("{*path}", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  const VITE_PORT = process.env.VITE_DEV_PORT || "18237";
  const { createProxyMiddleware } = await import("http-proxy-middleware");
  app.use(
    "/",
    createProxyMiddleware({
      target: `http://localhost:${VITE_PORT}`,
      changeOrigin: true,
      ws: true,
      logLevel: "silent",
    })
  );
}

export default app;
