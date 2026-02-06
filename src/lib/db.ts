import { drizzle } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import * as schema from './schema';

let _client: Client | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: import.meta.env.DATABASE_URL || 'file:./data/nana-banana.db',
      authToken: import.meta.env.DATABASE_AUTH_TOKEN || undefined,
    });
  }
  return _client;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = drizzle(getClient(), { schema });
    }
    return Reflect.get(_db, prop, receiver);
  },
});
