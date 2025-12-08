import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

const InstagramCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Connecting your Instagram account...');

  useEffect(() => {
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
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (!code) {
        setStatus('error');
        setMessage('No authorization code received');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      // Get userId from sessionStorage
      const userId = sessionStorage.getItem('instagramUserId');

      if (!userId) {
        setStatus('error');
        setMessage('User ID not found. Please try again.');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      // Exchange code for token
      const response = await fetch('http://localhost:3001/api/instagram/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state, userId }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setMessage(`✅ Connected! Welcome @${data.instagram.username}`);
        sessionStorage.removeItem('instagramUserId');
        setTimeout(() => navigate('/'), 2000);
      } else {
        setStatus('error');
        setMessage(`Error: ${data.error}`);
        setTimeout(() => navigate('/'), 3000);
      }
    } catch (error) {
      setStatus('error');
      setMessage(`Error: ${error.message}`);
      setTimeout(() => navigate('/'), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4"
      >
        <div className="text-center">
          {status === 'processing' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Connecting...</h2>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
              <h2 className="text-2xl font-bold text-green-600 mb-2">Success!</h2>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-3xl">❌</span>
              </div>
              <h2 className="text-2xl font-bold text-red-600 mb-2">Connection Failed</h2>
            </>
          )}

          <p className="text-gray-600 text-lg">{message}</p>
          <p className="text-gray-500 text-sm mt-4">Redirecting...</p>
        </div>
      </motion.div>
    </div>
  );
};

export default InstagramCallback;

