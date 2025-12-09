const express = require('express');
const creditsRouter = express.Router();
const CreditsController = require('../functions/Credits');
const creditsController = new CreditsController();

/**
 * GET /credits/:userId
 * Get user's credits info
 */
creditsRouter.get('/:userId', async (req, res) => {
  try {
    const { status, json } = await creditsController.getCredits(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /credits/:userId/transactions
 * Get user's transaction history
 */
creditsRouter.get('/:userId/transactions', async (req, res) => {
  try {
    const { status, json } = await creditsController.getTransactions(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /credits/plans
 * Get available subscription plans
 */
creditsRouter.get('/plans/all', async (req, res) => {
  try {
    const { status, json } = await creditsController.getPlans(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /credits/webhook/razorpay
 * Handle Razorpay webhook events
 */
creditsRouter.post('/webhook/razorpay', async (req, res) => {
  try {
    const { status, json } = await creditsController.handleRazorpayWebhook(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.error('[CREDITS] Webhook Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = creditsRouter;

