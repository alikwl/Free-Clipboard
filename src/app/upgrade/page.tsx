'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { Check, Crown, Sparkles, ArrowRight, Shield, Clock } from 'lucide-react';

export default function UpgradePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);
      setLoading(false);
    });
  }, [router]);

  const handleCheckout = async () => {
    if (!user) return;
    setProcessing(true);
    try {
      const variantId = billingCycle === 'annual'
        ? process.env.NEXT_PUBLIC_LEMONSQUEEZY_PRO_ANNUAL_VARIANT_ID
        : process.env.NEXT_PUBLIC_LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID;

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId,
          email: user.email,
          customData: { user_id: user.id },
        }),
      });

      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data.error || 'Checkout failed');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-400 text-sm">Loading...</div>
      </div>
    );
  }

  const monthlyPrice = 5;
  const annualPrice = 39;
  const annualMonthly = (annualPrice / 12).toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-indigo-950/20 text-neutral-100">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            ← Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-neutral-200">Upgrade Plan</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white mb-3">
            Choose Your Plan
          </h1>
          <p className="text-sm text-neutral-400 max-w-md mx-auto">
            Start with a 7-day free trial. No credit card required until trial ends.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-xs font-semibold ${billingCycle === 'monthly' ? 'text-white' : 'text-neutral-500'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              billingCycle === 'annual' ? 'bg-indigo-500' : 'bg-neutral-700'
            }`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              billingCycle === 'annual' ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
          <span className={`text-xs font-semibold ${billingCycle === 'annual' ? 'text-white' : 'text-neutral-500'}`}>
            Annual
            <span className="ml-1.5 text-[10px] text-emerald-400 font-bold">Save 35%</span>
          </span>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Free */}
          <div className="border border-white/5 bg-neutral-900/30 rounded-2xl p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-sm font-bold text-neutral-300 mb-1">Free</h3>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-black text-white">$0</span>
                <span className="text-xs text-neutral-500 mb-1">/forever</span>
              </div>
            </div>

            <ul className="space-y-2.5 mb-8 flex-grow">
              {[
                '500 clips max',
                '3 devices sync',
                '5 AI calls/day',
                'Basic sharing (7-day links)',
                'Standard support',
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-neutral-400">
                  <Check className="w-3.5 h-3.5 text-neutral-600 shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              disabled
              className="w-full py-2.5 rounded-xl border border-white/10 text-xs font-bold text-neutral-500 cursor-not-allowed"
            >
              Current Plan
            </button>
          </div>

          {/* Pro */}
          <div className="relative border-2 border-indigo-500/30 bg-neutral-900/50 rounded-2xl p-6 flex flex-col shadow-2xl shadow-indigo-500/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-500 to-violet-500 text-white px-3 py-1 rounded-full">
                Most Popular
              </span>
            </div>

            <div className="mb-6 pt-2">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Pro</h3>
              </div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-black text-white">
                  ${billingCycle === 'annual' ? annualMonthly : monthlyPrice}
                </span>
                <span className="text-xs text-neutral-500 mb-1">/month</span>
              </div>
              {billingCycle === 'annual' && (
                <p className="text-[10px] text-indigo-400 mt-1 font-semibold">
                  ${annualPrice}/year — billed annually
                </p>
              )}
            </div>

            <ul className="space-y-2.5 mb-8 flex-grow">
              {[
                'Unlimited clips',
                'Unlimited devices',
                '100 AI calls/day',
                'ClipMind AI assistant',
                'Snippet triggers',
                'Permanent share links',
                'Chrome extension sync',
                'Priority support',
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-neutral-300">
                  <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={handleCheckout}
              disabled={processing}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {processing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Start 7-Day Free Trial
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Team */}
          <div className="border border-white/5 bg-neutral-900/30 rounded-2xl p-6 flex flex-col">
            <div className="mb-6">
              <h3 className="text-sm font-bold text-neutral-300 mb-1">Team</h3>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-black text-white">$12</span>
                <span className="text-xs text-neutral-500 mb-1">/mo per user</span>
              </div>
            </div>

            <ul className="space-y-2.5 mb-8 flex-grow">
              {[
                'Everything in Pro',
                'Shared workspace',
                'Team collaboration',
                'Admin dashboard',
                '5 users included',
              ].map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-neutral-400">
                  <Check className="w-3.5 h-3.5 text-neutral-600 shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href="mailto:support@freeclipboard.com?subject=Team Plan Inquiry"
              className="w-full py-2.5 rounded-xl border border-white/10 text-xs font-bold text-neutral-300 hover:bg-white/5 transition-colors text-center"
            >
              Contact Us
            </a>
          </div>
        </div>

        {/* Trust Badges */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-12 text-center">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Shield className="w-4 h-4" />
            <span>30-day money back, no questions asked</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Clock className="w-4 h-4" />
            <span>Cancel anytime, your data stays yours</span>
          </div>
        </div>
      </div>
    </div>
  );
}
