import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
    }

    // Verify signature
    const signature = request.headers.get('x-signature');
    if (!signature) {
      return NextResponse.json({ error: 'No signature provided.' }, { status: 401 });
    }

    const rawBody = await request.text();
    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = hmac.update(rawBody).digest('hex');

    if (signature !== digest) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.meta?.event_name;

    if (!eventType) {
      return NextResponse.json({ error: 'No event name.' }, { status: 400 });
    }

    // Initialize Supabase admin client (service role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase admin config missing');
      return NextResponse.json({ error: 'Server config error.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const data = payload.data;
    const attributes = data?.attributes;
    const customData = attributes?.custom_data || {};
    const userId = customData.user_id;

    if (!userId) {
      console.warn('Webhook received without user_id in custom_data');
      return NextResponse.json({ received: true });
    }

    switch (eventType) {
      case 'subscription_created':
      case 'subscription_updated': {
        const subscriptionId = String(data.id);
        const customerId = String(attributes?.customer_id || '');
        const status = attributes?.status;

        if (status === 'active' || status === 'trialing') {
          await supabase
            .from('users')
            .update({
              plan: 'pro',
              lemonsqueezy_subscription_id: subscriptionId,
              lemonsqueezy_customer_id: customerId,
              plan_expires_at: null,
            })
            .eq('id', userId);

          console.log(`User ${userId} upgraded to Pro (subscription: ${subscriptionId})`);
        }
        break;
      }

      case 'subscription_cancelled': {
        const endsAt = attributes?.ends_at;
        if (endsAt) {
          await supabase
            .from('users')
            .update({
              plan_expires_at: endsAt,
            })
            .eq('id', userId);

          console.log(`User ${userId} cancelled. Plan expires at: ${endsAt}`);
        }
        break;
      }

      case 'subscription_expired': {
        await supabase
          .from('users')
          .update({
            plan: 'free',
            lemonsqueezy_subscription_id: null,
            plan_expires_at: null,
          })
          .eq('id', userId);

        console.log(`User ${userId} subscription expired. Downgraded to free.`);
        break;
      }

      case 'order_created': {
        console.log(`Order created for user ${userId}`);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return NextResponse.json({ received: true });

  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
