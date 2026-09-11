# Agency Testing Skills

These prompts are adapted from [agency-agents](https://github.com/msitarzewski/agency-agents/tree/main/testing) for deployment testing of this app.

## Installed roles

- **Test Automation Engineer** — deterministic browser journeys, resilient selectors, API-first setup, and failure artifacts.
- **Evidence Collector** — screenshots, traces, console/network evidence, and reproducible defect records.
- **Test Results Analyzer** — separates product failures from environment noise and identifies patterns across runs.
- **Reality Checker** — validates that deployment claims match observable behavior instead of treating a green build as proof.

## Target deployment

- Production: https://chess-com-app.vercel.app
- Deployment platform: Vercel
- Repository test command: `pnpm test`
- Build command: `pnpm run build`

Use the automation prompt first, collect artifacts for every failure, then apply the analyzer and reality-check prompts before calling the deployment healthy. Do not use hard sleeps; wait on observable UI, URL, or network conditions.
