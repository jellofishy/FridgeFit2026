import { json } from '../lib/anthropic.mjs';

// Lets the app show "AI connected" vs "add your key" without exposing anything secret.
export default async () =>
  json({ ok: true, ai: Boolean(process.env.ANTHROPIC_API_KEY), accessCodeRequired: Boolean(process.env.ACCESS_CODE) });
