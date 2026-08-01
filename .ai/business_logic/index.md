# Index — business_logic

Scopes **domain concepts**, **user stories**, **errors** and recovery UX—not UI chrome.

- Child contracts: **`domain_model.md`**, **`user_stories.md`**, **`error_state.md`**, **`error_handling.md`**.
- Product source: **`vision.json`**, root **`README.md`**.

## Scope

- Record durable constraints and boundaries for this domain.
- Covers **room layout mode** (**Theater** | **Video Chat**), **participant camera/microphone** eligibility and lifecycle, the host **AV kill switch**, and **realtime hardening** jurisdictions (**ChatSession**, **SfuMediaSession**, **TheaterPlayback**), decoupled lifecycles, and drawer-typed failures.
- Covers **public discoverability**: which durable public routes (catalog hub and subcategory browse, episode landing, official **`/live/:slug`**, host-help, legal) are indexable content vs ephemeral/authenticated/receiver-only surfaces that must stay out of search — see **`domain_model.md`** → *Public discoverable surface*.
- Covers **catalog browse IA**: hub mixed browse vs subcategory filtered views (MST3K, Community, Riff Material, Movie Night) without new auth or domain entities — see **`domain_model.md`** and **US-P0-01** in **`user_stories.md`**. Staff-only **`other`** and official Live source category **`live`** stay off public catalog surfaces.
- Covers **official Live channels**: hostless **`/live/:slug`** surfaces published from **`catalog: live`** episodes, member-chat / anonymous-view gates, and Lobby discovery — see **`domain_model.md`**, **US-P0-14*** / **US-P1-04a** in **`user_stories.md`**, and **`.ai/specs/official-live-channels.spec.md`**.
- Covers **friends and 1:1 direct messaging**: invite/accept **FriendshipRequest** → **Friendship**, room-derived friends online, friends-only **DmThread** / **DirectMessage** eligibility, account-lifetime DM retention class (distinct from **RoomChat**), mutual remove-friend with closed/hidden thread for both, and unread-clears-on-view — see **`domain_model.md`**, **US-P0-13*** in **`user_stories.md`**, and friends/DM rows in **`error_state.md`** / **`error_handling.md`**.
- Keep this file aligned with mapped child contracts.

## Primary code pointers (optional)

- Add stable code directories or modules here when known.
- Keep entries concise and remove stale pointers.
