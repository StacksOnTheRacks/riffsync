# Index — business_logic

Scopes **domain concepts**, **user stories**, **errors** and recovery UX—not UI chrome.

- Child contracts: **`domain_model.md`**, **`user_stories.md`**, **`error_state.md`**, **`error_handling.md`**.
- Product source: **`vision.json`**, root **`README.md`**.

## Scope

- Record durable constraints and boundaries for this domain.
- Covers **room layout mode** (**Theater** | **Video Chat**), **participant camera/microphone** eligibility and lifecycle, the host **AV kill switch**, and **realtime hardening** jurisdictions (**ChatSession**, **SfuMediaSession**, **TheaterPlayback**), decoupled lifecycles, and drawer-typed failures.
- Covers **public discoverability**: which durable public routes (catalog, episode landing, host-help, legal) are indexable content vs ephemeral/authenticated/receiver-only surfaces that must stay out of search — see **`domain_model.md`** → *Public discoverable surface*.
- Keep this file aligned with mapped child contracts.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
