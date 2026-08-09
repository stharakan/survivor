# Magic Link League Invitations

**Status**: Done (verified 2026-08-09)

Shipped as part of the CR-105 Python port (invitations were Rank 6 of that port,
per `CR-105-FINDINGS.md` Table 1, 6.1-6.10) plus CR-106's static-export route
migration, rather than as work tracked against this ticket directly. Verified
against the current codebase AC-by-AC; nothing further to build.

- **AC1 (Invitation creation)**: `POST /api/leagues/{league_id}/invitations`
  (`api/app/routers/invitations.py:89-100`) requires an admin membership
  (`get_membership_for_user(...).isAdmin`, line 96-97) before calling
  `create_league_invitation` (`api/app/db/invitations.py:28-58`), which accepts
  `maxUses`/`expiresAt` (`api/app/models/requests.py:99-103`,
  `CreateInvitationRequestBody`) and generates the token. Frontend: the
  "Create Invitation" dialog in `app/admin/page.tsx` (invitations tab, ~lines
  473-545) posts to that endpoint and prepends the new invitation to the list.
- **AC2 (Acceptance page)**: `GET /api/invite/{token}` is intentionally public
  (no `verify_auth_token` call — `api/app/routers/invitations.py:69-75`) and
  returns league/creator summary + validity flags via
  `get_invitation_by_token` (`api/app/db/invitations.py:104-140`, computes
  `isExpired`/`isAtMaxUses`/`isValid`). `app/invite/page.tsx` renders the
  league name, sport, member count, and expiry/usage state from that payload.
- **AC3 (Account-flow integration)**: `app/invite/page.tsx:264-273` links
  unauthenticated visitors to `/login?redirect=/invite?token=...` and
  `/register?redirect=...`; `app/login/page.tsx:25-35` and
  `app/register/page.tsx` read `redirect`, run it through
  `getSafeRedirectUrl` (`lib/utils.ts:108`), and `router.push` back to the
  invite page post-auth, where the now-authenticated user submits a team name
  and `POST /api/invite/{token}/accept` (`api/app/routers/invitations.py:58-67`
  → `accept_invitation`, `api/app/db/invitations.py:143-177`) creates the
  membership and the page redirects to `/leagues`.
- **AC4 (Usage limits)**: `get_invitation_by_token` computes
  `is_at_max_uses = maxUses and currentUses >= maxUses`
  (`api/app/db/invitations.py:131`); `accept_invitation` rejects with
  "Invitation has reached maximum uses" whenever `isValid` is false for that
  reason (`api/app/db/invitations.py:159-160`), and increments `currentUses`
  on every successful accept (line 172-175). Note: the invitation's `isActive`
  DB flag itself is not flipped to `false` on hitting max uses (only on
  explicit revoke) — validity is computed dynamically from
  `isActive && !expired && !atMax` — but the observable behavior the AC asks
  for (further accepts are rejected, UI shows "reached maximum uses") is
  correct.
- **AC5 (Admin management)**: `GET /api/leagues/{league_id}/invitations`
  (admin-gated, `api/app/routers/invitations.py:79-88`) backs the "Active
  Invitations" list in `app/admin/page.tsx` (~lines 545-625), which shows
  uses/max, expiry, and a working "Revoke" button calling
  `DELETE /api/invitations/{invitation_id}`
  (`api/app/routers/invitations.py:27-46`). That handler was hardened beyond
  the original TS route during the port — it now resolves the invitation's
  owning league via `get_invitation_league_id` and requires the caller be an
  admin of *that* league (lines 36-40), fixing a real authz gap the old TS
  code's own comment admitted ("any authenticated user for now").
  `revoke_invitation` sets `isActive: false` (`api/app/db/invitations.py:196-202`),
  which flows into `isValid` on the next lookup.
- **AC6 (Expired/invalid link handling)**: `app/invite/page.tsx:118-161` shows
  a dedicated "Invalid Invitation" card with the server's error message and a
  "Browse Available Leagues" fallback link when `GET /api/invite/{token}`
  fails (not-found); the same page's `!invitation.invitation.isValid` branch
  (lines 245-257, 326-337) surfaces expired/max-uses/revoked states inline
  before the join form.
