# Lifecycle & shutdown

## API Gateway WebSocket **`$disconnect`**

- Must **eventually** remove **connectionId → room** mappings and adjust presence counts if tracked.
- **Best-effort only:** clients may disappear without clean close — rely on **`lastActivityAt`** + pings for room liveness (**`README.md`** room lifecycle).

## Lambda

- **No graceful drain** semantics required beyond finishing in-flight invocation; Dynamo writes should be **idempotent** where retries occur.

## Scheduled jobs

- **Timeout:** batch with **continuation token** / next schedule if catalog too large for one invocation (**implementation detail**).

## Primary code pointers (optional)

- `$disconnect` handler implementation.
