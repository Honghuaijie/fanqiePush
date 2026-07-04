# Flexible Chapter Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the tool import Markdown chapters without requiring one fixed filename format.

**Architecture:** Extend the chapter parser with ordered filename patterns and a fallback auto-number mode. Keep import behavior centralized in `file-system.ts`, expose import warnings through the existing response, and document the supported formats in `README.md`.

**Tech Stack:** TypeScript, Node.js filesystem APIs, React/Vite client types, Vitest tests.

---

### Task 1: Parser Supports Multiple Filename Formats

**Files:**
- Modify: `src/server/chapter-parser.ts`
- Test: `tests/server/chapter-parser.test.ts`

- [ ] Add tests for `第1章 开局.md`, `001-开局.md`, `001_开局.md`, `001. 开局.md`, `001 开局.md`, `001.md`, and fallback parsing.
- [ ] Implement `parseChapterFileName(fileName, fallbackNumber?)` so known formats return chapter number and title.
- [ ] Keep Markdown heading removal behavior unchanged.

### Task 2: Import Uses Auto Number Fallback And Reports Warnings

**Files:**
- Modify: `src/server/file-system.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/server/routes.test.ts`

- [ ] Add import metadata fields for `autoNumberedChapters` and `warnings`.
- [ ] Sort Markdown files naturally before fallback numbering.
- [ ] Use fallback numbering when a Markdown filename has no recognizable chapter number.
- [ ] Preserve skipped non-Markdown files and publish-log merge behavior.

### Task 3: Client Types And Docs Reflect Flexible Formats

**Files:**
- Modify: `src/client/api.ts`
- Modify: `README.md`

- [ ] Add new import metadata fields to the client response type.
- [ ] Replace fixed-format README wording with supported formats and auto-number behavior.

### Task 4: Verification

**Files:**
- No source edits unless verification exposes an issue.

- [ ] Run `node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit`.
- [ ] Run `node node_modules/typescript/bin/tsc --noEmit`.
- [ ] Run tests if Rollup optional dependency is installed; otherwise document the dependency blocker.
