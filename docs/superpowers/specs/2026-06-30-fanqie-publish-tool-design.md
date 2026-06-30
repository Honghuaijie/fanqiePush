# Fanqie Chapter Publishing Tool Design

## Goal

Build a local web tool that imports one novel's Markdown chapter files, generates a scheduled publishing plan, and uses an independent Playwright browser session to submit chapters to Fanqie Author Center with timed publishing.

The first version focuses on one book and one publishing plan at a time. It should make the repetitive publishing workflow reliable, visible, and resumable without trying to become a full desktop product yet.

## User Workflow

1. The user opens the local web tool.
2. The user selects one local novel folder.
3. The tool uses the folder name as the Fanqie book name.
4. The tool scans chapter files in that folder.
5. The user chooses a chapter range, such as chapter 5 through chapter 80.
6. The tool generates a publishing plan.
7. The user can manually adjust dates and times for individual chapters.
8. The tool shows a final publishing preview with the exact date and time for every chapter.
9. The user confirms the plan.
10. The tool starts an independent visible browser window.
11. The user logs in if needed.
12. The tool finds the matching book in Fanqie Author Center.
13. The tool submits each chapter with timed publishing enabled.
14. The tool records each chapter result immediately.
15. If an error occurs, the tool pauses and waits for the user to fix the issue and click continue.

The user can keep using the computer while publishing runs, but should not interact with the browser window controlled by the tool unless the tool pauses and asks for manual handling.

## Chapter Import Rules

The first version supports one Markdown file per chapter.

Supported file naming format:

```text
第001章 章节名.md
```

Parsing rules:

- The chapter number is parsed from the filename.
- The chapter title is parsed from the filename.
- Files are sorted by chapter number.
- The first line of each Markdown file is expected to repeat the title, such as `# 第001章 章节名`.
- When preparing content for Fanqie, the tool removes that first heading line and uses the remaining content as the chapter body.
- The tool counts chapter body characters for display and planning.

Out of scope for the first version:

- Mixed file naming formats.
- One large Markdown file containing many chapters.
- Automatic chapter title repair.
- AI rewriting, proofreading, or formatting changes.

## Publishing Schedule

The user selects a start chapter, end chapter, and start date.

The start date defaults to today, but can be changed in the interface before generating the plan.

Default daily schedule:

- `09:30`: 1 chapter
- `12:00`: 1 chapter
- `19:00`: 1 chapter
- `19:05`: 1 chapter

The user can manage the daily publish time list in the interface. The number of time slots determines how many chapters are scheduled per day.

The tool generates scheduled dates and times in chapter order. The user can manually edit any chapter's date or time before starting publishing.

If a chapter is already recorded as published or scheduled, it is skipped automatically when generating a new plan.

## Interface

The first version is a local web tool, not a public website.

Main interface areas:

### Import

The user selects a novel folder. The tool displays:

- Book name from folder name.
- Total Markdown files found.
- Recognized chapters.
- Whether an existing `.fanqie-publish.json` record was found.

### Range And Start Date

The user enters:

- Start chapter number.
- End chapter number.
- Start date, defaulting to today.

The tool excludes chapters that are already recorded as scheduled or published.

### Publishing Plan

The tool displays a table with:

- Chapter number.
- Chapter title.
- Character count.
- Planned date.
- Planned time.
- Current status.
- Failure reason, if any.

Dates and times can be edited before publishing starts.

Before publishing starts, the tool must show a final confirmation preview. The preview is sorted by date and time and clearly shows the exact day and time when every chapter will be published. Automation can only start after the user confirms this preview.

### Publishing Controls

Controls include:

- Check login.
- Generate plan.
- Start publishing.
- Pause.
- Continue.
- Stop.

## Data Storage

The tool stores publishing data in two places:

1. Internal tool storage for restoring the UI and current task state.
2. A per-book `.fanqie-publish.json` file inside the novel folder.

The per-book record lets the user keep publishing state with the novel files and prevents duplicate submissions after re-importing the same folder.

Chapter record fields:

- Chapter number.
- Chapter title.
- Markdown filename.
- Character count.
- Planned publish date.
- Planned publish time.
- Actual submission time.
- Status.
- Failure reason.

Supported statuses:

