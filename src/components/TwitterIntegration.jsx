import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { twitterAPI } from '../lib/api';

/**
 * X (Twitter) connect / disconnect panel for Settings > Integrations.
 */
const TwitterIntegration = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await twitterAPI.getInfo();
      if (data.success) {
        setAccounts(data.accounts || []);
      } else {
        setError(data.error || 'Could not load X accounts');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const data = await twitterAPI.getOAuthUrl();
      if (data.success && data.oauthUrl) {
        window.location.href = data.oauthUrl;
      } else {
        setError(data.error || 'Could not start the X connection');
        setConnecting(false);
      }
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  };

  const handleDisconnect = async (accountId) => {
    if (!window.confirm('Disconnect this X account? Scheduled X posts will fail until you reconnect.')) return;
    const data = await twitterAPI.disconnect(accountId);
    if (data.success) {
      setNotice('X disconnected.');
      loadAccounts();
    } else {
      setError(data.error || 'Failed to disconnect');
    }
  };

  const handleRefresh = async (accountId) => {
    const data = await twitterAPI.refreshToken(accountId);
    if (data.success) {
      setNotice('X access refreshed.');
      loadAccounts();
    } else {
      handleConnect();
    }
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-black text-xl font-bold text-white ring-1 ring-gray-700">
          𝕏
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">X (Twitter)</h2>
          <p className="text-sm text-gray-400">
            Let the autopilot draft posts and threads for your timeline.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-green-900 bg-green-950/50 p-3 text-sm text-green-300">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 p-8 text-center">
          <p className="mb-4 text-sm text-gray-400">No X account connected yet.</p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-gray-200 disabled:opacity-50"
          >
            {connecting ? 'Redirecting…' : 'Connect X'}
          </button>
          <p className="mt-4 text-xs text-gray-600">
            On X's free tier you get 500 posts a month, and only 17 media uploads
            per day — enough for a text autopilot, tight for an image one.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <motion.div
              key={account.accountId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-gray-800 bg-gray-950 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {account.profilePictureUrl ? (
                    <img
                      src={account.profilePictureUrl}
                      alt={account.username}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gray-800" />
                  )}
                  <div>
                    <p className="font-medium text-white">@{account.username}</p>
                    <p className="text-xs text-gray-500">
                      {account.canAutoRefresh
                        ? 'Access refreshes automatically'
                        : 'No refresh token — will need reconnecting'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleDisconnect(account.accountId)}
                  className="text-xs text-gray-500 transition hover:text-red-400"
                >
                  Disconnect
                </button>
              </div>

              {account.connectionError?.message && (
                <div className="mt-3 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-xs text-amber-300">
                  {account.connectionError.message}
                  <button
                    onClick={() => handleRefresh(account.accountId)}
                    className="ml-2 underline"
                  >
                    Reconnect
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TwitterIntegration;
