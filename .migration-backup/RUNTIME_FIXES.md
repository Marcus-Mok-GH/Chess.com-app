# Deployment Fixes - Replit

## Issues Fixed

### 1. package.json Syntax Error
**Issue:** Missing comma after `"start:vite"` script on line 34.

**Fix:** Added missing comma to separate scripts.

```json
"start:vite": "vite preview --port 5173 --host",
"start:all": "npm run start:server & npm run start:vite & wait",
```

### 2. .replit Configuration
**Issue:**
- Deployment target set to "cloudrun" which doesn't work with Replit
- Port mismatch (externalPort 80 vs server port 3001)
- Incomplete environment variables

**Fix:**
```ini
# Changed deployment target from cloudrun to replit
deploymentTarget = "replit"
runtime = "nodejs20"

# Removed duplicate port definitions

# Added proper environment variables for production
[env]
PORT = "3001"
DATABASE_URL = "postgresql://username:password@host:5432/database?sslmode=require"
NODE_ENV = "production"
FRONTEND_URL = "http://localhost:3001"
VITE_SERVER_URL = "http://localhost:3001"
```

### 3. Dockerfile Created
**Issue:** No Dockerfile for containerization.

**Fix:** Created multi-stage Dockerfile that:
- Builds frontend with Vite
- Builds backend with Express
- Creates optimized production image
- Uses non-root user for security
- Includes health check

### 4. Environment Variables
**Issue:** Missing Replit-specific environment variables support.

**Fix:** Updated `server/index.js` to support Replit URLs:
```javascript
const FRONTEND_URL = process.env.FRONTEND_URL || (isProduction ? process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.NETLIFY_URL
    ? `https://${process.env.NETLIFY_URL}`
    : process.env.REPL_SLUG
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : 'https://your-domain.com'
  : 'http://localhost:5173');
```

### 5. vercel.json Updated
**Issue:** VITE_SERVER_URL hardcoded to example domain.

**Fix:** Changed to use Vercel's `@vercel/project-url` variable for dynamic URL generation.

### 6. Next.js Compatibility
**Issue:** Both Next.js and Vite configurations existed, causing conflicts.

**Fix:** Simplified by using Vite as the main build tool and disabling Next.js. Removed unnecessary Next.js files.

## How to Deploy to Replit

1. **Import your repository to Replit**
   - Go to https://replit.com and import this project
   - Select Node.js template (or use the existing configuration)

2. **Set environment variables**
   - In Replit, go to Settings → Repl Secrets
   - Set `DATABASE_URL` to your PostgreSQL connection string
   - Set `NODE_ENV` to `production`

3. **Deploy**
   - Click "Deploy" button in Replit
   - The deployment will use the updated `.replit` configuration

## How to Deploy to Vercel

1. **Set environment variables in Vercel dashboard**
   - `DATABASE_URL` - PostgreSQL connection string
   - `FRONTEND_URL` - Your frontend URL
   - `VITE_SERVER_URL` - Set to `@vercel/project-url` (automatic)

2. **Deploy**
   - Import the repository to Vercel
   - Click "Deploy"

## Health Check Endpoints

- **Backend Health:** `/api/health` - Returns status and database connection info
- **Frontend Health:** `/health` - Simple health check

## Troubleshooting

### Deployment Timeout
If deployment times out:
1. Check that all environment variables are set correctly
2. Ensure the `.replit` file is saved
3. Verify the Dockerfile syntax is valid

### Database Connection Errors
- Ensure `DATABASE_URL` includes `sslmode=require`
- Check PostgreSQL service is running

### WebSocket Connection Issues
- Ensure `VITE_SERVER_URL` is set correctly
- Check CORS settings in server/index.js