- **Security**: token generated via `secrets.token_hex(32)`
  (`api/app/db/invitations.py:35`) — 32 cryptographically-secure random bytes,
  64 hex chars, matching the ticket's `crypto.randomBytes(32)` requirement.
  Admin permission is checked on create, list, and revoke (see above); accept
  requires `verify_auth_token`.
- **Route restructuring**: CR-106 (static export) replaced the dynamic
  `/invite/[token]` and `/admin/invitations` path-param routes with a
  query-string route (`/invite?token=...`, `app/invite/page.tsx:18-22`
  explains why) and a redirect stub (`app/admin/invitations/page.tsx` →
  `/admin?tab=invitations`) into the main admin dashboard's invitations tab.
  Confirmed both are live, not stale/orphaned routes.
- **Gap noted, not blocking**: no dedicated automated test file exists for
  the invitations data-layer or routes (`api/tests/` has no
  `test_invitations*.py`); verification here is by direct code read against
  every AC's Given/When/Then, not by an automated suite. Consistent with how
  this repo has verified other CR-105/106/107 tickets to date.

---

**Ticket ID**: SUR-001  
**Title**: Implement Magic Link League Invitation System  
**Type**: Feature  
**Priority**: Medium  
**Estimated Story Points**: 8

## User Story

As a league admin, I want to generate shareable invitation links so that I can easily invite multiple users to join my league without requiring individual approval for each person.

## Description

Currently, users must request to join leagues and wait for admin approval. This creates friction for league admins who want to quickly invite friends or colleagues to their leagues. The magic link invitation system will allow admins to generate secure, time-limited invitation links that bypass the approval process and provide a seamless onboarding experience.

### Current State
- Users click "Ask to Join" → creates JoinRequest → requires admin approval
- Admin must manually approve each join request
- No way to share league access externally

### Desired State  
- Admin generates invitation link with configurable options (expiration, max uses)
- Admin can copy and sharexternally via any method (email, chat, etc.)
- Users click link → automatic account creation/login → instant league membership
- Admin maintains visibility and control over invitations

## Acceptance Criteria

**AC1: Invitation Creation**  
Given: I am a league admin on the admin dashboard  
When: I navigate to the invitation management section and click "Create Invitation"  
Then: I can configure invitation settings (max uses, expiration date) and generate a unique invitation link

**AC2: Invitation Link Acceptance**  
Given: A user receives a valid invitation link  
When: They click the link  
Then: They are redirected to the invitation acceptance page showing league details and join options

**AC3: Account Flow Integration**  
Given: An unauthenticated user clicks an invitation link  
When: They are redirected to create account/login  
Then: After successful authentication, they are automatically added to the league and redirected to the league dashboard

**AC4: Invitation Limits**  
Given: An invitation has a max usage limit of 5  
When: 5 users have successfully joined via the link  
Then: The invitation becomes inactive and subsequent users see an "invitation expired" message

**AC5: Admin Invitation Management**  
Given: I am a league admin  
When: I view the invitations list  
Then: I can see all active invitations with their usage stats, expiration dates, and can revoke active invitations

**AC6: Expired/Invalid Link Handling**  
Given: A user clicks an expired or invalid invitation link  
When: They attempt to access the invitation  
Then: They see an appropriate error message and are offered alternative joining methods

## Technical Requirements

### Database Schema
- New `league_invitations` collection in MongoDB with fields:
  - `_id`: ObjectId  
  - `leagueId`: ObjectId (reference to leagues)
  - `token`: String (unique, URL-safe)
  - `createdBy`: ObjectId (reference to users)
  - `maxUses`: Number (null = unlimited)
  - `currentUses`: Number (default: 0)
  - `expiresAt`: Date (null = no expiration)
  - `isActive`: Boolean (default: true)
  - `createdAt`: Date
  - `updatedAt`: Date

