import { db } from './db';
import { credit } from './schema';
import { eq, and, sum, gt } from 'drizzle-orm';

const FREE_CREDITS = 5;

export async function getUserCredits(userId: string): Promise<number> {
  const [result] = await db
    .select({
      total: sum(credit.remainingCredits),
    })
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, 'grant'),
        gt(credit.remainingCredits, 0)
      )
    );

  return parseInt(result?.total || '0');
}

export async function grantCredits(
  userId: string,
  amount: number,
  orderNo?: string,
  description?: string
): Promise<void> {
  const id = crypto.randomUUID();
  await db.insert(credit).values({
    id,
    userId,
    transactionType: 'grant',
    credits: amount,
    remainingCredits: amount,
    description: description || `Granted ${amount} credits`,
    orderNo: orderNo || null,
  });
}

export async function consumeCredit(userId: string): Promise<boolean> {
  const balance = await getUserCredits(userId);
  if (balance <= 0) {
    return false;
  }

  // Find the oldest grant record with remaining credits (FIFO)
  const [grantRecord] = await db
    .select()
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, 'grant'),
        gt(credit.remainingCredits, 0)
      )
    )
    .orderBy(credit.createdAt)
    .limit(1);

  if (!grantRecord) {
    return false;
  }

  // Deduct 1 from remaining credits on the grant record
  await db
    .update(credit)
    .set({ remainingCredits: grantRecord.remainingCredits - 1 })
    .where(eq(credit.id, grantRecord.id));

  // Create a consume record
  const id = crypto.randomUUID();
  await db.insert(credit).values({
    id,
    userId,
    transactionType: 'consume',
    credits: -1,
    remainingCredits: 0,
    description: 'Image generation',
  });

  return true;
}

export async function ensureFreeCredits(userId: string): Promise<void> {
  // Check if user already has any credit records
  const [existing] = await db
    .select({ total: sum(credit.credits) })
    .from(credit)
    .where(
      and(
        eq(credit.userId, userId),
        eq(credit.transactionType, 'grant')
      )
    );

  // Only grant free credits if user has never received any grants
  if (!existing?.total || parseInt(existing.total) === 0) {
    await grantCredits(userId, FREE_CREDITS, undefined, 'Welcome bonus - free credits');
  }
}
