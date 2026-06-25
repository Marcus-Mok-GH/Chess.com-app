import { toNodeHandler } from 'better-auth/node';
import { neonAuth } from '../services/neonAuth.js';

// Better Auth's official Node.js/Express adapter.
// toNodeHandler handles the Web Fetch API ↔ Node.js req/res conversion
// internally — no manual body/header marshalling needed.
//
// IMPORTANT: this handler must be mounted BEFORE express.json() in server/index.js.
// express.json() consumes the request body stream; if it runs first, Better Auth
// has nothing to read and the auth client hangs on "pending".
export const neonAuthProxy = toNodeHandler(neonAuth);
