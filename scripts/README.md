# Survivor League Scripts

This directory contains utility scripts for managing the Survivor League application.

## Available Scripts

### 1. Scoring Calculation (`calculate-scores.js`)
HTTP client script that triggers scoring calculation via the Next.js API endpoint instead of direct database access.

### 2. EPL Fixture Import (`import-epl-2025-fixtures.ts`)
Import script for populating the database with EPL 2025/2026 season fixtures from Football Data API.

### 3. Database Initialization (`init-db.ts`)
Script for initializing the database with sample data for testing purposes.

### 4. EPL League Creation (`create-epl-league.ts`)
Script for creating an EPL 2025/2026 survivor league with designated admin user.

### 5. Game Score Update (`update-game-scores.js`)
HTTP client script that triggers automated game status and score updates using hybrid approach with Football Data API.

## Features

- ✅ Calls scoring calculation API endpoint remotely
- ✅ API key authentication for secure access
- ✅ Comprehensive error handling and logging
- ✅ Idempotent - safe to run multiple times
- ✅ Zero dependencies (uses Node.js built-in fetch)
- ✅ Cron job compatible

## Quick Start

### 1. Set Environment Variables

The script requires API key authentication:

```bash
export SCORING_API_KEY="your-api-key-here"
export API_BASE_URL="http://localhost:3000"  # Optional, defaults to localhost:3000
```

### 2. Run the Script

```bash
node calculate-scores.js
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCORING_API_KEY` | **Yes** | None | API key for authentication |
| `API_BASE_URL` | No | `http://localhost:3000` | Base URL of the Next.js API server |

## API Key Setup

### Development
1. Generate an API key:
   ```bash
   openssl rand -base64 32
   ```

2. Add to your `.env.local`:
   ```bash
   SCORING_API_KEY=your-generated-api-key-here
   ```

3. Export for the script:
   ```bash
   export SCORING_API_KEY="your-generated-api-key-here"
   ```

### Production (Heroku)
Set the environment variable in your deployment:
```bash
heroku config:set SCORING_API_KEY="$(openssl rand -base64 32)"
```

## Cron Job Setup

### Option 1: System Cron
```bash
# Run every 15 minutes
*/15 * * * * cd /path/to/script && SCORING_API_KEY="your-key" API_BASE_URL="https://your-app.herokuapp.com" node calculate-scores.js >> /var/log/survivor-scoring.log 2>&1
```

### Option 2: CronJS Service
Many platforms support cron jobs with environment variables:

**Heroku Scheduler:**
```bash
SCORING_API_KEY="your-key" API_BASE_URL="https://your-app.herokuapp.com" node scripts/calculate-scores.js
```

**GitHub Actions:**
```yaml
name: Scoring Calculation
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
jobs:
  score-calculation:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - name: Run scoring calculation
      env:
        SCORING_API_KEY: ${{ secrets.SCORING_API_KEY }}
        API_BASE_URL: ${{ vars.API_BASE_URL }}
      run: node scripts/calculate-scores.js
```

