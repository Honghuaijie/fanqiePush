import { type ErrorRequestHandler, Router } from "express";
import { z } from "zod";
import { publishController } from "./automation/publisher";
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

  router.get("/publish/state", (_req, res) => {
    res.json(publishController.getState());
  });

  router.get("/publish/inspect", async (_req, res, next) => {
    try {
      res.json(await publishController.inspect());
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/open-chapter-manager", async (_req, res, next) => {
    try {
      res.json(await publishController.openChapterManager());
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/open-new-chapter-editor", async (_req, res, next) => {
    try {
      res.json(await publishController.openNewChapterEditor());
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/save-draft", async (req, res, next) => {
    try {
      const input = z.object({
        chapterNumber: z.number(),
        title: z.string().min(1),
        body: z.string().min(1)
      }).parse(req.body);

      res.json(await publishController.saveDraftChapter(input));
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/save-current-draft", async (_req, res, next) => {
    try {
      res.json(await publishController.saveCurrentDraft());
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/schedule-current", async (_req, res, next) => {
    try {
      res.json(await publishController.scheduleCurrentChapter());
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/continue", async (_req, res, next) => {
    try {
      res.json(await publishController.continueAfterLogin());
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/start", async (req, res, next) => {
    try {
      const input = z.object({
        bookName: z.string().min(1),
        folderPath: z.string().min(1),
        items: z.array(z.object({
          chapterNumber: z.number(),
          title: z.string(),
          fileName: z.string(),
          characterCount: z.number(),
          plannedDate: z.string(),
          plannedTime: z.string(),
          status: z.enum(["pending", "drafted", "scheduled", "failed", "skipped"]),
          failureReason: z.string().optional()
        })).min(1)
      }).parse(req.body);

      res.json(await publishController.start(input));
    } catch (error) {
      next(error);
    }
  });

  router.post("/publish/stop", async (_req, res, next) => {
    try {
      res.json(await publishController.stop());
    } catch (error) {
      next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "未知错误";
    res.status(400).json({ error: message, state: publishController.getState() });
  };

  router.use(errorHandler);

  return router;
}