- `pending`: ready to publish.
- `scheduled`: submitted to Fanqie timed publishing.
- `failed`: stopped on an error.
- `skipped`: excluded from a generated plan.

## Browser Automation

The first version uses Playwright with an independent browser profile.

Behavior:

- The browser is visible.
- The first run may require the user to log in manually.
- Login state is preserved for later runs when possible.
- The tool does not use the user's active Chrome session by default.
- If the independent browser approach proves unreliable, support for using the user's existing Chrome session can be considered later.

## Single Chapter Publishing Flow

Each chapter is handled as a separate transaction. The result is recorded immediately after the chapter succeeds or fails.

Per-chapter flow:

1. Open Fanqie Author Center.
2. Find the book whose name matches the selected folder name.
3. Enter the chapter publishing page.
4. Fill the chapter title.
5. Fill the chapter body.
6. Wait for the editor/save state to become safe to continue.
7. Click next.
8. Open publishing settings.
9. Select "not using AI" or otherwise keep the non-AI publishing setting.
10. Enable timed publishing.
11. Fill date and time.
12. Click confirm publish.
13. Detect success.
14. Mark the chapter as `scheduled`.
15. Continue to the next chapter.

## Error Handling And Resume

The tool pauses immediately when it sees a risky or unclear state. It does not skip the failed chapter and does not continue to later chapters automatically.

Pause cases:

- Not logged in.
- CAPTCHA or verification required.
- Target book cannot be found.
- Duplicate or ambiguous book result.
- Chapter page cannot be opened.
- Title field, body editor, next button, timed publishing controls, or confirm button cannot be found.
- Fanqie shows word limit, review risk, publishing failure, or similar blocking message.
- Page save or navigation times out.
- Network or browser automation failure.

When paused:

- The current chapter is marked `failed`.
- The failure reason is recorded.
- The user handles the issue in the browser if needed.
- The user clicks continue in the tool.
- The tool retries the current chapter.

Already `scheduled` chapters are never submitted again by default.

## First Version Scope

Included:

- One book at a time.
- One publishing plan at a time.
- Markdown folder import.
- Filename-based chapter parsing.
- Start/end chapter selection.
- Editable generated schedule.
- Independent Playwright browser automation.
- Automatic book lookup by folder name.
- Automatic timed publishing submission.
- Immediate pause on errors.
- Internal state plus `.fanqie-publish.json` record.

Excluded:

- Multiple books publishing at the same time.
- Different schedule rules per book.
- Desktop app packaging.
- Cloud sync.
- Multi-user accounts.
- Automatic CAPTCHA handling.
- Automatic rewriting or proofreading.
- Automatic skipping of failed chapters.
- Long-running scheduler that waits until each publish time. The tool submits chapters to Fanqie's timed publishing system ahead of time.
- Any attempt to bypass Fanqie's normal platform restrictions or risk controls.

## Recommended Implementation Shape

Use a local web application for the first version:

- Frontend: a focused local dashboard for importing, planning, editing, and controlling publishing.
- Backend: local API for filesystem access, plan generation, record storage, and automation control.
- Automation: Playwright with a persistent browser profile.

This keeps the core workflow testable and easy to debug. If the workflow proves stable, the same core can later be wrapped as a desktop application.

## Open Risks

- Fanqie Author Center may change page structure, requiring selector updates.
- Rich text editor behavior may require careful content insertion rather than plain input filling.
- Timed publishing controls may use custom date/time pickers that need browser-level interaction.
- Login, CAPTCHA, and platform risk prompts require manual handling.
- The exact success signal after confirm publish must be verified against the live site.

## Acceptance Criteria

- The user can import a folder containing files named like `第001章 章节名.md`.
- The tool extracts chapter numbers, titles, body content, and character counts.
- The user can select a chapter range and start date.
- The tool generates a four-chapter-per-day plan by default using `09:30`, `12:00`, `19:00`, and `19:05`.
- The user can add, remove, or edit daily publish times, and the number of times controls how many chapters are scheduled per day.
- The user can edit planned dates and times before publishing.
- The tool can open an independent browser and preserve login state.
- The tool can find a Fanqie book by folder name.
- The tool can submit chapters one by one as timed publications.
- Each successful chapter is recorded as `scheduled`.
- The tool skips previously `scheduled` chapters when generating future plans.
- The tool pauses on blocking errors and resumes from the current chapter after user action.