### Option 3: Docker Container
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY scripts/calculate-scores.js ./
ENV API_BASE_URL="https://your-app.herokuapp.com"
CMD ["node", "calculate-scores.js"]
```

## API Endpoint

The script calls the following API endpoint:
- **URL**: `POST /api/admin/recompute-scores`
- **Authentication**: `X-API-Key` header
- **Response**: JSON with execution summary

### Example API Response:
```json
{
  "success": true,
  "data": {
    "picksUpdated": 5,
    "membershipsUpdated": 12,
    "executionTime": 2,
    "completedAt": "2025-08-10T20:08:02.395Z"
  },
  "message": "Scoring calculation completed successfully"
}
```

## Scoring Rules

The API applies these scoring rules:
- **Win**: 3 points
- **Draw/Tie**: 1 point  
- **Loss**: 0 points + 1 strike

## Logging Output

```
[2025-08-10T20:08:00.952Z] === Scoring Calculation HTTP Client Started ===
[2025-08-10T20:08:00.952Z] API Endpoint: http://localhost:3000/api/admin/recompute-scores
[2025-08-10T20:08:02.395Z] === Scoring Calculation HTTP Client Completed Successfully ===
[2025-08-10T20:08:02.395Z] API Response Summary:
[2025-08-10T20:08:02.395Z]   • 0 pick results updated
[2025-08-10T20:08:02.395Z]   • 0 league memberships updated
[2025-08-10T20:08:02.395Z]   • API execution time: 1 seconds
[2025-08-10T20:08:02.395Z]   • Total client time: 2 seconds
[2025-08-10T20:08:02.395Z]   • Completed at: 2025-08-10T20:08:02.395Z
[2025-08-10T20:08:02.395Z] Script completed successfully
```

## Error Handling

The script handles various error scenarios:

### Missing API Key
```
[2025-08-10T20:08:00.952Z] ERROR: SCORING_API_KEY environment variable is required
[2025-08-10T20:08:00.952Z] Set it using: export SCORING_API_KEY="your-api-key"
```

### Authentication Failure
```
[2025-08-10T20:08:01.234Z] === Scoring Calculation HTTP Client Failed ===
[2025-08-10T20:08:01.234Z] Error: API request failed: 401 Unauthorized - Invalid or missing API key
```

### Network/Connection Issues
```
[2025-08-10T20:08:01.234Z] === Scoring Calculation HTTP Client Failed ===
[2025-08-10T20:08:01.234Z] Error: fetch failed
[2025-08-10T20:08:01.234Z] Network Error: Unable to connect to API at http://localhost:3000
[2025-08-10T20:08:01.234Z] Make sure the API server is running and accessible
```

## Security Considerations

- **API Key**: Keep your API key secure and never commit it to version control
- **HTTPS**: Use HTTPS in production to encrypt API key transmission
- **Environment Variables**: Store API keys in environment variables, not in code
- **Access Control**: The API key should only be known by authorized systems

## Troubleshooting

### Script fails with "SCORING_API_KEY required"
Make sure you've exported the environment variable:
```bash
export SCORING_API_KEY="your-api-key-here"
```

### Script fails with "401 Unauthorized"
- Check that your API key matches the one set in the server
- Ensure the server has `SCORING_API_KEY` environment variable set

### Script fails with connection errors
- Verify the API server is running
- Check that `API_BASE_URL` points to the correct server
- Ensure network connectivity between client and server

### Script runs but no data is updated
This is normal if:
- No games have completed since last run
- All pick results are already calculated
- All member scores are up to date

The script is idempotent and safe to run multiple times.

## Dependencies

- **Node.js**: >=18.0.0 (for built-in fetch support)
- **No npm packages required** (uses only Node.js built-ins)

---

# EPL Fixture Import Script

Import EPL 2025/2026 season fixtures from Football Data API into the database.

## Features

- ✅ Fetches all 380 EPL fixtures for 2025/2026 season
- ✅ Comprehensive team ID mapping (Football Data API ↔ Database)
- ✅ Safe to re-run - deletes existing season data before import
- ✅ Rate limiting for API requests (respects Football Data limits)
- ✅ Comprehensive error handling and logging
- ✅ Data validation and transformation
- ✅ Week assignment based on EPL matchdays

## Quick Start

### 1. Set Environment Variables

The script requires Football Data API access:

```bash
export FOOTBALLDATA_API_KEY="your-football-data-api-key"
export MONGODB_URI="mongodb://localhost:27017"  # or your MongoDB connection string
export MONGODB_DB_NAME="survivor-league"
```

### 2. Run the Script

```bash
npx tsx scripts/import-epl-2025-fixtures.ts
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FOOTBALLDATA_API_KEY` | **Yes** | None | Football Data API authentication token |
| `MONGODB_URI` | **Yes** | None | MongoDB connection string |
| `MONGODB_DB_NAME` | No | `survivor-league` | MongoDB database name |

## Football Data API Setup

### Getting an API Key
1. Register at [https://www.football-data.org/](https://www.football-data.org/)
2. Generate a free API key (10 requests/minute limit)
3. Add to your `.env.local`:
   ```bash
   FOOTBALLDATA_API_KEY=your-api-key-here
   ```

### API Limits
- **Free Tier**: 10 requests per minute
- **Rate Limiting**: Script automatically handles delays between requests
- **Coverage**: EPL fixtures for current and upcoming seasons

## Script Behavior

### Data Import Process
1. **Validation**: Checks required environment variables
2. **Deletion**: Removes all existing EPL 2025/2026 games from database
3. **Fetching**: Retrieves all season fixtures from Football Data API
4. **Transformation**: Maps API data to database schema
5. **Import**: Inserts transformed games into MongoDB

### Team ID Mapping
The script maintains a mapping between Football Data team IDs and internal database IDs:

```javascript
const teamMapping = {
  57: 1,    // Arsenal
  58: 2,    // Aston Villa
  1044: 3,  // Bournemouth
  // ... etc for all 20 EPL teams
};
```

### Database Schema
Games are stored with the following structure:
- `_id`: MongoDB ObjectId (auto-generated)
- `id`: Sequential numerical ID (using getNextGameId())
- `week`: EPL matchday (1-38)
- `homeTeamId` / `awayTeamId`: Internal team IDs (1-20)
- `date`: Game date/time
- `sportsLeague`: "EPL"
- `season`: "2025/2026"
- `status`: "not_started" (initially)

## Logging Output

```
[2025-08-12T10:30:00.000Z] === EPL 2025/2026 Fixture Import Started ===
[2025-08-12T10:30:01.000Z] Deleting existing EPL 2025/2026 games...
[2025-08-12T10:30:01.100Z] ✓ Deleted 380 existing EPL 2025/2026 games
[2025-08-12T10:30:02.000Z] Fetching EPL 2025/2026 fixtures from Football Data API...
[2025-08-12T10:30:03.000Z] Successfully fetched 380 fixtures from API
[2025-08-12T10:30:04.000Z] Transforming and importing fixtures to database...
[2025-08-12T10:30:05.000Z] ✓ Successfully imported 380 games to database
[2025-08-12T10:30:05.100Z] Import summary by week:
[2025-08-12T10:30:05.100Z]   Week 1: 10 games
[2025-08-12T10:30:05.100Z]   Week 2: 10 games
[2025-08-12T10:30:05.100Z]   ... (continues for all 38 weeks)
[2025-08-12T10:30:05.200Z] === EPL 2025/2026 Fixture Import Completed Successfully ===
[2025-08-12T10:30:05.200Z] Import Summary:
[2025-08-12T10:30:05.200Z]   • 380 existing games deleted
[2025-08-12T10:30:05.200Z]   • 380 fixtures fetched from API
[2025-08-12T10:30:05.200Z]   • 380 games imported to database
[2025-08-12T10:30:05.200Z]   • 0 transformation errors
[2025-08-12T10:30:05.200Z]   • Total execution time: 5 seconds
[2025-08-12T10:30:05.200Z] Script completed successfully
```

## Error Handling

### Missing API Key
```
[2025-08-12T10:30:00.000Z] ERROR: FOOTBALLDATA_API_KEY environment variable is required
[2025-08-12T10:30:00.000Z] Set it using: export FOOTBALLDATA_API_KEY="your-api-key"
```

### API Request Failures
```
[2025-08-12T10:30:02.000Z] === EPL 2025/2026 Fixture Import Failed ===
[2025-08-12T10:30:02.000Z] Error: API request failed: 401 Unauthorized - Invalid API key
```

### Team Mapping Errors
```
[2025-08-12T10:30:04.000Z] WARNING: 1 fixtures could not be transformed:
[2025-08-12T10:30:04.000Z]   ✗ Unknown Team vs Arsenal: Unknown team ID mapping: Home 999 (Unknown Team)
```

## When to Run

### Season Preparation
- Run once before the EPL 2025/2026 season starts
- Typically around July/August when fixtures are released
- Can be re-run if fixture changes occur

### During Season
- Generally not needed once season starts
- Can be re-run if major fixture changes occur (rare)
- Script will safely replace all season data

## Safety Features

### Idempotent Operation
- Safe to run multiple times
- Completely replaces existing season data
- No duplicate games created

### Data Validation
- Validates all required team mappings
- Checks API response format
- Verifies database connection before deletion

### Error Recovery
- Stops execution on critical errors
- Comprehensive logging for debugging
- Clear error messages with resolution steps

## Troubleshooting

### Script fails with "FOOTBALLDATA_API_KEY required"
Make sure you've exported the environment variable:
```bash
export FOOTBALLDATA_API_KEY="your-api-key-here"
```

### Script fails with "401 Unauthorized"
- Check that your API key is valid and active
- Ensure no extra spaces or characters in the key
- Verify the key hasn't expired

### Script fails with connection errors
- Verify MongoDB is running and accessible
- Check `MONGODB_URI` environment variable
- Ensure database permissions are correct

### Team mapping errors
- Usually indicates new teams in EPL (promotions/relegations)
- Update the `teamMapping` object with new team IDs
- Check Football Data API documentation for team ID changes

### Rate limiting issues
- Script automatically handles rate limits with 6-second delays
- If still hitting limits, check for other API usage
- Consider upgrading to paid Football Data API tier

## Dependencies

- **Node.js**: >=18.0.0 (for built-in fetch support)
- **TypeScript**: For script execution (npx tsx)
- **MongoDB**: Database connection
- **Football Data API**: External data source

---

# Database Initialization Script

Script for setting up initial database state with sample data for testing.

## Migration from Database Script

If you were using the old MongoDB-direct script:

1. **Old approach**: Direct MongoDB connection with `MONGODB_URI`
2. **New approach**: HTTP API calls with `SCORING_API_KEY`
3. **Benefits**: 
   - No MongoDB connection string needed in cron environment
   - Centralized logic in API endpoint
   - Better security with API key authentication
   - Easier to monitor and debug via HTTP logs

---

# EPL League Creation Script

Script for creating an EPL 2025/2026 survivor league with a designated admin user.

## Features

- ✅ Finds existing user by email address
- ✅ Creates EPL 2025/2026 survivor league 
- ✅ Assigns user as league administrator
- ✅ Idempotent - safe to run multiple times
- ✅ Comprehensive error handling and logging

## Quick Start

### 1. Set Environment Variables

```bash
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DB_NAME="survivor-league"  # Optional
```

### 2. Run the Script

```bash
npx tsx --env-file=.env.local scripts/create-epl-league.ts
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | **Yes** | None | MongoDB connection string |
| `MONGODB_DB_NAME` | No | `survivor-league` | MongoDB database name |

