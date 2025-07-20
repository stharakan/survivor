# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 app for a multi-league Survivor League fantasy football platform with a retro pixel art aesthetic. Users can participate in multiple survivor leagues (EPL, NFL, NBA), pick one team per week, and aim to survive as long as possible.

## Development Commands

### Core Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### No TypeScript or Test Commands
The project has TypeScript type checking disabled (`ignoreBuildErrors: true`) and no test framework configured.

## Architecture

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (with strict checking disabled)
- **Styling**: Tailwind CSS with custom retro theme
- **UI Components**: shadcn/ui with heavy customization
- **State Management**: React Context for auth and league management
- **API**: Mock data in `lib/api.ts` (expects Django REST API backend)

### Key Design Patterns

#### Multi-League Architecture
The entire app is built around league context switching:

1. **Authentication Flow**: Login → League Selection → League-Scoped Experience
2. **League Context**: All data (picks, standings, profiles) is league-specific
3. **Route Protection**: `LeagueGuard` component ensures proper league selection
4. **Data Scoping**: Every API call includes league context

#### Context Management
- `AuthProvider` (`hooks/use-auth.tsx`) - User authentication and session
- `LeagueProvider` (`hooks/use-league.tsx`) - League selection and management
- Both providers wrap the app in `app/providers.tsx`

#### API Layer
The API layer has been migrated from mock data to actual Next.js API routes. The application now uses MongoDB with native driver (no ORM) for data persistence. Core authentication and league management APIs are implemented, with additional features marked as "not implemented yet".

### Custom Styling
- **Retro Theme**: Pixel fonts (Press Start 2P, VT323), custom colors, pixel shadows
- **Animations**: Custom keyframes for blinking, pixelate effects
- **Components**: All shadcn/ui components customized for retro aesthetic

### Route Structure
```
/login - Authentication
/leagues - League selection (post-login)
/profile - User profile (league-scoped)
/scoreboard - League standings (league-scoped) 
/make-picks - Weekly team selection (league-scoped)
/player/[id] - Individual player profiles (league-scoped)
/admin/* - League administration pages (admin only)
```

## Important Implementation Notes

### League Context Requirements
- All league-scoped pages must be wrapped with `LeagueGuard`
- API functions require `leagueId` parameter
- League selection persisted in localStorage
- Logo click returns to league selection

### Data Models
Key TypeScript types are defined in `types/` directory:
- `League` - Survivor league information
- `LeagueMembership` - User's participation in a league
- `User` - User account information
- `Team` - Sports teams (EPL, NFL, etc.)
- `Game` - Individual matches/games
- `Pick` - User's weekly team selection
- `Player` - Scoreboard player data

### API Integration
The app now uses Next.js API routes with MongoDB backend. Authentication is JWT-based with HTTP-only cookies. The API routes are located in `app/api/` and follow RESTful patterns.

### Authentication Pattern
- JWT token-based with HTTP-only cookies
- Real authentication with MongoDB backend
- User state managed via React Context
- Automatic league selection on login

## Development Guidelines

### Adding New Features
1. Determine if feature is league-scoped or global
2. Add necessary TypeScript types to `types/` directory
3. Create API functions in `lib/api.ts` with proper mock data
4. Implement UI components following retro styling patterns
5. Use existing shadcn/ui components as base

### Styling Conventions
- Use Tailwind's custom retro color palette
- Apply pixel shadows for elevated elements
- Use pixel fonts for headings and retro font for body text
- Follow existing component patterns for consistency

### League-Scoped Development
- Always use `useLeague()` hook for league context
- Include league ID in all relevant API calls
- Test functionality across different league selections
- Ensure proper route protection with `LeagueGuard`

## Environment Setup

Required environment variables:
```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=survivor-league
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here
JWT_SECRET=your-jwt-secret-here
```

The project now uses MongoDB as the backend database. Set up a local MongoDB instance or use MongoDB Atlas cloud service.