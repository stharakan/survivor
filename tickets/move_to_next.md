 Ticket Header

  - Ticket ID: SURV-001
  - Title: Migrate API Layer from Django to Next.js Backend Integration
  - Type: Technical Debt / Architecture Migration
  - Priority: High
  - Estimated Story Points: 8

  User Story

  As a developer, I want to migrate the API layer from Django expectations to Next.js API routes so that I can
  develop both frontend and backend in the same repository using a single language (TypeScript), simplifying
  development and deployment workflows.

  Description

  Context and Background

  The current survivor league application is architected as a Next.js frontend that expects to communicate with a
  Django REST API backend. All API functions in lib/api.ts are currently implemented with mock data but follow
  Django REST API patterns and endpoint structures.

  Current State

  - Frontend: Next.js 15 with TypeScript, using mock data for all API calls
  - Expected Backend: Django REST API with specific endpoint patterns
  - API Layer: Well-structured abstraction in lib/api.ts with 20+ API functions
  - Authentication: Mock implementation expecting JWT token-based auth
  - Data Models: Comprehensive TypeScript interfaces in types/ directory

  Desired State

  - Unified Repository: Both frontend and backend code in the same Next.js project
  - Next.js API Routes: Replace Django expectations with Next.js API route patterns
  - TypeScript Throughout: End-to-end TypeScript for type safety
  - Simplified Deployment: Single repository deployment instead of two separate services

  Technical Considerations

  - The existing API abstraction layer is excellent and well-typed
  - No existing Next.js API routes currently exist (app/api/ directory is empty)
  - Authentication patterns need to be adapted for Next.js middleware and session handling
  - Database integration will need to be added using MongoDB with native driver (no ORM)

  Acceptance Criteria

  AC1: API Route Structure Migration
  - Given: The current Django endpoint expectations in lib/api.ts
  - When: I migrate to Next.js API routes
  - Then: All API functions should call Next.js endpoints following /api/ pattern instead of Django patterns

  AC2: Authentication System Migration
  - Given: The current mock authentication expecting JWT tokens
  - When: I implement Next.js authentication
  - Then: Authentication should use Next.js sessions or Next-Auth.js patterns with proper middleware

  AC3: Type Safety Preservation
  - Given: The existing TypeScript interfaces and type definitions
  - When: I migrate API calls to Next.js routes
  - Then: All type safety should be preserved with shared types between frontend and API routes

  AC4: Error Handling Consistency
  - Given: The need for robust error handling
  - When: I implement Next.js API routes
  - Then: Error responses should follow consistent patterns with proper HTTP status codes

  AC5: League-Scoped API Pattern
  - Given: The current league-centric architecture where most operations are scoped to specific leagues
  - When: I implement Next.js API routes
  - Then: League context should be properly handled in API routes with appropriate authorization checks

  AC6: Mock Data Replacement
  - Given: The current comprehensive mock data implementation
  - When: I migrate to Next.js API routes
  - Then: Mock data should be replaced with actual API route implementations that can connect to a database

  AC7: Environment Configuration
  - Given: The need for configurable API behavior
  - When: I implement the new API structure
  - Then: Environment variables should control database connections and authentication secrets

  Technical Requirements

  Architecture Changes

  - API Routes: Create /app/api/ directory structure matching current API function patterns
  - Shared Types: Move type definitions to a shared location accessible by both frontend and API routes
  - Middleware: Implement authentication and league context middleware
  - Database Layer: Add MongoDB native driver integration (no ORM)

  API Route Structure

  /app/api/
  ├── auth/
  │   ├── login/route.ts
  │   ├── logout/route.ts
  │   └── verify/route.ts
  ├── leagues/
  │   ├── route.ts (GET all, POST create)
  │   └── [leagueId]/
  │       ├── route.ts (GET, PATCH, DELETE)
  │       ├── members/
  │       ├── games/
  │       ├── picks/
  │       └── scoreboard/route.ts
  ├── users/
  │   └── [userId]/
  │       ├── route.ts
  │       └── leagues/route.ts
  └── join-requests/
      └── [requestId]/
          ├── approve/route.ts
          └── reject/route.ts

  Database Integration

  - MongoDB Native Driver: Use official MongoDB Node.js driver
  - Collection Design: Translate TypeScript interfaces to MongoDB document structure
  - Database Setup: MongoDB connection and collection initialization scripts

  Authentication Changes

  - Next-Auth.js: Implement proper session-based authentication with MongoDB adapter
  - Middleware: Create authentication middleware for protected routes
  - Session Management: Replace localStorage with secure session handling

  Frontend Updates

  - API Base URL: Update from Django URL pattern to Next.js /api/ routes
  - Error Handling: Adapt error handling for Next.js response patterns
  - Environment Variables: Update environment configuration

  Definition of Done

  - All 20+ API functions migrated from Django expectations to Next.js API routes
  - Next.js API routes created following RESTful patterns under /app/api/
  - Authentication system migrated to Next-Auth.js with MongoDB adapter
  - MongoDB native driver integrated with proper collection design matching TypeScript types
  - All existing mock data functionality preserved in API route implementations
  - Error handling implemented with consistent HTTP status codes
  - League-scoped authorization properly implemented in API middleware
  - Environment variables configured for database and authentication
  - Type safety maintained throughout frontend and backend
  - All existing frontend functionality works with new API routes
  - Documentation updated to reflect new architecture
  - Migration guide created for future database setup

  Implementation Notes

  Code Style

  - Follow existing TypeScript patterns and naming conventions
  - Use the same import/export patterns found in current codebase
  - Maintain the retro styling and component patterns for any UI changes

  File Locations

  - API Routes: /app/api/ following Next.js 13+ App Router patterns
  - Shared Types: Consider moving to /lib/types/ or /shared/types/
  - Database Connection: /lib/mongodb.ts for MongoDB connection utility
  - Middleware: /middleware.ts in project root
  - Utilities: /lib/db.ts, /lib/auth.ts for database and auth utilities

  Dependencies to Add

  {
    "dependencies": {
      "next-auth": "^4.24.0",
      "@next-auth/mongodb-adapter": "^1.1.0",
      "mongodb": "^6.0.0",
      "bcryptjs": "^2.4.3",
      "jsonwebtoken": "^9.0.0"
    },
    "devDependencies": {
      "@types/bcryptjs": "^2.4.0",
      "@types/jsonwebtoken": "^9.0.0"
    }
  }

  Migration Strategy

  1. Phase 1: Set up Next.js API route structure and MongoDB connection
  2. Phase 2: Implement authentication system with Next-Auth.js and MongoDB adapter
  3. Phase 3: Migrate core API functions (auth, leagues, users)
  4. Phase 4: Migrate game and pick management APIs
  5. Phase 5: Migrate admin and member management APIs
  6. Phase 6: Update frontend to use new API routes
  7. Phase 7: Remove mock data and test end-to-end functionality

  Rollback Plan

  - Keep mock data implementation as fallback during migration
  - Use feature flags to toggle between mock and real API calls
  - Maintain backup of current lib/api.ts implementation

  Testing Strategy

  Unit Tests

  - API route functionality testing with mocked MongoDB
  - MongoDB document validation testing
  - Authentication middleware testing
  - Type validation for request/response objects

  Integration Tests

  - End-to-end API workflow testing
  - Authentication flow testing
  - MongoDB operations testing
  - League-scoped authorization testing

  Manual Testing

  - User registration and login flow
  - League creation and joining process
  - Pick submission and validation
  - Admin member management functionality
  - Scoreboard and profile viewing
  - Cross-browser compatibility for new auth patterns

  Risk Assessment

  Technical Risks

  - Breaking Changes: Migration might break existing frontend functionality
  - Database Performance: MongoDB queries need to be optimized for performance
  - Authentication Security: Session handling must be secure
  - Type Safety: Risk of losing type safety during migration without ORM
  - Data Validation: Manual validation required without ORM schema validation

  Business Risks

  - User Experience: Authentication changes might affect user sessions
  - Development Velocity: Team productivity might decrease during migration

  Mitigation Plans

  - Incremental Migration: Implement feature flags for gradual rollout
  - Comprehensive Testing: Extensive testing before deployment
  - Data Validation: Implement robust validation using Zod schemas
  - Documentation: Detailed migration documentation for team
  - Rollback Strategy: Ability to revert to mock data if needed

  Related Resources

  - Current API Implementation: /lib/api.ts
  - Type Definitions: /types/ directory
  - Authentication Context: /hooks/use-auth.tsx
  - League Management: /hooks/use-league.tsx
  - Next.js API Routes Documentation: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
  - Next-Auth.js Documentation: https://next-auth.js.org/
  - MongoDB Node.js Driver Documentation: https://www.mongodb.com/docs/drivers/node/current/
