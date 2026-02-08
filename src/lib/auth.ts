import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTap } from 'better-auth/plugins';
import { db } from './db';
import * as schema from './schema';

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    const googleClientId = import.meta.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = import.meta.env.GOOGLE_CLIENT_SECRET;

    _auth = betterAuth({
      baseURL: import.meta.env.BETTER_AUTH_URL || 'http://localhost:4321',
      secret: import.meta.env.BETTER_AUTH_SECRET,
      database: drizzleAdapter(db, {
        provider: 'pg',
        schema,
      }),
      emailAndPassword: {
        enabled: true,
      },
      socialProviders: {
        ...(googleClientId && googleClientSecret
          ? {
              google: {
                clientId: googleClientId,
                clientSecret: googleClientSecret,
              },
            }
          : {}),
      },
      plugins: [
        ...(googleClientId ? [oneTap()] : []),
      ],
      session: {
        cookieCache: {
          enabled: true,
          maxAge: 5 * 60,
        },
      },
    });
  }
  return _auth;
}

// Lazy proxy so `import { auth }` works without eagerly initializing
type AuthInstance = ReturnType<typeof betterAuth>;
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    const instance = getAuth();
    return Reflect.get(instance, prop, receiver);
  },
});
