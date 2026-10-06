const Credits = require('../models/credits');
const { PLAN_CONFIG } = require('../models/credits');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const {mutateCredits} = require('./creditMutation');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

class CreditsController {
  /**
   * Get or create credits for a user
   */
  async getOrCreateCredits(userId) {
    let credits = await Credits.findOne({ userId });

    if (!credits) {
      // Create new credits record with free plan
      try { credits = await Credits.create({
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
      } catch (error) { if (error.code !== 11000) throw error; credits = await Credits.findOne({userId}); }
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
  async deductCredits(userId, amount = 1, reference = null, description = 'Image generation', referenceType = 'image_generation') {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Credit amount must be positive.');
    await this.getOrCreateCredits(userId);
    let insufficient = false;
    const credits = await mutateCredits(Credits,userId,current => {
      insufficient = current.balance < amount;
      if (insufficient) return null;
      current.balance -= amount; current.totalCreditsUsed += amount;
      current.transactions.push({transactionId:crypto.randomUUID(),type:'credit_deduct',amount:-amount,description,reference,referenceType,balanceAfter:current.balance,createdAt:new Date()});
      return current;
    });
    return insufficient ? {success:false,error:'Insufficient credits',balance:credits.balance} : {success:true,balance:credits.balance,creditsUsed:amount};
  }

  /**
   * Add credits (for subscriptions, bonuses, etc.)
   */
  async addCredits(userId, amount, type = 'bonus', description = 'Credits added', reference = null) {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Credit amount must be positive.');
    await this.getOrCreateCredits(userId);
    const credits = await mutateCredits(Credits,userId,current => {
      if(reference && current.transactions.some(t=>t.reference===reference && t.type===type))return null;
      current.balance += amount;
      current.transactions.push({transactionId:crypto.randomUUID(),type,amount,description,reference,referenceType:type==='subscription'?'subscription':'bonus',balanceAfter:current.balance,createdAt:new Date()});return current;
    });
    return {success:true,balance:credits.balance};
  }

  /**
   * Update subscription and add credits (Razorpay)
   */
  async handleSubscription(userId, planKey, razorpayCustomerId, razorpaySubscriptionId, periodStart, periodEnd) {
    const planConfig=PLAN_CONFIG[planKey];
    if(!planConfig)throw new Error('Invalid plan.');
    if(!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodEnd<=periodStart)throw new Error('Subscription period is invalid.');
    await this.getOrCreateCredits(userId);
    // Checkout, activation, and charged events for one billing period grant once.
    const grantId=`${razorpaySubscriptionId}:${periodStart.toISOString()}`;
    const credits=await mutateCredits(Credits,userId,current=>{
      if((current.processedGrants||[]).includes(grantId))return null;
      current.processedGrants=[...(current.processedGrants||[]),grantId];
      Object.assign(current,{plan:planKey,planName:planConfig.name,razorpayCustomerId,razorpaySubscriptionId,subscriptionStatus:'active',currentPeriodStart:periodStart,currentPeriodEnd:periodEnd,lastCreditReset:new Date()});
      current.balance+=planConfig.credits;
      current.transactions.push({transactionId:crypto.randomUUID(),type:'subscription',amount:planConfig.credits,description:`${planConfig.name} subscription`,reference:grantId,referenceType:'subscription',balanceAfter:current.balance,createdAt:new Date()});return current;
    });
    return {success:true,balance:credits.balance,plan:credits.plan};
  }

  /**
   * Handle subscription cancellation
   */
  async handleCancellation(userId) {
    await this.getOrCreateCredits(userId); let removed=0;
    await mutateCredits(Credits,userId,current=>{
      removed=current.balance;
      if(current.subscriptionStatus==='canceled'&&removed===0)return null;
      Object.assign(current,{balance:0,subscriptionStatus:'canceled',plan:'free',planName:'Free',razorpaySubscriptionId:null,currentPeriodStart:null,currentPeriodEnd:null});
      if(removed>0)current.transactions.push({transactionId:crypto.randomUUID(),type:'credit_deduct',amount:-removed,description:'Subscription cancelled - all credits removed',referenceType:'subscription',balanceAfter:0,createdAt:new Date()});return current;
    });
    return {success:true,balance:0,creditsRemoved:removed};
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
   * Create Razorpay subscription for a user
   */
  async createSubscription(req, res) {
    try {
      const { userId, planKey, email, name, contact } = req.body;

      if (!userId || !planKey) {
        return { status: 400, json: { error: 'userId and planKey are required' } };
      }

      const planConfig = PLAN_CONFIG[planKey];
      if (!planConfig || !planConfig.razorpayPlanId) {
        return { status: 400, json: { error: 'Invalid plan or free plan selected' } };
      }

      console.log(`💳 [SUBSCRIPTION] Creating subscription for user ${userId}, plan: ${planKey}`);

      // Create Razorpay subscription
      const subscription = await razorpay.subscriptions.create({
        plan_id: planConfig.razorpayPlanId,
        total_count: 12, // 12 billing cycles (1 year for monthly)
        quantity: 1,
        customer_notify: 1,
        notes: {
          userId: userId,
          planKey: planKey,
          email: email || '',
          name: name || '',
        },
      });

      console.log(`✅ [SUBSCRIPTION] Created subscription ${subscription.id} for user ${userId}`);

      return {
        status: 200,
        json: {
          success: true,
          subscriptionId: subscription.id,
          razorpayKeyId: process.env.RAZORPAY_KEY_ID,
          amount: planConfig.price * 100, // In paise
          currency: 'INR',
          name: planConfig.name,
          description: `${planConfig.name} - ${planConfig.credits} credits/month`,
        },
      };
    } catch (error) {
      console.error('[SUBSCRIPTION] Error creating subscription:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Verify Razorpay payment after checkout
   */
  async verifyPayment(req, res) {
    try {
      const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, userId, planKey } = req.body;

      if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
        return { status: 400, json: { error: 'Missing payment details' } };
      }

      // Verify signature
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        console.error('❌ [PAYMENT] Invalid signature');
        return { status: 400, json: { error: 'Invalid payment signature' } };
      }

      console.log(`✅ [PAYMENT] Verified payment ${razorpay_payment_id} for subscription ${razorpay_subscription_id}`);

      // Fetch subscription details from Razorpay
      const subscription = await razorpay.subscriptions.fetch(razorpay_subscription_id);

      // Get plan config
      const planConfig = PLAN_CONFIG[planKey];
      if (!planConfig || subscription.plan_id !== planConfig.razorpayPlanId || subscription.notes?.userId !== userId || subscription.status !== 'active') {
        return { status: 400, json: { error: 'Invalid plan' } };
      }

      // Calculate period dates
      const periodStart = new Date(subscription.current_start * 1000);
      const periodEnd = new Date(subscription.current_end * 1000);

      // Update user credits
      await this.handleSubscription(
        userId,
        planKey,
        subscription.customer_id || '',
        razorpay_subscription_id,
        periodStart,
        periodEnd
      );

      // Get updated credits
      const credits = await this.getOrCreateCredits(userId);

      return {
        status: 200,
        json: {
          success: true,
          message: 'Payment verified and subscription activated',
          credits: {
            balance: credits.balance,
            plan: credits.plan,
            planName: credits.planName,
          },
        },
      };
    } catch (error) {
      console.error('[PAYMENT] Error verifying payment:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Verify Razorpay webhook signature
   */
  verifyWebhookSignature(body, signature, secret) {
    if(!Buffer.isBuffer(body)||!secret||typeof signature!=='string'||!/^[0-9a-f]{64}$/i.test(signature))return false;
    const expected=crypto.createHmac('sha256',secret).update(body).digest();
    return crypto.timingSafeEqual(expected,Buffer.from(signature,'hex'));
  }

  /**
   * Handle Razorpay webhook events
   */
  async handleRazorpayWebhook(req, res) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      if(!webhookSecret)return {status:503,json:{error:'Billing webhook is not configured'}};
      if(!this.verifyWebhookSignature(req.rawBody,signature,webhookSecret))return {status:400,json:{error:'Invalid webhook signature'}};

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

          if(subscription.status!=='active')break;
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

  /**
   * Cancel user subscription via API
   */
  async cancelSubscription(req, res) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return { status: 400, json: { error: 'userId is required' } };
      }

      const credits = await this.getOrCreateCredits(userId);

      if (!credits.razorpaySubscriptionId) {
        return { status: 400, json: { error: 'No active subscription found' } };
      }

      // Cancel subscription in Razorpay
      try {
        await razorpay.subscriptions.cancel(credits.razorpaySubscriptionId);
        console.log(`✅ [CANCEL] Cancelled Razorpay subscription ${credits.razorpaySubscriptionId}`);
      } catch (razorpayError) {
        console.error('❌ [CANCEL] Razorpay cancellation error:', razorpayError);
        return {status:502,json:{error:'The billing provider could not cancel this subscription. Try again.'}};
      }

      // Remove all credits and update status
      const result = await this.handleCancellation(userId);

      return {
        status: 200,
        json: {
          success: true,
          message: 'Subscription cancelled successfully. All credits have been removed.',
          creditsRemoved: result.creditsRemoved,
          balance: 0,
        },
      };
    } catch (error) {
      console.error('[CANCEL] Error cancelling subscription:', error);
      return { status: 500, json: { error: error.message } };
    }
  }
}

module.exports = CreditsController;