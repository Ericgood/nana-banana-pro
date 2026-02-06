import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { db } from '../../../lib/db';
import { order } from '../../../lib/schema';
import { grantCredits } from '../../../lib/credits';
import { eq } from 'drizzle-orm';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const stripe = getStripe();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const webhookSecret =
    import.meta.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  let event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const orderNo = session.metadata?.order_no;
    const userId = session.metadata?.user_id;
    const creditsAmount = parseInt(session.metadata?.credits_amount || '0');

    if (!orderNo || !userId || creditsAmount <= 0) {
      console.error('Missing metadata in checkout session:', session.metadata);
      return new Response('Missing metadata', { status: 400 });
    }

    // Check if order exists and is still pending
    const [existingOrder] = await db
      .select()
      .from(order)
      .where(eq(order.orderNo, orderNo))
      .limit(1);

    if (!existingOrder) {
      console.error('Order not found:', orderNo);
      return new Response('Order not found', { status: 404 });
    }

    if (existingOrder.status === 'paid') {
      // Already processed (idempotency)
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update order status
    await db
      .update(order)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paymentSessionId: session.id,
      })
      .where(eq(order.orderNo, orderNo));

    // Grant credits
    await grantCredits(
      userId,
      creditsAmount,
      orderNo,
      `Purchased ${creditsAmount} credits`
    );

    console.log(`Order ${orderNo} paid. Granted ${creditsAmount} credits to user ${userId}`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
