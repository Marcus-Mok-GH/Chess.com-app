# AI Coach Integration with Mistral AI

This document describes the AI coach functionality integrated into the chess application using Mistral AI (model: `mistral-large-latest`) through the server API.

## Overview

The AI coach provides:
- Move-by-move feedback
- Explanations for the coach's moves
- Full game analysis and reviews

## Architecture

### Components
- `src/components/GameAnalysis.jsx` - Main AI coach interface
- `src/engine/coach/coachAI.js` - Client API wrapper for coach endpoints
- `server/routes/coach.js` - Mistral AI integration and prompt logic
- `public/test-coach.html` - Manual testing interface for coach endpoints

### Dependencies
- Mistral AI API (`https://api.mistral.ai/v1/chat/completions`)
- Express + Fetch on the server
- React (Vite client)

## Implementation Details

### Server Integration
The server calls Mistral AI with a system prompt and task-specific instructions.
Key configuration lives in `server/routes/coach.js`:
- `COACH_MODEL = 'mistral-large-latest'`
- Requires `MISTRAL_API_KEY`

### Endpoints
All endpoints are mounted at `/api/coach`:
- `GET /status` - Health check, returns availability + model
- `POST /feedback` - Player move feedback
- `POST /explain` - Explanation for coach's move
- `POST /analyze` - Game analysis with per-move reviews
  - Send `stream: true` in the request body to enable SSE streaming
- `POST /dialogue` - Short bot dialogue lines (persona-aware)
  - Send `stream: true` in the request body to enable SSE streaming

### Client Usage
The UI calls the endpoints through `src/engine/coach/coachAI.js`:
- `isCoachAIAvailable()`
- `getCoachingFeedback(fen, move, history)`
- `explainCoachMove(fenBefore, move, fenAfter)`
- `analyzeGame(moveHistory, result, gameId)`
  - Pass a streaming callback as the last argument to enable token streaming
- `getBotDialogue(payload)`

## Testing

### Manual Test Page
Open the test page at:
```
http://localhost:5173/test-coach.html
```

### Test Features
1. **Move Feedback** - Provide FEN + move for quick coaching
2. **Explain Coach Move** - Explain a move with before/after FENs
3. **Game Analysis** - Submit SAN/UCI move history for full review
4. **Status Check** - Confirms Mistral API availability

## Troubleshooting

### Common Issues

1. **Coach unavailable**
   - Ensure `MISTRAL_API_KEY` is configured on the server
   - Check `/api/coach/status` response

2. **API errors (401/403/429)**
   - Verify key validity and quota
   - Confirm billing/limits on the Mistral account

3. **Network failures**
   - Check server connectivity to `api.mistral.ai`
   - Inspect server logs for detailed error output

### Debug Tips
- Server logs include `[Coach]` tags for errors
- Use the test page to isolate API vs UI issues

## Environment Variables

Required:
- `MISTRAL_API_KEY` - Mistral API key used by the server

## Security Considerations

- API calls are server-side; the key is never exposed to the client
- Game data is sent to Mistral for analysis

## Performance

- Feedback and explanations stream for faster UX
- Token usage scales with move count for game analysis

## Future Enhancements

- [ ] Streaming parsing for structured analysis output
- [ ] Analysis depth controls
- [ ] Position-specific deep dives
- [ ] Opening repertoire suggestions

## Support

For AI coach issues:
1. Check `/api/coach/status`
2. Use `/test-coach.html` to validate endpoints
3. Inspect server logs for Mistral API errors
