/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
    };
    session?: {
      id: string;
      userId: string;
      token: string;
      expiresAt: Date;
    };
  }
}
