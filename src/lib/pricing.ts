export interface PricingPlan {
  id: string;
  name: string;
  price: number; // in dollars
  priceInCents: number; // in cents for Stripe
  credits: number;
  description: string;
  features: string[];
  highlighted?: boolean;
}

export const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceInCents: 0,
    credits: 5,
    description: 'Try it out with 5 free generations',
    features: [
      '5 image generations',
      'All artistic styles',
      'Standard resolution',
      'Reference image support',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 9.99,
    priceInCents: 999,
    credits: 100,
    description: 'Perfect for casual creators',
    features: [
      '100 image generations',
      'All artistic styles',
      'High resolution output',
      'Reference image support',
      'Priority generation queue',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29.99,
    priceInCents: 2999,
    credits: 500,
    description: 'Best value for power users',
    features: [
      '500 image generations',
      'All artistic styles',
      'High resolution output',
      'Reference image support',
      'Priority generation queue',
      'Early access to new features',
    ],
    highlighted: true,
  },
];

export function getPlanById(id: string): PricingPlan | undefined {
  return PLANS.find((p) => p.id === id);
}
