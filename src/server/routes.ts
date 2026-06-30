import { type ErrorRequestHandler, Router } from "express";
import { handleGeneratePlan, handleImportBook } from "./route-handlers";

export function createRoutes(): Router {
  const router = Router();

  router.post("/import", async (req, res, next) => {
    try {
      res.json(await handleImportBook(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.post("/plan", async (req, res, next) => {
    try {
      res.json(await handleGeneratePlan(req.body));
    } catch (error) {
      next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "未知错误";
    res.status(400).json({ error: message });
  };

  router.use(errorHandler);

  return router;
}
