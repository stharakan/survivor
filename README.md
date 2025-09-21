# Tharakan Bros Survivor League

A retro-styled multi-league Survivor League web application built with Next.js, featuring a pixel art aesthetic and comprehensive league management functionality.

## Overview

This is a fantasy football application that supports multiple Survivor Leagues within the same platform. In each league, players pick one team each week from the associated sports league (EPL, NFL, NBA, etc.). If their chosen team wins, they survive to the next week. The goal is to survive as long as possible throughout the season. Each team can be picked up to twice per season within each league, adding strategic depth to the game.

## Key Features

### Multi-League Support
- **Multiple Survivor Leagues**: Users can participate in multiple leagues simultaneously
- **League-Specific Data**: Each league maintains separate picks, points, strikes, and team usage
- **Sports League Integration**: Each Survivor League is tied to a specific sports league (EPL, NFL, NBA)
- **Unique Team Names**: Users can have different team names in each league

### User Experience
- **League Selection**: After login, users choose which league to enter
- **League Switching**: Click the logo to return to league selection
- **Scoped Experience**: All functionality (Profile, Scoreboard, Make Picks) is league-specific
- **Retro Gaming Aesthetic**: Pixel art styling with retro colors and fonts

### Core Functionality
- **User Authentication**: Login system with user profiles
- **Weekly Picks**: Select one team per week from available matches
- **Team Tracking**: Visual indicators for which teams have been used
- **League Standings**: Real-time scoreboard with player rankings
- **Player Profiles**: Individual player statistics and pick history
- **Responsive Design**: Works on desktop and mobile devices
- **Dark/Light Mode**: Theme switching capability

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React, TypeScript
- **Styling**: Tailwind CSS with custom retro theme
- **UI Components**: shadcn/ui with custom modifications
- **Icons**: Lucide React
- **Fonts**: Press Start 2P (headings), VT323 (body text)
- **State Management**: React Context for auth and league management

## Application Flow

### 1. Authentication
1. User logs in with credentials
2. System redirects to league selection page

### 2. League Selection
1. Display all leagues user belongs to
2. Show league info (sport, season, member count)
3. Display user's stats in each league
4. User selects a league to enter

### 3. League-Scoped Experience
1. All subsequent pages are scoped to selected league
2. Navigation shows current league context
3. Data (picks, standings, etc.) is league-specific
4. Logo click returns to league selection

## Backend API Requirements

This frontend application expects a Django REST API backend with the following endpoints:

### Authentication Endpoints

