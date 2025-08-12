# Magic Link League Invitations

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
