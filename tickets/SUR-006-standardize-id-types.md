# SUR-006: Standardize League ID and Member ID Types to String

**Ticket ID**: SUR-006  
**Title**: Standardize League ID and Member ID Types from Number to String  
**Type**: Technical Debt  
**Priority**: High  
**Estimated Story Points**: 8  

## User Story

As a developer, I want to standardize all league ID and member ID types to strings throughout the codebase so that we have consistent data type handling that aligns with our MongoDB ObjectId storage format, reducing type conversion errors and improving code maintainability.

## Description

### Current State
The codebase currently has inconsistent handling of league IDs and member IDs, with some parts treating them as numbers and others as strings. This inconsistency creates several issues:

- **Type Definition Mismatches**: The `League` type defines `id` as `number`, but MongoDB stores it as ObjectId (converted to string in API responses)
- **API Parameter Inconsistencies**: Some API routes expect string parameters while internal functions may use number types
- **Frontend Type Confusion**: Components and hooks sometimes need to convert between string and number representations
- **Database Query Issues**: ObjectId requires string inputs, but some queries may receive number inputs

### Desired State
All league IDs and member IDs should be consistently typed as strings throughout the entire application stack:
- TypeScript type definitions
- Database operations and queries
- API request/response handling
- Frontend components and state management
- Hook implementations

### Technical Considerations
- MongoDB ObjectIds are inherently string-based when serialized
- Next.js route parameters are always strings
- localStorage stores strings
- JSON serialization works naturally with strings
- No performance impact as strings are optimal for ID handling

## Acceptance Criteria

**AC1: Type Definition Updates**
Given: The current type definitions use mixed number/string types for IDs
When: All type definitions are updated to use string for league and member IDs
Then: All League, LeagueMembership, and related types consistently use string IDs

**AC2: Database Layer Consistency**
Given: Database operations currently have mixed ID type handling
When: All database functions are updated to expect string IDs
Then: All MongoDB queries and operations consistently use string ObjectId conversion

**AC3: API Layer Standardization**
Given: API routes have inconsistent parameter type handling
When: All API routes are updated to handle string ID parameters
Then: No type conversion errors occur in API request processing

**AC4: Frontend Component Updates**
Given: Components currently perform manual string/number conversions
When: All components are updated to use string IDs consistently
Then: No manual type conversions are needed in component logic

**AC5: Hook Implementation Consistency**
Given: React hooks currently handle mixed ID types
When: useLeague and related hooks are updated for string IDs
Then: All hook interactions use consistent string ID types

**AC6: API Client Standardization**
Given: API client functions have mixed parameter types
When: All API client functions are updated to use string parameters
Then: Client-side API calls consistently pass string IDs

**AC7: localStorage Integration**
Given: localStorage operations work with strings
When: League selection storage is updated
Then: No string conversion is needed for localStorage operations

**AC8: Validation and Error Handling**
Given: Current validation may expect number types
When: All validation schemas are updated for string IDs
Then: Proper validation occurs for string ID formats

## Technical Requirements

### Architecture
This change affects all layers of the Next.js application:
- **Type System**: Update TypeScript type definitions
- **Database Layer**: Ensure consistent ObjectId handling  
- **API Routes**: Update parameter type expectations
- **Frontend Components**: Remove manual type conversions
- **State Management**: Update React context and hooks

### APIs
**API Route Updates Required:**
- `/api/leagues/[leagueId]/*` - Ensure leagueId handled as string
- `/api/leagues/[leagueId]/members/[memberId]` - Both IDs as strings
- All API client function signatures updated

### Database
**Schema Considerations:**
- MongoDB ObjectIds remain unchanged (already optimal)
- Ensure all queries consistently convert string IDs to ObjectId
- Update any hardcoded ID references

### Frontend
**Component Updates:**
- Remove `parseInt()` calls for league/member IDs
- Update prop types from number to string
- Ensure localStorage interactions remain string-based
- Update any numeric comparisons to string comparisons

### Testing
**Testing Requirements:**
- Unit tests for type consistency across all functions
- Integration tests for API parameter handling
- Frontend tests for component prop type correctness
- End-to-end tests for user workflows involving ID handling

## Definition of Done

- [ ] All TypeScript type definitions updated to use string IDs
- [ ] Database layer functions accept and handle string IDs consistently
- [ ] API routes properly process string ID parameters
- [ ] API client functions use string parameter types
- [ ] Frontend components handle string IDs without conversion
- [ ] React hooks (useLeague, etc.) work with string IDs
- [ ] localStorage operations remain consistent
- [ ] All `parseInt()` calls for IDs removed from codebase
- [ ] Code follows project TypeScript style guide
- [ ] No TypeScript compilation errors
- [ ] Manual testing confirms all user workflows work correctly
- [ ] No runtime type conversion errors occur

## Implementation Notes

