# Live availability

**Status: OPTION 2 IS BUILT (2026-08-28, section-s). Option 1 is not started.**

Feras chose option 2 — manual status with an expiry — with option 1 (Discord
presence) held until it is actually wanted.

## What shipped

`profile.availability` holds `{"until": timestamptz}` and nothing else. The
client picks a DURATION in Home Page — 1 hour, 4 hours, rest of today — and a
green "Available now" badge shows on their card until the clock passes.

Two decisions inside it worth keeping:

* **It is not in the published snapshot.** The public site reads
  `tenants.published_snapshot`, and serialising availability into it would
  freeze the badge at whatever it said when the client last pressed Publish —
  the exact staleness this feature exists to remove.
  `get_public_portfolio()` merges it live, from the profile row.
* **Nothing sweeps it.** Expiry is a comparison at read time
  (`until > now()`), so there is no cron, no job and no stuck state. A client
  closing their laptop needs to do nothing for the status to become correct.

There is deliberately no ON switch that stays on. Every option is a length,
because the failure being replaced was a status nobody remembered to turn off.

## What Feras asked for

A client adds their WhatsApp, Telegram or Discord. When they are active on a
chosen platform, the portfolio updates itself to say so — instead of the client
hand-typing "We are available to connect." into a stat and it being wrong the
moment they close their laptop.

That string is exactly the problem this solves: a status typed by hand is a
status that is stale immediately.

## Why it is written down rather than started

The hard part is not the UI. It is that **none of the three platforms offers
what this needs**, and that has to be settled before any code is worth writing:

- **WhatsApp** — the Cloud API has no presence endpoint at all. Online/last-seen
  is deliberately not exposed; WhatsApp Business messaging is send/receive only.
  There is no supported way to know if someone is online. Any library claiming
  otherwise is driving a logged-in web session, which breaks the ToS and the
  client's account with it.
- **Telegram** — a Bot cannot see a user's online status either. `getChat`
  returns no presence. Reading `user.status` requires an MTProto *user* client
  logged in AS the client, which means holding their session — not something to
  ask a customer for.
- **Discord** — this one is genuinely possible. Presence is real, and a bot in a
  shared guild with the Presence Intent can read `online / idle / dnd / offline`
  for members of that guild. It requires the client to be in a Designakum guild,
  which is a real ask but an honest one.

So the feature as described is buildable for **Discord only**. For WhatsApp and
Telegram, "are they online" is not information either platform will give us.

## The two honest options

1. **Discord presence, and say so.** Real live status, one platform, clearly
   labelled. The client joins a guild, links their account, and the card shows a
   live dot. WhatsApp and Telegram stay as contact links, which is what they are.

2. **Manual status with an expiry.** No platform integration. The client sets
   "Available until 6pm" or toggles it, and it EXPIRES on its own rather than
   sitting there forever. Solves the actual complaint — a stale hand-typed
   string — without pretending to know something we cannot know.

Option 2 is a day of work and helps every client. Option 1 is a week and helps
the ones who use Discord. They are not exclusive.

## What must not happen

- Do not scrape or automate a logged-in WhatsApp/Telegram session. It violates
  both platforms' terms and gets the CLIENT's account banned, not ours.
- Do not show a green dot that is not backed by real presence. A status that
  lies is worse than no status.
- Do not store platform credentials or session tokens for a client.

## Decision needed from Feras

Which option, or both. Nothing starts until that is answered — the schema, the
UI and the cost are completely different for each.
