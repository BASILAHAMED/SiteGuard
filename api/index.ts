// Vercel serverless entrypoint. Vercel's Node runtime accepts a default-exported
// (req, res) handler; an Express app satisfies that signature directly.
// Static assets (the Vite build output) are served by Vercel's CDN per
// vercel.json's outputDirectory + rewrites, not through this function.
import { createApp } from '../src/server/app.ts';

const app = createApp();

export default app;
