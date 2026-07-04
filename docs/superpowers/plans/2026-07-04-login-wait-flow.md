# Login Wait Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first-run Fanqie login a paused user action instead of an error.

**Architecture:** The publish controller detects login pages after opening the Fanqie writer URL. It returns `waiting-login` and keeps the browser session alive. A new continue endpoint retries entering the chapter editor after the user logs in.

**Tech Stack:** TypeScript, Express, React, Vitest.

---

### Task 1: Controller State

**Files:**
- Modify: `src/server/automation/publisher.ts`
- Test: `tests/server/publisher.test.ts`

- [ ] Add `waiting-login` to publish run status.
- [ ] Add tests that start returns `waiting-login` when the browser is on `/login`.
- [ ] Add tests that continue retries opening chapter manager and editor after login.

### Task 2: API And Frontend

**Files:**
- Modify: `src/server/routes.ts`
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/PublishControls.tsx`

- [ ] Add `/api/publish/continue` endpoint.
- [ ] Add `continuePublish` client function.
- [ ] Enable Continue only during `waiting-login`.
- [ ] Avoid scheduling immediately when start returns `waiting-login`.

### Task 3: Verification

**Files:**
- No source edits unless verification exposes issues.

- [ ] Run typecheck, tests, and build.
- [ ] Commit changes only, do not push.
