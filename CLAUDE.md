# CLAUDE.md

Claude-specific entry point for this repository. Read this first, then follow the imports below.

@AGENTS.md
@knowledge.md

## Skills

Two project skills live under `.agents/skills/`:

- `enersight-frontend-page` — use when planning, implementing, or reviewing a change to an `enersight-frontend/src/pages` or `src/components` file.
- `enersight-backend-route` — use when planning, implementing, or reviewing a change to an `enersight-backend/app/routes` file or its models/schemas.

Invoke the matching skill before editing in that area; it encodes this project's layer boundaries and required checks beyond what AGENTS.md states in general terms.

## Session notes

- This project has no automated test suite. "Verify" always means: run the check commands in AGENTS.md, then manually exercise the change in the browser/API — say so explicitly rather than claiming untested code works.
- Keep each task to one bounded, recoverable change on its own branch, per the current capstone scope rule.
