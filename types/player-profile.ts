// Matches api/app/models/player_profile.py's `PlayerProfile`. Public shape --
// any active league member can fetch any other member's profile via
// `GET /api/leagues/{leagueId}/players/{userId}/profile`. Deliberately does
// NOT include pick history (see that module's docstring, CR-105-FINDINGS.md
// Addendum 2 "picks privacy boundary") -- a user's own picks come from
// `getUserPicks`, which is self-only.
export type PlayerProfile = {
  id: string
  name: string
  teamName: string
  points: number
  strikes: number
  rank: number
  totalWeeksInSeason?: number
}
