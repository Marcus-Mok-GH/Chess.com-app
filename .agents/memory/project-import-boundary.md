---
name: Project import boundary
description: Durable guidance for importing an existing Replit repository into a project workspace.
---

When importing an existing repository, preserve platform-owned tooling directories and installed dependencies while replacing the starter source tree with the repository contents. Let artifact discovery register the repository's own artifacts and workflows.

**Why:** The project shell contains platform skills and runtime state that are not part of the user's Git repository; deleting those can break future agent work even when the source import succeeds.

**How to apply:** Keep `.local`, `.cache`, `.conversation`, and `node_modules` during a source import. Replace application files and the Git metadata from the repository, then verify artifact/workflow discovery before making product changes.