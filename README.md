# AMONG: IRL

A mobile-first real-time social deduction game.

## Local development
1. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key.
2. Run `npm install`.
3. Run `npm run dev`.

## Backend
Apply `supabase/migrations/20261121000100_among_irl_core.sql` and deploy `supabase/functions/game-api`.

Players enter a name and receive an automatic Supabase anonymous Auth identity. This persists their profile, points, match history, and cosmetics without an email or password. Guest identities are browser-local and cannot be recovered after clearing browser data unless a future account-linking feature is used.

The app targets Supabase Free and GitHub Pages. Free-tier limits apply, and low-activity Supabase Free projects may pause after seven days.

The first release focuses on a complete, secure multiplayer loop: host rooms, QR/code joining, private guest profiles, realtime lobby, private roles and tasks, meetings, private voting, match results, points, and cosmetics. More advanced roles and modes are planned as follow-on features.
