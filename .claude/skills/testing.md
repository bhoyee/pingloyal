# Testing Rules — PingLoyal

## Requirement
Every prompt that builds a service must include unit tests.
Do not move to the next prompt until tests pass.

## Test File Location
Unit tests:       apps/api/test/unit/[name].spec.ts
Integration tests: apps/api/test/integration/[name].spec.ts
E2E tests:        apps/api/test/e2e/[name].spec.ts

## Coverage Target
Services: 80% line coverage minimum.
Run: npm run test:unit -- --coverage

## Non-Negotiable Test Cases
For every module, always test:
1. Tenant isolation — data from tenant A never visible to tenant B
2. Idempotency — duplicate request returns same result, no double processing
3. wa_opted_in = false — WhatsApp message never sent
4. Missing tenant_id — request rejected with 401 or 403

## Test Naming Convention
describe('[ServiceName]', () => {
  describe('[methodName]', () => {
    it('should [expected behaviour] when [condition]', ...)
  })
})

## Mocking
- Always mock external services (BspService, Paystack, Gupshup)
- Never make real HTTP calls in unit tests
- Use Jest mocks — jest.spyOn() and jest.fn()