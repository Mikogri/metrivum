# Training document deletion

Programs and templates expose an additive `canDelete` list capability. The owning Training service uses the same query for the capability and the DELETE precondition: no applied revisions, assignments (any status), purchased-plan provenance or committed-import provenance. Applied revisions count as retained history, even without current clients. Copies with no recorded source linkage are independent documents; this does not claim to detect historical copying that the system never stored.

`DELETE /api/v1/training/programs/{id}` requires normal management/template permissions, ownership/workspace and If-Match. It runs under the existing workspace transaction lock, rechecks dependencies, and retains restrictive database foreign keys as the final concurrent-reference guard. A new FK dependency produces 409 rather than cascading away history. No cross-module DbContext, cascade deletion, production migration or generic dependency framework is introduced.

Library cards, table row menus and context menus offer **Delete permanently** only for a server-declared eligible document, including archived unused drafts. Confirmation explains irreversibility; completion refreshes the library and shows a toast. Archive/restore remain available and unchanged. EN/PL text is selected through the existing app locale. API capability is advisory; a stale screen cannot bypass the write check.

Scope: programs/templates. Offers, forms, formulas and other modules retain their existing lifecycle policies; they have different usage/history invariants and are not silently made deletable by this change.

Verification: 20 Training PostgreSQL/HTTP integration cases passed against disposable loopback PostgreSQL; a desktop Chromium fixture verified confirmation, If-Match DELETE and removal from the list. Focused ESLint passed. Repository-wide checks also reported pre-existing issues outside Training: an unsafe possibly-undefined element in integrations.test.tsx (typecheck), and an AuthHeader cross-module import in consent.tsx (lint). No production changes were made.
