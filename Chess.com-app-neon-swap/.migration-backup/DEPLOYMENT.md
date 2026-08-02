# Production Deployment Guide

## Vercel Deployment

> Note: Vercel Functions do **not** support long-lived WebSocket connections, so Socket.IO
> realtime multiplayer must be hosted elsewhere. You can still deploy the Vite frontend
> (and optional HTTP APIs) on Vercel.

### Environment Variables

Set these environment variables in Vercel project settings:

1. **DATABASE_URL** - PostgreSQL connection string
   ```
   postgresql://user:password@host:5432/dbname?sslmode=require
   ```

2. **FRONTEND_URL** - Your frontend URL
   - Set this to your Vercel URL or custom domain

3. **MISTRAL_API_KEY** - Required for coaching endpoints

4. **VITE_API_URL** - Backend URL for client-side API calls
   - Use `/api` if deploying HTTP API routes on Vercel
   - Use `https://your-backend.example.com/api` if backend is hosted elsewhere

5. **VITE_SOCKET_URL** - Socket.IO server base URL (required for multiplayer)
   - Use the external backend host (ex: `https://your-backend.example.com`)
   - Do not include `/socket.io` in this value

6. **VITE_SOCKET_PATH** - Socket.IO path (optional, default `/socket.io`)

### Configuration Files

**vercel.json** - Main deployment configuration
```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "installCommand": "npm ci",
  "framework": null,
  "functions": {
    "api/**/*.js": {
      "runtime": "nodejs20.x"
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Deployment Steps

1. **Prepare Database**
   ```bash
   # Create PostgreSQL database
   # Run setup script
   psql -d chess_db -f server/setup-db.sql
   ```

2. **Commit Configuration Changes**
   ```bash
   git add vercel.json package.json DEPLOYMENT.md
   git commit -m "Fix deployment configuration for Vercel"
   ```

3. **Push to GitHub**
   ```bash
   git push origin main
   ```

4. **Import to Vercel**
   - Go to vercel.com and import the repository
   - Select main branch as the branch to deploy
   - Configure environment variables

5. **Deploy**
   - Click "Deploy"
   - Vercel will automatically detect the build configuration

### Health Check Endpoint

The deployed API (if enabled) will have a health check at:
```
https://your-project.vercel.app/api/health
```

### Testing Deployment

1. **Verify API routes work**
   ```bash
   curl https://your-project.vercel.app/health
   ```

2. **Verify static files load**
   - Open https://your-project.vercel.app in browser

3. **Test WebSocket connection**
   - The Socket.io client will connect to your external backend host
   - Example:
   ```
   wss://your-backend.example.com/socket.io/
   ```

## Troubleshooting

### Database Connection Errors
- Ensure DATABASE_URL is set correctly with SSL mode
- Check PostgreSQL connection settings

### WebSocket Connection Fails
- Verify CORS settings in server/index.js
- Ensure VITE_SOCKET_URL is set correctly
- Check firewall rules allow WebSocket connections

### 404 on Static Files
- Verify vercel.json routing is correct
- Check that build outputs are in `dist/` directory
- Ensure vite.config.js outputs to `dist/`

### API Routes Return 404
- Check that `/api/*` routes are defined before SPA fallback
- Verify server/index.js exports correct middleware

## Production Optimizations

1. **Environment Variables**
   - Set `NODE_ENV=production` (automatic in Vercel)
   - Use secrets for sensitive data (DATABASE_URL)

2. **Build Configuration**
   - Vite is configured with chunk splitting for better performance
   - Static files are cached for 1 year in production

3. **CORS Configuration**
   - CORS is set to allow only your frontend URL in production
   - Credentials are enabled for cookie-based auth

4. **Socket.io**
   - Uses WebSocket + polling fallback
   - CORS configured for production origins
