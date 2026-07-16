import cors from "cors";
import express from "express";
import path from "node:path";
import { publishController as defaultPublishController, type PublishController } from "./automation/publisher";
import { createRoutes } from "./routes";

export interface CreateServerAppOptions {
  apiToken?: string;
  allowedOrigins?: string[];
  staticDir?: string;
  publishController?: PublishController;
}

export function createServerApp(options: CreateServerAppOptions = {}) {
  const app = express();
  const allowedOrigins = options.allowedOrigins ?? ["http://127.0.0.1:5173"];

  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin));
    }
  }));
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  if (options.apiToken) {
    app.use("/api", (req, res, next) => {
      if (req.header("x-fanqie-token") !== options.apiToken) {
        res.status(401).json({ error: "未授权访问本地服务。" });
        return;
      }
      next();
    });
  }

  app.use("/api", createRoutes({
    publishController: options.publishController ?? defaultPublishController
  }));

  if (options.staticDir) {
    const indexFile = path.join(options.staticDir, "index.html");
    app.use(express.static(options.staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(indexFile);
    });
  }

  return app;
}