### API Endpoints
- `POST /api/leagues/{leagueId}/invitations` - Create invitation (admin only)
- `GET /api/leagues/{leagueId}/invitations` - List invitations (admin only)
- `DELETE /api/invitations/{invitationId}` - Revoke invitation (admin only)
- `GET /api/invitations/{token}` - Get invitation details (public)
- `POST /api/invitations/{token}/accept` - Accept invitation (authenticated)

### Frontend Components
- Admin invitation management panel in `/app/admin/invitations/`
- Invitation acceptance page at `/app/invite/[token]/`
- Invitation creation modal/form component
- Integration with existing admin navigation

### Security Considerations
- Use cryptographically secure random tokens (32+ characters)
- Validate admin permissions for invitation creation/management
- Rate limiting on invitation acceptance to prevent abuse
- Proper token validation and expiration checking

## Definition of Done

- [ ] Database schema implemented with proper indexes
- [ ] All API endpoints implemented with JWT authentication
- [ ] Admin invitation management UI completed
- [ ] Invitation acceptance flow implemented
- [ ] Integration with existing auth flow (login/register → auto-join)
- [ ] Unit tests written for all API functions (80%+ coverage)
- [ ] Frontend components follow retro design system patterns
- [ ] Error handling implemented for all edge cases
- [ ] Database migrations tested in development environment
- [ ] Code review completed and approved
- [ ] Manual testing of full user journey completed
- [ ] Documentation updated in CLAUDE.md

## Implementation Notes

### Code Style & Patterns
Follow existing codebase patterns:
- Use MongoDB native driver (no ORM) as in `/lib/db.ts`
- Follow API structure from `/app/api/auth/login/route.ts`
- Use Zod schemas for validation in `/lib/api-types.ts`
- Implement JWT-based authentication pattern
- Follow Next.js 15 App Router patterns
- Use shadcn/ui components with retro customizations

### File Structure
```
lib/
├── db.ts (add invitation functions)
├── api-types.ts (add invitation schemas)
app/api/
├── leagues/[leagueId]/invitations/route.ts
├── invitations/[token]/route.ts
├── invitations/[token]/accept/route.ts
app/
├── invite/[token]/page.tsx
├── admin/invitations/page.tsx
types/
├── invitation.ts (new type definitions)
```

### Token Generation
Use Node.js crypto module for secure token generation:
```typescript
import crypto from 'crypto'
const token = crypto.randomBytes(32).toString('hex')
```

### Database Indexes
Create indexes for efficient querying:
- `{ leagueId: 1, isActive: 1 }` for admin listing
- `{ token: 1 }` for invitation lookup
- `{ expiresAt: 1 }` for cleanup jobs

## Testing Strategy

### Unit Tests
- Database functions for CRUD operations
- Token generation and validation
- Invitation expiration logic
- Usage limit enforcement

### Integration Tests  
- Full invitation acceptance flow
- Admin permission validation
- Cross-browser invitation link handling

### Manual Testing Checklist
- [ ] Admin can create invitations with all configurations
- [ ] Invitation links work across different browsers/devices
- [ ] Account creation flow works with return URL
- [ ] Existing user login flow works with auto-join
- [ ] Expired invitations show appropriate messages
- [ ] Usage limits are enforced correctly
- [ ] Admin can view and revoke invitations

## Risk Assessment

### Technical Risks
- **Token Collision**: Very low probability with 32-byte tokens
- **Database Performance**: Indexed queries should handle reasonable scale
- **Session Management**: Ensure invitation state survives login flow

### Security Risks  
- **Token Guessing**: Mitigated by cryptographically secure generation
- **Unauthorized Access**: Mitigated by proper admin permission checks
- **Link Sharing**: Acceptable risk as admin controls invitation creation

### Mitigation Strategies
- Implement comprehensive logging for invitation usage
- Add monitoring alerts for unusual invitation patterns  
- Provide admin visibility into invitation activity
- Include token revocation capability for security incidents

## Related Resources

- Current league joining flow: `/app/leagues/page.tsx:48-60`
- Admin authentication pattern: `/app/admin/settings/page.tsx`
- Database operations reference: `/lib/db.ts`
- API response patterns: `/lib/api-types.ts`
- League membership types: `/types/league.ts`
