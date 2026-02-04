# Production Deployment Guide

## Vercel Deployment

### Environment Variables

Set these environment variables in Vercel project settings:

1. **DATABASE_URL** - PostgreSQL connection string
   ```
   postgresql://user:password@host:5432/dbname?sslmode=require
   ```

2. **FRONTEND_URL** - Your frontend URL (default: https://your-domain.com)
   - Set this to your Vercel URL or custom domain

3. **SERVER_PORT** - Server port (default: 3001)

4. **VITE_SERVER_URL** - Backend URL for client-side API calls
   - Use `https://your-project.vercel.app` or your custom domain

### Configuration Files

**vercel.json** - Main deployment configuration (already fixed)
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/index.js",
      "use": "@vercel/node"
    },
    {
      "src": "vite.config.js",
      "use": "@vercel/vitejs"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/server/index.js"
    },
    {
      "src": "/socket.io/(.*)",
      "dest": "/server/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "/dist/$1"
    }
  ],
  "env": {
    "NODE_ENV": "production",
    "VITE_SERVER_URL": "https://your-project.vercel.app"
  }
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

The deployed app will have a health check at:
```
https://your-project.vercel.app/health
```

### Testing Deployment

1. **Verify API routes work**
   ```bash
   curl https://your-project.vercel.app/health
   ```

2. **Verify static files load**
   - Open https://your-project.vercel.app in browser

3. **Test WebSocket connection**
   - The Socket.io client will connect to:
   ```
   wss://your-project.vercel.app/socket.io/
   ```

## Troubleshooting

### Database Connection Errors
- Ensure DATABASE_URL is set correctly with SSL mode
- Check PostgreSQL connection settings

### WebSocket Connection Fails
- Verify CORS settings in server/index.js
- Ensure VITE_SERVER_URL is set correctly
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
