# Code Style — PingLoyal

## TypeScript
- Strict mode always. Never use `any` type.
- Explicit return types on all service methods.
- Use const over let where possible.
- No unused variables or imports (lint will catch this).

## NestJS Patterns
- Controllers: HTTP only. No business logic. No ORM calls.
- Services: Business logic only. No HTTP concepts.
- One module per feature domain.
- Use @CurrentTenant() decorator — never accept tenantId in request body.

## Database
- Every query includes WHERE tenant_id = :tenantId — no exceptions.
- Never write raw SQL strings with concatenation — always parameterised.
- All amounts stored as NUMERIC not FLOAT — no floating point money.
- All IDs are UUIDs — never auto-increment integers.

## Error Handling  
- All service methods throw typed NestJS exceptions (NotFoundException etc.)
- Never throw generic Error() from a service.
- All async functions wrapped in try/catch or have error handled upstream.
- Never swallow errors silently.

## Naming
- Files: kebab-case (wa-onboarding.service.ts)
- Classes: PascalCase (WaOnboardingService)
- Variables/functions: camelCase
- Database columns: snake_case
- Environment variables: SCREAMING_SNAKE_CASE