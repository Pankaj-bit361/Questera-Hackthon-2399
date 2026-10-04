import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { twitterAPI } from '../lib/api';

/**
 * X (Twitter) OAuth callback.
 *
 * The PKCE code_verifier never reaches the browser - the backend stored it
 * against the opaque `state` value, so all this page forwards is code + state.
 */
const TwitterCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Connecting your X account...');
  const hasCalledRef = useRef(false);

  useEffect(() => {
    // An authorization code can only be redeemed once, so guard against
    // React Strict Mode double-invoking the effect.
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setMessage(searchParams.get('error_description') || error);
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('No authorization code received from X.');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      const data = await twitterAPI.completeCallback(code, state);

      if (data.success) {
        setStatus('success');
        const handle = data.account?.username ? `@${data.account.username}` : 'your account';
        setMessage(
          data.canAutoRefresh
            ? `Connected ${handle}. Redirecting...`
            : `Connected ${handle}, but X did not return a refresh token. Access will expire in 2 hours — reconnect with "offline.access" enabled on your app.`
        );
        setTimeout(() => navigate('/settings'), data.canAutoRefresh ? 1500 : 5000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to connect X.');
        setTimeout(() => navigate('/settings'), 4000);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Something went wrong connecting X.');
      setTimeout(() => navigate('/settings'), 4000);
    }
  };

  const tone = {
    processing: { ring: 'border-gray-400', text: 'text-gray-400' },
    success: { ring: 'border-green-500', text: 'text-green-400' },
    error: { ring: 'border-red-500', text: 'text-red-400' },
  }[status];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center"
      >
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-black text-3xl font-bold text-white ring-1 ring-gray-700">
          𝕏
        </div>

        {status === 'processing' && (
          <div className={`mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-transparent ${tone.ring}`} />
        )}

        <h1 className="mb-2 text-xl font-semibold text-white">
          {status === 'processing' && 'Connecting X'}
          {status === 'success' && 'X connected'}
          {status === 'error' && "Couldn't connect X"}
        </h1>

        <p className={`text-sm ${tone.text}`}>{message}</p>
      </motion.div>
    </div>
  );
};

export default TwitterCallback;
