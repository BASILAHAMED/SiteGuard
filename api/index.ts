import { createApp } from '../src/server/app.ts';

// Vercel Node serverless entry point. Static assets (the Vite build output
// in dist/) are served directly by Vercel's CDN per vercel.json's rewrites
// -- this function only ever receives /api/* requests.
//
// NOTE: in-memory state (siteGuardStore) is per-instance on serverless;
// see the comment in src/server/app.ts for what that means for the demo.
const app = createApp();

export default app;
