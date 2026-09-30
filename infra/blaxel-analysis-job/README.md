# Beeblio analysis batch job

This is the disposable Blaxel Batch worker used by the agent's `bash` tool
when `BLAXEL_BATCH_ENABLED=true`.

Deploy from the repository root:

```bash
pnpm deploy:analysis-job
```

The deploy script reads the existing GCS settings from `.env.local`, passes
them to Blaxel as job secrets through a mode-0600 temporary file, and removes
that file when the CLI exits. It requires the `bl` CLI to be installed and
logged into the intended workspace.

After deployment, set these values on both the Eve service and local test
environment:

```dotenv
BLAXEL_BATCH_ENABLED=true
BLAXEL_BATCH_JOB=beeblio-analysis
```

Each task downloads the authenticated project's GCS prefix into fresh local
storage, executes the command without network access or inherited secrets,
and uploads changed files only from `2-Data/derived`, `3-Analysis`, and
`4-Reports`. The app logs queue, download, execution, upload, and total timing
under `[blaxel-batch] completed` for cold-start comparison.

Set `BLAXEL_BATCH_ENABLED=false` for an immediate rollback to the existing
per-user sandbox.
