import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { linkedinAPI } from '../lib/api';

/**
 * LinkedIn OAuth callback.
 *
 * Unlike the Instagram flow, there is no userId to stash in sessionStorage -
 * the backend verifies the signed `state` and takes the user from the JWT.
 */
const LinkedInCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Connecting your LinkedIn account...');
  const hasCalledRef = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode double-invoking the effect - an
    // authorization code can only be exchanged once.
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
        setMessage('No authorization code received from LinkedIn.');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      const data = await linkedinAPI.completeCallback(code, state);

      if (data.success) {
        setStatus('success');
        const name = data.account?.name || 'your account';
        setMessage(
          data.canAutoRefresh
            ? `Connected ${name}. Redirecting...`
            : `Connected ${name}. Note: this app cannot auto-refresh LinkedIn tokens, so you will need to reconnect in about 60 days.`
        );
        setTimeout(() => navigate('/settings'), data.canAutoRefresh ? 1500 : 4000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to connect LinkedIn.');
        setTimeout(() => navigate('/settings'), 4000);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Something went wrong connecting LinkedIn.');
      setTimeout(() => navigate('/settings'), 4000);
    }
  };

  const tone = {
    processing: { ring: 'border-blue-500', text: 'text-blue-400' },
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
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-[#0A66C2] text-2xl font-bold text-white">
          in
        </div>

        {status === 'processing' && (
          <div className={`mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-transparent ${tone.ring}`} />
        )}

        <h1 className="mb-2 text-xl font-semibold text-white">
          {status === 'processing' && 'Connecting LinkedIn'}
          {status === 'success' && 'LinkedIn connected'}
          {status === 'error' && "Couldn't connect LinkedIn"}
        </h1>

        <p className={`text-sm ${tone.text}`}>{message}</p>
      </motion.div>
    </div>
  );
};

export default LinkedInCallback;