#### POST `/api/auth/login/`
**Called from**: `hooks/use-auth.tsx` - `login()` function
**Purpose**: Authenticate user credentials
**Request Body**:
\`\`\`json
{
  "email": "user@example.com",
  "password": "password123"
}
\`\`\`
**Response**:
\`\`\`json
{
  "user": {
    "id": 1,
    "username": "demo_user",
    "email": "user@example.com"
  },
  "token": "jwt_token_here"
}
\`\`\`

#### POST `/api/auth/logout/`
**Called from**: `hooks/use-auth.tsx` - `logout()` function
**Purpose**: Invalidate user session
**Headers**: `Authorization: Bearer <token>`

#### GET `/api/auth/verify/`
**Called from**: `hooks/use-auth.tsx` - `useEffect` on app load
**Purpose**: Verify if current token is valid
**Headers**: `Authorization: Bearer <token>`

### League Management Endpoints

#### GET `/api/users/{user_id}/leagues/`
**Called from**: `hooks/use-league.tsx` - on user login
**Purpose**: Get all leagues user belongs to
**Headers**: `Authorization: Bearer <token>`
**Response**:
\`\`\`json
[
  {
    "id": 1,
    "league": {
      "id": 1,
      "name": "Tharakan Bros EPL League",
      "description": "Premier League survivor league",
      "sportsLeague": "EPL",
      "season": "2024-25",
      "isActive": true,
      "memberCount": 10
    },
    "user": 1,
    "teamName": "Tharakan Warriors",
    "points": 6,
    "strikes": 1,
    "rank": 5,
    "joinedAt": "2024-08-01T00:00:00Z",
    "isActive": true
  }
]
\`\`\`

#### GET `/api/leagues/{league_id}/`
**Called from**: Various components for league details
**Purpose**: Get specific league information
**Headers**: `Authorization: Bearer <token>`

### User Profile Endpoints

#### GET `/api/users/{user_id}/profile/?league_id={league_id}`
**Called from**: 
- `app/profile/page.tsx` - User's own profile
- `app/player/[id]/page.tsx` - Other players' profiles
**Purpose**: Get league-specific user profile information
**Headers**: `Authorization: Bearer <token>`
**Response**:
\`\`\`json
{
  "id": 1,
  "username": "demo_user",
  "email": "user@example.com"
}
\`\`\`

#### PATCH `/api/users/{user_id}/`
**Called from**: `app/profile/page.tsx` - User's own profile editing
**Purpose**: Update user profile information (display name)
**Headers**: `Authorization: Bearer <token>`
**Authorization**: Users can only modify their own profile (user_id must match authenticated user)
**Request Body**:
\`\`\`json
{
  "name": "New Display Name"
}
\`\`\`
**Response**:
\`\`\`json
{
  "success": true,
  "data": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "New Display Name"
  }
}
\`\`\`
**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Attempting to modify another user's profile
- `400 Bad Request`: Invalid data (name > 12 characters)
- `404 Not Found`: User does not exist

### League Standings Endpoints

#### GET `/api/leagues/{league_id}/scoreboard/`
**Called from**: `app/scoreboard/page.tsx`
**Purpose**: Get current league standings for specific league
**Headers**: `Authorization: Bearer <token>`
**Authorization**: User must be an active member of the target league
**Response**:
\`\`\`json
[
  {
    "id": 1,
    "name": "Arun Tharakan",
    "points": 8,
    "strikes": 0,
    "rank": 1
  }
]
\`\`\`
**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User is not a member of this league
- `404 Not Found`: League does not exist

#### GET `/api/leagues/{league_id}/results/`
**Called from**: Results page components
**Purpose**: Get league results with pick outcomes for all completed weeks
**Headers**: `Authorization: Bearer <token>`
**Authorization**: User must be an active member of the target league
**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User is not a member of this league
- `404 Not Found`: League does not exist

#### GET `/api/leagues/{league_id}/`
**Called from**: Various components for league details
**Purpose**: Get specific league information and settings
**Headers**: `Authorization: Bearer <token>`
**Authorization**: User must be an active member of the target league
**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User is not a member of this league
- `404 Not Found`: League does not exist

#### GET `/api/leagues/{league_id}/members/`
**Called from**: Admin and member management components
**Purpose**: Get list of all members in the league
**Headers**: `Authorization: Bearer <token>`
**Authorization**: User must be an active member of the target league
**Error Responses**:
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User is not a member of this league

### Games and Picks Endpoints

#### GET `/api/leagues/{league_id}/games/week/{week_number}/`
**Called from**: `app/make-picks/page.tsx` - when week changes
**Purpose**: Get all games for a specific week in a specific league
**Headers**: `Authorization: Bearer <token>`
**Response**:
\`\`\`json
[
  {
    "id": 15,
    "week": 8,
    "homeTeam": {
      "id": 10,
      "name": "Liverpool",
      "abbreviation": "LIV",
      "logo": "https://resources.premierleague.com/premierleague/badges/t14.png"
    },
    "awayTeam": {
      "id": 8,
      "name": "Everton",
      "abbreviation": "EVE",
      "logo": "https://resources.premierleague.com/premierleague/badges/t11.png"
    },
    "homeScore": null,
    "awayScore": null,
    "status": "scheduled",
    "date": "2024-01-30T15:00:00Z",
    "userPick": null
  }
]
\`\`\`

#### GET `/api/leagues/{league_id}/users/{user_id}/picks/`
**Called from**: 
- `app/profile/page.tsx` - User's pick history
- `app/player/[id]/page.tsx` - Other players' pick history
**Purpose**: Get all picks made by a specific user in a specific league
**Headers**: `Authorization: Bearer <token>`

#### GET `/api/leagues/{league_id}/users/{user_id}/available-teams/`
**Called from**: `app/make-picks/page.tsx` - for "Available Teams" modal
**Purpose**: Get teams that user hasn't picked yet in this league
**Headers**: `Authorization: Bearer <token>`
**Response**:
\`\`\`json
[
  {
    "team": {
      "id": 1,
      "name": "Arsenal",
      "abbreviation": "ARS",
      "logo": "https://resources.premierleague.com/premierleague/badges/t3.png"
    },
    "remaining": 0
  }
]
\`\`\`

#### POST `/api/leagues/{league_id}/picks/`
**Called from**: `app/make-picks/page.tsx` - when submitting a pick
**Purpose**: Create a new pick for the user in the specified league
**Headers**: `Authorization: Bearer <token>`
**Request Body**:
\`\`\`json
{
  "game_id": 15,
  "team_id": 10
}
\`\`\`

### Teams Endpoint

#### GET `/api/leagues/{league_id}/teams/`
**Called from**: Various components for team data
**Purpose**: Get all teams for the sports league associated with this survivor league
**Response**:
\`\`\`json
[
  {
    "id": 1,
    "name": "Arsenal",
    "abbreviation": "ARS",
    "logo": "https://resources.premierleague.com/premierleague/badges/t3.png"
  }
]
\`\`\`

## Data Models

### League
\`\`\`typescript
type League = {
  id: number
  name: string
  description: string
  sportsLeague: string // "EPL", "NFL", "NBA"
  logo?: string
  season: string
  isActive: boolean
  memberCount: number
}
\`\`\`

### League Membership
\`\`\`typescript
type LeagueMembership = {
  id: number
  league: League
  user: number
  teamName: string
  points: number
  strikes: number
  rank: number
  joinedAt: string
  isActive: boolean
}
\`\`\`

### User
\`\`\`typescript
type User = {
  id: number
  username: string
  email: string
  leagues?: LeagueMembership[]
}
\`\`\`

### Team
\`\`\`typescript
type Team = {
  id: number
  name: string
  abbreviation: string
  logo: string
}
\`\`\`

### Game
\`\`\`typescript
type Game = {
  id: number
  week: number
  homeTeam: Team
  awayTeam: Team
  homeScore: number | null
  awayScore: number | null
  status: "scheduled" | "in_progress" | "completed"
  date: string
  userPick?: {
    id: number
    user: number
    team: Team
    result: "win" | "loss" | "draw" | null
    week: number
  }
}
\`\`\`

### Pick
\`\`\`typescript
type Pick = {
  id: number
  user: number
  game: Game
  team: Team
  result: "win" | "loss" | "draw" | null
  week: number
}
\`\`\`

### Player (for scoreboard)
\`\`\`typescript
type Player = {
  id: number
  name: string
  points: number
  strikes: number
  rank: number
}
\`\`\`

## File Structure

\`\`\`
app/
├── globals.css                 # Global styles and theme variables
├── layout.tsx                  # Root layout with providers
├── page.tsx                    # Homepage
├── providers.tsx               # Context providers wrapper
├── login/
│   └── page.tsx               # Login page
├── leagues/
│   └── page.tsx               # League selection page
├── profile/
│   └── page.tsx               # User profile page (league-scoped)
├── scoreboard/
│   └── page.tsx               # League standings (league-scoped)
├── make-picks/
│   └── page.tsx               # Weekly pick selection (league-scoped)
└── player/
    └── [id]/
        └── page.tsx           # Individual player profile (league-scoped)

components/
├── navbar.tsx                  # Main navigation with league context
├── mode-toggle.tsx            # Dark/light mode toggle
├── league-guard.tsx           # Route protection for league-scoped pages
└── ui/                        # shadcn/ui components (customized)

hooks/
├── use-auth.tsx               # Authentication context and hooks
└── use-league.tsx             # League selection and context management

lib/
└── api.ts                     # API functions with league scoping

types/
├── user.ts                    # User type definitions
├── league.ts                  # League and membership type definitions
├── team.ts                    # Team type definitions
├── game.ts                    # Game type definitions
├── pick.ts                    # Pick type definitions
└── player.ts                  # Player type definitions
\`\`\`

## Key Implementation Details

### League Context Management
- `useLeague` hook manages current league state
- League selection persisted in localStorage
- All API calls include league context
- Route protection ensures league is selected

### Navigation Flow
1. **Login** → **League Selection** → **League-Scoped Pages**
2. **Logo Click** → Returns to League Selection
3. **Logout** → Clears both auth and league state

### Data Scoping
- All picks, points, strikes are league-specific
- Team usage tracking is per-league
- Scoreboards show league-specific rankings
- User profiles show league-specific stats

### Route Protection
- `LeagueGuard` component protects league-scoped routes
- Redirects to login if not authenticated
- Redirects to league selection if no league selected

## Environment Variables

The application requires the following environment variables. Copy `.env.example` to `.env.local` for local development:

\`\`\`env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=survivor-league

# NextAuth Configuration  
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here-change-this-in-production

# JWT Secret
JWT_SECRET=your-jwt-secret-here
\`\`\`

## Local Development Setup

1. **Clone the repository**
   \`\`\`bash
   git clone <repository-url>
   cd survivor-league
   \`\`\`

2. **Install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

3. **Set up environment variables**
   \`\`\`bash
   cp .env.example .env.local
   # Edit .env.local with your local configuration
   \`\`\`

4. **Set up MongoDB**
   - Install and start MongoDB locally, OR
   - Use MongoDB Atlas (recommended for consistency with production)

5. **Initialize the database** (optional)
   \`\`\`bash
   npx tsx scripts/init-db.ts
   \`\`\`

6. **Run development server**
   \`\`\`bash
   npm run dev
   \`\`\`

## Production Deployment to Heroku

### Prerequisites

1. **Heroku Account and CLI**
   - Create account at [heroku.com](https://heroku.com)
   - Install [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
   - Login: \`heroku login\`

2. **MongoDB Atlas Account**
   - Create account at [mongodb.com/atlas](https://mongodb.com/atlas)
   - This is required as Heroku doesn't provide MongoDB hosting

### Step 1: Set Up MongoDB Atlas

1. **Create a MongoDB Atlas Cluster**
   - Log into MongoDB Atlas
   - Create a new cluster (free tier is sufficient for testing)
   - Wait for cluster to deploy (5-10 minutes)

2. **Configure Database Access**
   - Go to "Database Access" in Atlas dashboard
   - Create a database user with read/write permissions
   - Note the username and password

3. **Configure Network Access**
   - Go to "Network Access" in Atlas dashboard  
   - Add IP Address: \`0.0.0.0/0\` (allows access from anywhere, required for Heroku)
   - **Note**: For production, consider using Heroku's IP ranges instead

4. **Get Connection String**
   - Go to "Clusters" → Click "Connect"
   - Choose "Connect your application"
   - Copy the connection string (looks like: \`mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/<database>?retryWrites=true&w=majority\`)

### Step 2: Deploy to Heroku

1. **Create Heroku App**
   \`\`\`bash
   # In your project directory
   heroku create your-app-name
   \`\`\`

2. **Set Environment Variables**
   \`\`\`bash
   # MongoDB Atlas connection (replace with your actual connection string)
   heroku config:set MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/<database>?retryWrites=true&w=majority"
   
   # Database name
   heroku config:set MONGODB_DB_NAME="survivor-league"
   
   # NextAuth configuration (replace with your Heroku app URL)
   heroku config:set NEXTAUTH_URL="https://your-app-name.herokuapp.com"
   
   # Generate secure secrets (use these commands or generate your own)
   heroku config:set NEXTAUTH_SECRET="$(openssl rand -base64 32)"
   heroku config:set JWT_SECRET="$(openssl rand -base64 32)"
   \`\`\`

3. **Deploy the Application**
   \`\`\`bash
   # Deploy current branch to Heroku
   git push heroku main
   \`\`\`

4. **Initialize Database** (optional)
   \`\`\`bash
   # Run database initialization on Heroku
   heroku run npx tsx scripts/init-db.ts
   \`\`\`

5. **Open Your Application**
   \`\`\`bash
   heroku open
   \`\`\`

### Step 3: Verify Deployment

1. **Check Application Logs**
   \`\`\`bash
   heroku logs --tail
   \`\`\`

2. **Test Core Functionality**
   - Navigate to your Heroku app URL
   - Test login functionality
   - Verify database connections work
   - Test league selection and navigation

### Environment Variables Reference

For production deployment, configure these environment variables in Heroku:

| Variable | Description | Example |
|----------|-------------|---------|
| \`MONGODB_URI\` | MongoDB Atlas connection string | \`mongodb+srv://user:pass@cluster.mongodb.net/db\` |
| \`MONGODB_DB_NAME\` | Database name | \`survivor-league\` |
| \`NEXTAUTH_URL\` | Your app's URL | \`https://your-app.herokuapp.com\` |
| \`NEXTAUTH_SECRET\` | Random secret for NextAuth | \`openssl rand -base64 32\` |
| \`JWT_SECRET\` | Random secret for JWT tokens | \`openssl rand -base64 32\` |
| \`NODE_ENV\` | Environment (auto-set by Heroku) | \`production\` |

### Troubleshooting

**Build Failures**
- Check \`heroku logs\` for specific errors
- Ensure all dependencies are in \`dependencies\` not \`devDependencies\`
- Verify Node.js version compatibility (20+)

**Database Connection Issues**
- Verify MongoDB Atlas connection string format
- Ensure database user has proper permissions
- Check network access allows \`0.0.0.0/0\` or Heroku IP ranges
- Test connection string locally first

**Authentication Issues**
- Verify \`NEXTAUTH_URL\` matches your Heroku app URL exactly
- Ensure secrets are properly generated and set
- Check that HTTPS is used (Heroku provides this automatically)

**Performance Issues**
- Monitor app metrics in Heroku dashboard
- Consider upgrading from free dyno for production use
- Optimize database queries if needed

### Deployment Commands Quick Reference

\`\`\`bash
# View current config
heroku config

# Set individual config vars
heroku config:set KEY=value

# View logs
heroku logs --tail

# Restart app
heroku restart

# Run commands on Heroku
heroku run <command>

# Scale dynos (for paid plans)
heroku ps:scale web=1
\`\`\`

## Backend Integration Notes

- All API calls expect JWT authentication via Authorization header
- League ID must be included in most API endpoints
- CORS must be configured to allow frontend domain
- Date formats should be ISO 8601 strings
- Error responses should include meaningful error messages
- Pagination may be needed for large datasets

## Future Enhancements

- League creation and management UI
- Invitation system for joining leagues
- Real-time updates via WebSockets
- Push notifications for game results
- Advanced statistics and analytics
- Mobile app version
- Social features (comments, trash talk)
- Cross-league tournaments