## Script Behavior

The script will:
1. Find existing user with email `sameer.tharakan@gmail.com`
2. Create EPL 2025/2026 league (if it doesn't exist)
3. Assign user as league administrator

## Dependencies

- **Node.js**: >=18.0.0
- **TypeScript**: For script execution (npx tsx)
- **MongoDB**: Database connection

---

# Game Score Update Script

Updates game statuses and scores from Football Data API using hybrid approach.

## Features

- ✅ Fetches game updates from Football Data API (today → +1 week)
- ✅ Detects overdue games missed by time-window queries
- ✅ Smart individual API calls only when needed
- ✅ Triggers score recalculation for completed games with picks
- ✅ Rate limiting compliant (10 requests/minute)
- ✅ Cron job compatible

## Usage

```bash
export SCORING_API_KEY="your-api-key"
export FOOTBALLDATA_API_KEY="your-football-data-key"
node update-game-scores.js
```

## Cron Setup (Every 3 hours)

```bash
0 */3 * * * cd /path/to/script && SCORING_API_KEY="key" FOOTBALLDATA_API_KEY="key" node update-game-scores.js >> /var/log/game-updates.log 2>&1

---

## test-external-api.ts

Tests the Football Data API using the same configuration as the game updater.

**Usage:**
```bash
npx dotenv-cli -e .env.local npx tsx scripts/test-external-api.ts
```

**Output:**
Date, gameweek, teams, scores, and status for matches in the configured date range.
```