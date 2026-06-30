import cors from "cors";
import express from "express";
import { createRoutes } from "./routes";

const app = express();
const port = Number(process.env.PORT ?? 3456);

app.use(cors({ origin: "http://127.0.0.1:5173" }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", createRoutes());

app.listen(port, "127.0.0.1", () => {
  console.log(`Fanqie publish tool API listening on http://127.0.0.1:${port}`);
});
