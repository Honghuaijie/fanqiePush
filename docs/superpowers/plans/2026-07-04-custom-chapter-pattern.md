# Custom Chapter Pattern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to provide a chapter filename pattern before import, using `{章节}` and `{章节名}` placeholders.

**Architecture:** Add an optional `chapterFileNamePattern` field to the import API. The server compiles the placeholder pattern into a regex and uses it strictly when provided; otherwise it keeps the existing smart detection and auto-number fallback.

**Tech Stack:** TypeScript, React, Express, Zod, Vitest.

---

### Task 1: Parser

**Files:**
- Modify: `src/server/chapter-parser.ts`
- Test: `tests/server/chapter-parser.test.ts`

- [ ] Add tests for `第{章节}章_{章节名}.md` matching `第001章_这算我弄坏的吗.md`.
- [ ] Add tests that a mismatched custom pattern returns `null`.
- [ ] Implement `parseChapterFileNameWithPattern`.

### Task 2: Import API

**Files:**
- Modify: `src/server/file-system.ts`
- Modify: `src/server/route-handlers.ts`
- Modify: `src/client/api.ts`
- Test: `tests/server/routes.test.ts`

- [ ] Accept optional `chapterFileNamePattern`.
- [ ] Use strict custom parsing when provided.
- [ ] Keep smart parsing when omitted.

### Task 3: UI And Docs

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/ImportPanel.tsx`
- Modify: `src/client/styles.css`
- Modify: `README.md`

- [ ] Add a pattern input in the import panel.
- [ ] Pass the value into the import API.
- [ ] Document placeholders and examples.

### Task 4: Verification And Git

**Files:**
- No source edits unless verification exposes issues.

- [ ] Run typecheck, tests, and build.
- [ ] Commit source changes.
- [ ] Push `master`.
