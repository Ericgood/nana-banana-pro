import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';
import { getUserCredits, ensureFreeCredits } from '../../../lib/credits';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const sessionData = await auth.api.getSession({ headers: request.headers });
    if (!sessionData?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Ensure free credits are granted for new users
    await ensureFreeCredits(sessionData.user.id);

    const credits = await getUserCredits(sessionData.user.id);

    return new Response(JSON.stringify({ credits }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Credits balance error:', error);
    return new Response(JSON.stringify({ error: 'Failed to get credit balance' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
