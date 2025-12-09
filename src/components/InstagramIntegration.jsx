import React, { useState, useEffect } from 'react';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiCheck, FiX, FiLoader, FiExternalLink, FiCamera, FiMessageCircle, FiTrendingUp, FiPlus, FiTrash2 } = FiIcons;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const InstagramIntegration = ({ userId }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    checkConnection();
  }, [userId]);

  const checkConnection = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/instagram/info/${userId}`);
      const data = await response.json();

      if (data.success && data.accounts?.length > 0) {
        setAccounts(data.accounts);
      } else {
        setAccounts([]);
      }
    } catch (err) {
      console.error('Error checking Instagram connection:', err);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError('');

      sessionStorage.setItem('instagram_oauth_userId', userId);

      const response = await fetch(`${API_URL}/api/instagram/oauth-url`);
      const data = await response.json();

      if (data.success && data.oauthUrl) {
        sessionStorage.setItem('instagram_oauth_state', data.state);
        window.location.href = data.oauthUrl;
      } else {
        setError('Failed to get OAuth URL');
        setConnecting(false);
      }
    } catch (err) {
      console.error('Error connecting to Instagram:', err);
      setError('Failed to connect. Please try again.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async (accountId = null) => {
    try {
      setDisconnecting(accountId || 'all');
      const response = await fetch(`${API_URL}/api/instagram/disconnect/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const data = await response.json();

      if (data.success) {
        if (accountId) {
          setAccounts(prev => prev.filter(acc => acc.id !== accountId));
        } else {
          setAccounts([]);
        }
      }
    } catch (err) {
      console.error('Error disconnecting Instagram:', err);
      setError('Failed to disconnect. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-5 bg-[#1c1c1e] rounded-xl border border-zinc-800/50">
        <div className="flex items-center gap-3">
          <SafeIcon icon={FiLoader} className="w-5 h-5 text-zinc-500 animate-spin" />
          <span className="text-zinc-500 text-sm">Checking connection...</span>
        </div>
      </div>
    );
  }

  const hasAccounts = accounts.length > 0;

  return (
    <div className={`p-5 rounded-xl border transition-all ${hasAccounts
      ? 'bg-[#1c1c1e] border-emerald-500/30'
      : 'bg-[#1c1c1e] border-zinc-800/50 hover:border-zinc-700/50'
      }`}>
      <div className="flex items-start gap-4">
        {/* Instagram Logo */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${hasAccounts
          ? 'bg-gradient-to-br from-emerald-500 to-green-600'
          : 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400'
          }`}>
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-white font-semibold">Instagram</h3>
            {hasAccounts && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase rounded flex items-center gap-1">
                <SafeIcon icon={FiCheck} className="w-3 h-3" />
                {accounts.length} Connected
              </span>
            )}
          </div>

          {hasAccounts ? (
            <div className="space-y-4">
              {/* Connected Accounts List */}
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-lg group"
                  >
                    {account.profilePictureUrl ? (
                      <img
                        src={account.profilePictureUrl}
                        alt={account.username}
                        className="w-10 h-10 rounded-full ring-2 ring-zinc-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                        <span className="text-zinc-400 font-bold">
                          {account.username?.[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">@{account.username}</p>
                      <p className="text-zinc-500 text-xs truncate">
                        {account.facebookPageName || 'Connected ' + (account.connectedAt ? new Date(account.connectedAt).toLocaleDateString() : 'recently')}
                      </p>
                    </div>
                    {/* Remove individual account */}
                    <button
                      onClick={() => handleDisconnect(account.id)}
                      disabled={disconnecting === account.id}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="Remove account"
                    >
                      {disconnecting === account.id ? (
                        <SafeIcon icon={FiLoader} className="w-4 h-4 animate-spin" />
                      ) : (
                        <SafeIcon icon={FiTrash2} className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {/* Status */}
              <p className="text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                <SafeIcon icon={FiCheck} className="w-3.5 h-3.5" />
                Ready to publish posts automatically
              </p>

              {/* Add another account button */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-all text-xs font-medium"
                >
                  {connecting ? (
                    <>
                      <SafeIcon icon={FiLoader} className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <SafeIcon icon={FiPlus} className="w-3.5 h-3.5" />
                      Add Another Account
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleDisconnect(null)}
                  disabled={disconnecting === 'all'}
                  className="px-3 py-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-xs font-medium flex items-center gap-1.5"
                >
                  {disconnecting === 'all' ? (
                    <SafeIcon icon={FiLoader} className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <SafeIcon icon={FiX} className="w-3.5 h-3.5" />
                  )}
                  Disconnect All
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-zinc-400 text-sm">
                Connect your Instagram Business accounts to publish images directly.
              </p>

              {/* Features */}
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-zinc-500">
                  <SafeIcon icon={FiCamera} className="w-3.5 h-3.5" />
                  Auto-publish
                </span>
                <span className="flex items-center gap-1.5 text-zinc-500">
                  <SafeIcon icon={FiMessageCircle} className="w-3.5 h-3.5" />
                  Comments
                </span>
                <span className="flex items-center gap-1.5 text-zinc-500">
                  <SafeIcon icon={FiTrendingUp} className="w-3.5 h-3.5" />
                  Analytics
                </span>
              </div>

              {error && (
                <p className="text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
              )}

              {/* Connect Button */}
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-xl transition-all text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/5"
              >
                {connecting ? (
                  <>
                    <SafeIcon icon={FiLoader} className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect Instagram
                    <SafeIcon icon={FiExternalLink} className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstagramIntegration;