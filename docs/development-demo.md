# Development demo data

`infra/diagnostics/seed-development-demo.mjs` creates a named, additive fixture through the local API and Supabase Auth admin. It only accepts the development project recorded in `infra/development-target.json`. It never changes existing unrelated users, resets passwords, runs migrations or bypasses API business rules. Confirmed synthetic identities use `@metrivum.test`; no confirmation emails are sent.

Run from the repository root with the local API running:

```powershell
& 'C:\Program Files\nodejs\node.exe' infra/diagnostics/seed-development-demo.mjs --confirm-development
```

The fixture creates five coaches and fifteen clients. It exercises the five subscription plans, simulated payments, offers/application forms, collaborations/groups, training revisions and assignments, historical workout logs/feedback, measurements/maxes, notes, documents, conversations, calendar events and recurring check-ins. Historical workout dates and measurements are synthetic; audit timestamps retain their real creation time. It does not fabricate video analysis results or medical information.

The shared random password and account list are stored only under ignored `.local/demo/`. `state.json` checkpoints successful operations so rerunning normally resumes them; keep it with this dataset. API version checks and rate limits remain enabled. An interrupted request with an unknown outcome requires inspection before rerunning; the checkpoint is not a distributed transaction or a replacement for endpoint idempotency. The script deliberately stops on other errors. `--accounts-only` verifies identities; `--extras-only` runs the documentation/billing/check-in/lead phase after base fixtures. `--profiles-only` finishes profile fields and Team memberships; `--verify-only` performs the final account and ownership checks. `verification.json` records final owner-authorized reads.

All payments are simulated. Run only against the explicitly confirmed development project. Do not deploy this tool or copy these accounts to production.
