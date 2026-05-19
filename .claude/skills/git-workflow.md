# Git Workflow — PingLoyal

## Branch Strategy
- main: production only. NEVER commit directly.
- develop: integration branch. All features merge here.
- feature/[name]: one branch per prompt or module.

## Branch Naming
feature/module-1-tenant-settings
feature/module-2-customer-registration
feature/module-3-transactions
feature/prompt-14-phone-normalisation
bugfix/cashier-offline-sync
hotfix/wallet-deduction-race-condition

## For Every Prompt
Before starting any prompt:
1. Make sure you are on develop: git checkout develop
2. Pull latest: git pull origin develop
3. Create feature branch: git checkout -b feature/prompt-[N]-[short-description]

After completing a prompt and checkpoint passes:
1. Stage all changes: git add .
2. Commit with clear message: 
   git commit -m "Prompt [N]: [what was built]"
   Example: git commit -m "Prompt 14: Phone normalisation utility — Nigerian and UK formats"
3. Push branch: git push origin feature/prompt-[N]-[short-description]
4. Open PR on GitHub: base branch = develop
5. PR title format: "Prompt [N]: [short description]"
6. PR must pass all CI checks before merging

## Commit Message Format
Type: Prompt [N]: [description]

Types:
- feat: new feature
- fix: bug fix  
- test: adding tests
- chore: config, setup, dependencies
- docs: documentation

Examples:
feat: Prompt 17: POST /transactions atomic flow with idempotency
fix: Prompt 23: TriggerCheckProcessor cooldown calculation
test: Prompt 45: Wallet service unit tests — 23 scenarios

## PR Rules
- Never merge a PR with failing CI checks
- Both founders review before merging (even a 5-minute read)
- Delete feature branch after merging
- Squash commits when merging to keep develop history clean

## Release to Main
When develop has a stable, tested set of features:
1. PR from develop to main
2. Both founders approve
3. CI must pass
4. Tag the release: git tag v0.x.0
5. Deploy to VPS after merge