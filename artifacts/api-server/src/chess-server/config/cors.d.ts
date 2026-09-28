// Type declarations for the plain-JS `cors.js` module next to this file.
// The api-server compiles with `allowJs` disabled (see tsconfig.base.json) and
// `noImplicitAny` on, so TypeScript cannot infer types for this JavaScript
// module and `app.ts` fails with TS7016 on its static import. These declarations
// describe the real shape of the exported object.
import type { CorsOptions } from "cors";

export const corsOptions: CorsOptions;
