import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { linkedinAPI } from '../lib/api';

/**
 * LinkedIn connect / disconnect panel for the Settings > Integrations tab.
 */
const LinkedInIntegration = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [orgNote, setOrgNote] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await linkedinAPI.getInfo();
      if (data.success) {
        setAccounts(data.accounts || []);
        if (data.accounts?.length) loadOrganizations();
      } else {
        setError(data.error || 'Could not load LinkedIn accounts');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const data = await linkedinAPI.getOrganizations();
      if (data.success) {
        setOrganizations(data.organizations || []);
        setOrgNote(data.note || '');
      }
    } catch {
      // Company pages are optional - a failure here is not worth surfacing.
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const data = await linkedinAPI.getOAuthUrl();
      if (data.success && data.oauthUrl) {
        window.location.href = data.oauthUrl;
      } else {
        setError(data.error || 'Could not start the LinkedIn connection');
        setConnecting(false);
      }
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  };

  const handleDisconnect = async (accountId) => {
    if (!window.confirm('Disconnect this LinkedIn account? Scheduled LinkedIn posts will fail until you reconnect.')) return;
    const data = await linkedinAPI.disconnect(accountId);
    if (data.success) {
      setNotice('LinkedIn disconnected.');
      loadAccounts();
    } else {
      setError(data.error || 'Failed to disconnect');
    }
  };

  const handleAuthorChange = async (accountId, organizationId) => {
    const data = await linkedinAPI.setAuthor(accountId, organizationId || undefined);
    if (data.success) {
      setNotice(
        organizationId
          ? 'Posts will now be published as your company page.'
          : 'Posts will now be published as your personal profile.'
      );
      loadAccounts();
    } else {
      setError(data.error || 'Failed to change the author');
    }
  };

  const handleReconnect = async (accountId) => {
    const data = await linkedinAPI.refreshToken(accountId);
    if (data.success) {
      setNotice('LinkedIn access refreshed.');
      loadAccounts();
    } else {
      // A failed refresh means the user has to re-consent.
      handleConnect();
    }
  };

  const daysUntil = (date) => {
    if (!date) return null;
    return Math.round((new Date(date) - Date.now()) / (24 * 60 * 60 * 1000));
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0A66C2] text-lg font-bold text-white">
          in
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">LinkedIn</h2>
          <p className="text-sm text-gray-400">
            Let the autopilot draft and publish to your professional feed.
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
          <p className="mb-4 text-sm text-gray-400">No LinkedIn account connected yet.</p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="rounded-lg bg-[#0A66C2] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#004182] disabled:opacity-50"
          >
            {connecting ? 'Redirecting…' : 'Connect LinkedIn'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => {
            const expiresInDays = daysUntil(account.tokenExpiresAt);
            const expiringSoon = expiresInDays !== null && expiresInDays <= 7;

            return (
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
                        alt={account.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-800" />
                    )}
                    <div>
                      <p className="font-medium text-white">{account.name}</p>
                      <p className="text-xs text-gray-500">
                        Posting as {account.authorType === 'organization' ? 'a company page' : 'your profile'}
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
                      onClick={() => handleReconnect(account.accountId)}
                      className="ml-2 underline"
                    >
                      Reconnect
                    </button>
                  </div>
                )}

                {expiringSoon && !account.connectionError && (
                  <div className="mt-3 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-xs text-amber-300">
                    Access expires in {expiresInDays} day{expiresInDays === 1 ? '' : 's'}.
                    {account.canAutoRefresh
                      ? ' It will refresh automatically before the next post.'
                      : ' This app cannot auto-refresh, so reconnect to keep posting.'}
                    {!account.canAutoRefresh && (
                      <button onClick={handleConnect} className="ml-2 underline">
                        Reconnect
                      </button>
                    )}
                  </div>
                )}

                {organizations.length > 0 && (
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-medium text-gray-400">
                      Publish as
                    </label>
                    <select
                      value={account.authorType === 'organization' ? account.authorUrn.split(':').pop() : ''}
                      onChange={(e) => handleAuthorChange(account.accountId, e.target.value)}
                      className="w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-white"
                    >
                      <option value="">{account.name} (personal profile)</option>
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} (company page)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {orgNote && organizations.length === 0 && (
                  <p className="mt-3 text-xs text-gray-600">{orgNote}</p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LinkedInIntegration;