### Code Style
Follow existing project patterns:
- Use TypeScript strict typing throughout
- Maintain consistent ObjectId conversion in database layer
- Follow existing API response format conventions
- Preserve existing error handling patterns

### File Locations
**Primary files requiring updates:**

**Type Definitions (`types/` directory):**
- `types/league.ts` - Update League and LeagueMembership id fields
- `types/user.ts` - May need updates for consistency  
- `types/invitation.ts` - Already uses strings (consistent)

**Database Layer (`lib/db.ts`):**
- Update function signatures that currently expect number IDs
- Ensure ObjectId conversion consistency
- Update any hardcoded type assumptions

**API Routes (`app/api/` directory):**
- `app/api/leagues/[leagueId]/route.ts`
- `app/api/leagues/[leagueId]/members/route.ts`
- `app/api/leagues/[leagueId]/members/[memberId]/route.ts`
- `app/api/leagues/[leagueId]/scoreboard/route.ts`
- All other routes referencing league/member IDs

**API Client (`lib/api-client.ts`):**
- Update function signatures for league/member ID parameters
- Remove any internal type conversions
- Ensure consistent parameter passing

**Frontend Components:**
- `hooks/use-league.tsx` - Update localStorage and comparison logic
- Any components with `parseInt(leagueId)` or similar conversions

**Validation Schemas (`lib/api-types.ts`):**
- Update Zod schemas if they validate ID types
- Ensure proper string validation for ObjectId format

### Dependencies
No new packages required - this is purely a type consistency change.

### Migration Strategy
1. **Phase 1**: Update type definitions
2. **Phase 2**: Update database layer and API routes
3. **Phase 3**: Update frontend components and hooks
4. **Phase 4**: Update API client and remove conversions
5. **Phase 5**: Test all user workflows

### Rollback Plan
If issues arise:
1. Revert type definition changes
2. Restore number type handling in affected functions
3. Re-add type conversion logic where removed
4. This change is primarily type-level, so rollback is straightforward

## Testing Strategy

### Unit Tests
- Test all database functions with string ID inputs
- Test API route parameter handling
- Test component prop type handling
- Verify no runtime type errors

### Integration Tests
- Test complete user workflows (league selection, member management)
- Test API request/response cycles with string IDs
- Test React context state management with string IDs

### Manual Testing
**User Journey Validation:**
1. User login and league selection
2. League member management (admin functions)
3. League invitation flows
4. Profile viewing and updates
5. Score viewing and game interactions

### Performance Tests
- Verify no performance regression from string ID usage
- Confirm database query performance remains optimal

## Risk Assessment

### Technical Risks
**Low Risk - Type System Changes:**
- Mitigation: Comprehensive TypeScript checking catches most issues at compile time

**Low Risk - Database Performance:**
- Mitigation: ObjectId handling remains unchanged, only type annotations change

**Medium Risk - Runtime Type Errors:**
- Mitigation: Thorough testing and gradual rollout of changes

### Business Risks
**Low Risk - User Experience:**
- Mitigation: This is a backend consistency change with no user-facing impact

### Security Risks
**Low Risk - ID Validation:**
- Mitigation: Maintain existing ObjectId validation patterns

### Mitigation Plans
1. **Comprehensive Testing**: Full test coverage before deployment
2. **Gradual Implementation**: Update in phases to isolate any issues
3. **TypeScript Validation**: Leverage compile-time checking to catch errors early
4. **Code Review**: Thorough review of all type-related changes

## Related Resources

- **Architecture Documentation**: CLAUDE.md - Multi-league architecture patterns
- **Database Schema**: MongoDB collections and ObjectId usage patterns
- **Type System Reference**: TypeScript strict mode configuration
- **API Documentation**: Next.js API route parameter handling

## Impact Analysis

### Files Requiring Updates (Detailed)

**Critical Impact (Must Update):**
- `types/league.ts:2,12,17` - Change `id: number` to `id: string`
- `lib/db.ts:758` - Fix user ID number conversion in createPick
- `lib/api-client.ts:97,105,109,113,128,136,140,144,151` - Update function parameters from number to string
- `app/api/leagues/[leagueId]/scoreboard/route.ts:23` - Remove parseInt conversion

**Medium Impact (Should Update):**
- `hooks/use-league.tsx:45,81` - Update localStorage comparison logic
- `lib/api-types.ts:54-55` - Update validation schemas if needed
- Database query functions that convert IDs

**Low Impact (Verify Consistency):**
- `types/invitation.ts` - Already uses strings (verify consistency)
- Frontend components that might have ID comparisons
- Any hardcoded ID references

### Breaking Changes
- API client function signatures will change parameter types
- Components expecting number IDs will need prop type updates
- Database functions expecting number parameters will require string inputs

### Backward Compatibility
This is a breaking change requiring coordinated updates across the stack. However, the impact is contained to internal type handling and does not affect external APIs or user data.