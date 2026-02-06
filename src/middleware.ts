import { defineMiddleware } from 'astro:middleware';
import { getAuth } from './lib/auth';

const protectedRoutes = ['/generate'];

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;

  // Skip session check for API routes and static assets
  if (pathname.startsWith('/api/') || pathname.startsWith('/_')) {
    return next();
  }

  // Try to get session for all page routes (for Header user display)
  let sessionData = null;
  try {
    sessionData = await getAuth().api.getSession({
      headers: context.request.headers,
    });
  } catch {
    // Auth may not be available during build-time prerendering
    return next();
  }

  if (sessionData) {
    context.locals.user = sessionData.user;
    context.locals.session = sessionData.session;
  }

  // Redirect to login for protected routes if not authenticated
  if (protectedRoutes.includes(pathname) && !sessionData) {
    return context.redirect('/login');
  }

  return next();
});
