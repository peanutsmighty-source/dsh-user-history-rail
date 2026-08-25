# Auto Reasoning Router

Independent ARR plugin project. ARR uses a small DSH Agent Loop extension for provider-safe checkpoint replanning: an `off` tool trajectory that becomes difficult is summarized into a new `high` trajectory instead of changing thinking mode inside an incompatible tool chain.

## Development loading

Build with `npm run build`, then add an external Loader entry to a DSH Cordis configuration:

```yaml
- id: auto-reasoning-router
  name: file:///E:/claude-work/auto-reasoning-router/dist/plugin.js
  config:
    enabled: true
    mode: auto
```

## Verification

```powershell
npm test
npm run pilot:fixtures
npm run pilot
```

`pilot` is dry-run by default. `npm run pilot -- --execute` invokes DSH against isolated temporary fixture copies and requires `DEEPSEEK_API_KEY` in the process environment. Partial runs resume from `benchmark-results/<experiment>/runs.partial.json`.

The completed v0.2 Pilot report is in `benchmark-results/arr-v0.2-pilot-001/report.md`.
