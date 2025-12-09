const Credits = require('../models/credits');
const { PLAN_CONFIG } = require('../models/credits');
const crypto = require('crypto');

class CreditsController {
  /**
   * Get or create credits for a user
   */
  async getOrCreateCredits(userId) {
    let credits = await Credits.findOne({ userId });

    if (!credits) {
      // Create new credits record with free plan
      credits = await Credits.create({
        userId,
        balance: PLAN_CONFIG.free.credits,
        plan: 'free',
        planName: 'Free',
        transactions: [{
          type: 'bonus',
          amount: PLAN_CONFIG.free.credits,
          description: 'Welcome bonus - Free plan credits',
          referenceType: 'bonus',
          balanceAfter: PLAN_CONFIG.free.credits,
        }],
      });
      console.log(`💳 [CREDITS] Created new credits for user ${userId} with ${PLAN_CONFIG.free.credits} credits`);
    }

    return credits;
  }

  /**
   * Get user's credits info
   */
  async getCredits(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return { status: 400, json: { error: 'userId is required' } };
      }

      const credits = await this.getOrCreateCredits(userId);

      return {
        status: 200,
        json: {
          success: true,
          credits: {
            balance: credits.balance,
            plan: credits.plan,
            planName: credits.planName,
            subscriptionStatus: credits.subscriptionStatus,
            currentPeriodEnd: credits.currentPeriodEnd,
            totalCreditsUsed: credits.totalCreditsUsed,
          },
        },
      };
    } catch (error) {
      console.error('[CREDITS] Error getting credits:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Check if user has enough credits
   */
  async hasCredits(userId, amount = 1) {
    const credits = await this.getOrCreateCredits(userId);
    return credits.balance >= amount;
  }

  /**
   * Deduct credits for image generation
   */
  async deductCredits(userId, amount = 1, reference = null, description = 'Image generation') {
    const credits = await this.getOrCreateCredits(userId);

    if (credits.balance < amount) {
      return { success: false, error: 'Insufficient credits', balance: credits.balance };
    }

    credits.balance -= amount;
    credits.totalCreditsUsed += amount;

    credits.transactions.push({
      type: 'credit_deduct',
      amount: -amount,
      description,
      reference,
      referenceType: 'image_generation',
      balanceAfter: credits.balance,
    });

    await credits.save();

    console.log(`💳 [CREDITS] Deducted ${amount} credit(s) from user ${userId}. Balance: ${credits.balance}`);

    return { success: true, balance: credits.balance, creditsUsed: amount };
  }

  /**
   * Add credits (for subscriptions, bonuses, etc.)
   */
  async addCredits(userId, amount, type = 'bonus', description = 'Credits added', reference = null) {
    const credits = await this.getOrCreateCredits(userId);

    credits.balance += amount;

    credits.transactions.push({
      type,
      amount,
      description,
      reference,
      referenceType: type === 'subscription' ? 'subscription' : 'bonus',
      balanceAfter: credits.balance,
    });

    await credits.save();

    console.log(`💳 [CREDITS] Added ${amount} credits to user ${userId}. Balance: ${credits.balance}`);

    return { success: true, balance: credits.balance };
  }

  /**
   * Update subscription and add credits (Razorpay)
   */
  async handleSubscription(userId, planKey, razorpayCustomerId, razorpaySubscriptionId, periodStart, periodEnd) {
    const credits = await this.getOrCreateCredits(userId);
    const planConfig = PLAN_CONFIG[planKey];

    if (!planConfig) {
      throw new Error(`Invalid plan: ${planKey}`);
    }

    // Update subscription info
    credits.plan = planKey;
    credits.planName = planConfig.name;
    credits.razorpayCustomerId = razorpayCustomerId;
    credits.razorpaySubscriptionId = razorpaySubscriptionId;
    credits.subscriptionStatus = 'active';
    credits.currentPeriodStart = periodStart;
    credits.currentPeriodEnd = periodEnd;
    credits.lastCreditReset = new Date();

    // Add plan credits
    credits.balance += planConfig.credits;

    credits.transactions.push({
      type: 'subscription',
      amount: planConfig.credits,
      description: `${planConfig.name} subscription - ${planConfig.credits} credits`,
      reference: razorpaySubscriptionId,
      referenceType: 'subscription',
      balanceAfter: credits.balance,
    });

    await credits.save();

    console.log(`💳 [CREDITS] Subscription activated: ${planConfig.name} for user ${userId}. Added ${planConfig.credits} credits. Balance: ${credits.balance}`);

    return { success: true, balance: credits.balance, plan: planKey };
  }

  /**
   * Handle subscription cancellation
   */
  async handleCancellation(userId) {
    const credits = await this.getOrCreateCredits(userId);

    credits.subscriptionStatus = 'canceled';
    // Keep current balance, just change plan to free (they keep remaining credits)
    credits.plan = 'free';
    credits.planName = 'Free';

    await credits.save();

    console.log(`💳 [CREDITS] Subscription canceled for user ${userId}. Balance: ${credits.balance}`);

    return { success: true, balance: credits.balance };
  }

  /**
   * Get transaction history
   */
  async getTransactions(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!userId) {
        return { status: 400, json: { error: 'userId is required' } };
      }

      const credits = await this.getOrCreateCredits(userId);

      // Get transactions sorted by date descending
      const transactions = credits.transactions
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(Number(offset), Number(offset) + Number(limit));

      return {
        status: 200,
        json: {
          success: true,
          transactions,
          total: credits.transactions.length,
        },
      };
    } catch (error) {
      console.error('[CREDITS] Error getting transactions:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Get available plans
   */
  async getPlans(req, res) {
    try {
      const plans = Object.entries(PLAN_CONFIG).map(([key, config]) => ({
        key,
        ...config,
      }));

      return {
        status: 200,
        json: {
          success: true,
          plans,
        },
      };
    } catch (error) {
      console.error('[CREDITS] Error getting plans:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Verify Razorpay webhook signature
   */
  verifyWebhookSignature(body, signature, secret) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');
    return expectedSignature === signature;
  }

  /**
   * Handle Razorpay webhook events
   */
  async handleRazorpayWebhook(req, res) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      // Verify signature
      if (webhookSecret && signature) {
        const isValid = this.verifyWebhookSignature(req.body, signature, webhookSecret);
        if (!isValid) {
          console.error('❌ [WEBHOOK] Invalid Razorpay signature');
          return { status: 400, json: { error: 'Invalid signature' } };
        }
      }

      const event = req.body;
      console.log('📥 [WEBHOOK] Razorpay event:', event.event);

      switch (event.event) {
        case 'subscription.activated':
        case 'subscription.charged': {
          const subscription = event.payload.subscription.entity;
          const payment = event.payload.payment?.entity;

          // Get plan from subscription plan_id
          const plan = Credits.getPlanByRazorpayId(subscription.plan_id);
          if (!plan) {
            console.error('❌ [WEBHOOK] Unknown plan:', subscription.plan_id);
            return { status: 400, json: { error: 'Unknown plan' } };
          }

          // Get userId from subscription notes (must be set when creating subscription)
          const userId = subscription.notes?.userId;
          if (!userId) {
            console.error('❌ [WEBHOOK] No userId in subscription notes');
            return { status: 400, json: { error: 'No userId in subscription' } };
          }

          // Calculate period dates
          const periodStart = new Date(subscription.current_start * 1000);
          const periodEnd = new Date(subscription.current_end * 1000);

          await this.handleSubscription(
            userId,
            plan.key,
            subscription.customer_id,
            subscription.id,
            periodStart,
            periodEnd
          );

          console.log(`✅ [WEBHOOK] Subscription ${event.event} processed for user ${userId}`);
          break;
        }

        case 'subscription.cancelled':
        case 'subscription.halted': {
          const subscription = event.payload.subscription.entity;
          const userId = subscription.notes?.userId;

          if (userId) {
            await this.handleCancellation(userId);
            console.log(`✅ [WEBHOOK] Subscription cancelled for user ${userId}`);
          }
          break;
        }

        default:
          console.log(`ℹ️ [WEBHOOK] Unhandled event: ${event.event}`);
      }

      return { status: 200, json: { received: true } };
    } catch (error) {
      console.error('[WEBHOOK] Error:', error);
      return { status: 500, json: { error: error.message } };
    }
  }
}

module.exports = CreditsController;

