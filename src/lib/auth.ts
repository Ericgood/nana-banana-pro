import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import * as schema from './schema';

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    _auth = betterAuth({
      baseURL: import.meta.env.BETTER_AUTH_URL || 'http://localhost:4321',
      secret: import.meta.env.BETTER_AUTH_SECRET,
      database: drizzleAdapter(db, {
        provider: 'sqlite',
        schema,
      }),
      emailAndPassword: {
        enabled: true,
      },
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
