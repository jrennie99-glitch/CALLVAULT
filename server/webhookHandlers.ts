import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    // stripe-replit-sync verifies the signature internally
    // This call will throw if the signature is invalid
    await sync.processWebhook(payload, signature);
    
    // After sync.processWebhook succeeds, we know the signature was valid
    // Now handle custom subscription status updates for our identity table
    try {
      // Safe to parse - signature was verified above
      const event = JSON.parse(payload.toString()) as Stripe.Event;
      await WebhookHandlers.handleSubscriptionEvent(event);
    } catch (error) {
      console.error('Error handling custom subscription webhook:', error);
    }
  }

  static async handleSubscriptionEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        // Find user by Stripe customer ID
        const user = await WebhookHandlers.findUserByStripeCustomerId(customerId);
        if (!user) {
          console.log(`No user found for Stripe customer ${customerId}`);
          return;
        }
        
        // Update subscription status
        const status = subscription.status;
        const planStatus = status === 'active' || status === 'trialing' ? 'active' : 
                          status === 'past_due' ? 'past_due' : 
                          status === 'canceled' ? 'cancelled' : 'none';
        
        // Determine plan from price metadata or default to pro
        let plan = 'pro';
        if (subscription.items.data.length > 0) {
          const priceId = typeof subscription.items.data[0].price === 'string'
            ? subscription.items.data[0].price
            : subscription.items.data[0].price.id;
          
          if (priceId.includes('business')) {
            plan = 'business';
          } else if (priceId.includes('enterprise')) {
            plan = 'enterprise';
          }
        }
        
        await storage.updateIdentity(user.address, { 
          plan: plan as any, 
          planStatus: planStatus as any,
          stripeSubscriptionId: subscription.id,
          planRenewalAt: subscription.current_period_end 
            ? new Date(subscription.current_period_end * 1000) 
            : null
        });
        
        console.log(`Updated subscription for ${user.address}: ${plan}/${planStatus}`);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        const user = await WebhookHandlers.findUserByStripeCustomerId(customerId);
        if (user) {
          // Keep the stripeSubscriptionId and mark as cancelled
          // This prevents fallback to trial access
          await storage.updateIdentity(user.address, {
            plan: 'free' as any,
            planStatus: 'cancelled' as any,
            // Keep stripeSubscriptionId so checkPremiumAccess knows this was a cancelled subscription
          });
          console.log(`Subscription cancelled for ${user.address}`);
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : invoice.customer?.id;
        
        if (customerId) {
          const user = await WebhookHandlers.findUserByStripeCustomerId(customerId);
          if (user) {
            // Update plan renewal date
            await storage.updateIdentity(user.address, {
              planStatus: 'active' as any,
              planRenewalAt: invoice.period_end 
                ? new Date(invoice.period_end * 1000) 
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
          }
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : invoice.customer?.id;
        
        if (customerId) {
          const user = await WebhookHandlers.findUserByStripeCustomerId(customerId);
          if (user) {
            await storage.updateIdentity(user.address, {
              planStatus: 'past_due' as any
            });
          }
        }
        break;
      }
      
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userAddress = session.metadata?.userAddress;
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;
        
        if (userAddress && customerId) {
          // Link Stripe customer to user
          await storage.updateStripeCustomer(userAddress, customerId);
          console.log(`Linked Stripe customer ${customerId} to ${userAddress}`);
        }
        break;
      }
    }
  }

  private static async findUserByStripeCustomerId(customerId: string) {
    const users = await storage.getAllIdentities({ limit: 10000 });
    return users.find(u => u.stripeCustomerId === customerId);
  }
}
