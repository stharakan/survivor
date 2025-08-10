# Survivor League Scoring HTTP Client

HTTP client script that triggers scoring calculation via the Next.js API endpoint instead of direct database access.

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

## Migration from Database Script

If you were using the old MongoDB-direct script:

1. **Old approach**: Direct MongoDB connection with `MONGODB_URI`
2. **New approach**: HTTP API calls with `SCORING_API_KEY`
3. **Benefits**: 
   - No MongoDB connection string needed in cron environment
   - Centralized logic in API endpoint
   - Better security with API key authentication
   - Easier to monitor and debug via HTTP logs