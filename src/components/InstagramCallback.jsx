import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const InstagramCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Connecting your Instagram account...');
  const hasCalledRef = useRef(false); // Prevent duplicate calls

  useEffect(() => {
    // Only call once - prevent React Strict Mode double-call and re-renders
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;

    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const state = searchParams.get('state');

      if (error) {
        setStatus('error');
        setMessage(`Error: ${searchParams.get('error_description') || error}`);
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      if (!code) {
        setStatus('error');
        setMessage('No authorization code received');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      // Get userId from sessionStorage (key set by InstagramIntegration)
      const userId = sessionStorage.getItem('instagram_oauth_userId');

      if (!userId) {
        setStatus('error');
        setMessage('User ID not found. Please try again.');
        setTimeout(() => navigate('/settings'), 3000);
        return;
      }

      // Exchange code for token
      const response = await fetch(`${API_URL}/api/instagram/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state, userId }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        // Handle both single account (legacy) and multi-account responses
        if (data.connectedAccounts && data.connectedAccounts.length > 0) {
          const usernames = data.connectedAccounts.map(a => `@${a.username}`).join(', ');
          setMessage(`Connected ${data.connectedAccounts.length} account(s): ${usernames}`);
        } else if (data.instagram?.username) {
          setMessage(`Connected! Welcome @${data.instagram.username}`);
        } else {
          setMessage(data.message || 'Instagram connected successfully!');
        }
        sessionStorage.removeItem('instagram_oauth_userId');
        sessionStorage.removeItem('instagram_oauth_state');
        setTimeout(() => navigate('/settings'), 2000);
      } else {
        setStatus('error');
        setMessage(`Error: ${data.error || 'Unknown error'}`);
        setTimeout(() => navigate('/settings'), 3000);
      }
    } catch (error) {
      setStatus('error');
      setMessage(`Error: ${error.message}`);
      setTimeout(() => navigate('/settings'), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1c1c1e] rounded-2xl p-8 border border-zinc-800/50 max-w-md w-full mx-4"
      >
        <div className="text-center">
          {status === 'processing' && (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-zinc-800 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full animate-spin"></div>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Connecting...</h2>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-emerald-400 mb-2">Connected!</h2>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-red-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-red-400 mb-2">Connection Failed</h2>
            </>
          )}

          <p className="text-zinc-300 text-sm">{message}</p>
          <p className="text-zinc-600 text-xs mt-4">Redirecting to settings...</p>
        </div>
      </motion.div>
    </div>
  );
};

export default InstagramCallback;