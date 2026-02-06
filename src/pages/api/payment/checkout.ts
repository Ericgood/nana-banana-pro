import type { APIRoute } from 'astro';
import { getStripe } from '../../../lib/stripe';
import { getPlanById } from '../../../lib/pricing';
import { auth } from '../../../lib/auth';
import { db } from '../../../lib/db';
import { order } from '../../../lib/schema';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Verify auth
    const sessionData = await auth.api.getSession({ headers: request.headers });
    if (!sessionData?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { planId } = await request.json();
    if (!planId) {
      return new Response(JSON.stringify({ error: 'planId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const plan = getPlanById(planId);
    if (!plan || plan.priceInCents === 0) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripe = getStripe();
    const orderNo = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const origin = new URL(request.url).origin;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: plan.priceInCents,
            product_data: {
              name: `${plan.name} - ${plan.credits} Credits`,
              description: plan.description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_no: orderNo,
        user_id: sessionData.user.id,
        plan_id: plan.id,
        credits_amount: plan.credits.toString(),
      },
      success_url: `${origin}/payment/success?order_no=${orderNo}`,
      cancel_url: `${origin}/payment/cancel`,
    });

    if (!session.url) {
      return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Save order to database
    const orderId = crypto.randomUUID();
    await db.insert(order).values({
      id: orderId,
      orderNo,
      userId: sessionData.user.id,
      status: 'pending',
      amount: plan.priceInCents,
      currency: 'usd',
      productId: plan.id,
      creditsAmount: plan.credits,
      paymentSessionId: session.id,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return new Response(JSON.stringify({ error: 'Checkout failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
