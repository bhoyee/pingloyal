## What does this PR do?
<!-- One sentence description -->

## Prompt / Module
<!-- e.g. Prompt 14: Phone normalisation utility -->

## Checklist
- [ ] Tests pass locally (`npm run test:unit && npm run test:integration`)
- [ ] TypeScript compiles with zero errors (`npm run type-check`)
- [ ] No secrets or API keys committed to code
- [ ] Lint passes (`npm run lint`)
- [ ] All new service methods have `tenant_id` scoping
- [ ] Idempotency key added to any new state-mutating POST endpoint
- [ ] New WhatsApp sends check `wa_opted_in` before sending
- [ ] Feature branch is up to date with develop (`git pull origin develop`)

## Testing notes
<!-- Describe what you tested manually -->

## Screenshots (if frontend change)
<!-- Add screenshots for any UI changes -->
