import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../common/SafeIcon';

const { FiInstagram, FiLogOut, FiCheck } = FiIcons;

const InstagramConnect = ({ userId }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [instagramInfo, setInstagramInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkInstagramConnection();
  }, [userId]);

  const checkInstagramConnection = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/instagram/info/${userId}`);
      const data = await response.json();

      if (data.success) {
        setIsConnected(true);
        setInstagramInfo(data.instagram);
      }
    } catch (err) {
      console.log('Not connected to Instagram yet');
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get OAuth URL
      const response = await fetch('http://localhost:3001/api/instagram/oauth-url');
      const data = await response.json();

      if (data.success) {
        // Store userId in sessionStorage for callback
        sessionStorage.setItem('instagramUserId', userId);
        // Redirect to Facebook OAuth
        window.location.href = data.oauthUrl;
      } else {
        setError('Failed to get OAuth URL');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/instagram/disconnect/${userId}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setIsConnected(false);
        setInstagramInfo(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <SafeIcon icon={FiInstagram} className="w-6 h-6" />
          <h3 className="text-xl font-bold">Instagram Integration</h3>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {isConnected && instagramInfo ? (
          <div className="space-y-4">
            <div className="bg-white/10 rounded-lg p-4">
              {instagramInfo.profilePictureUrl && (
                <img
                  src={instagramInfo.profilePictureUrl}
                  alt={instagramInfo.username}
                  className="w-16 h-16 rounded-full mx-auto mb-3"
                />
              )}
              <p className="text-center font-semibold">@{instagramInfo.username}</p>
              <p className="text-center text-sm text-white/80">{instagramInfo.name}</p>
              <p className="text-center text-xs text-white/60 mt-2">
                Connected on {new Date(instagramInfo.connectedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2 text-green-300">
              <SafeIcon icon={FiCheck} className="w-5 h-5" />
              <span className="text-sm font-medium">Connected & Ready to Post</span>
            </div>

            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <SafeIcon icon={FiLogOut} className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-white/80">
              Connect your Instagram Business Account to auto-publish generated images.
            </p>

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full bg-white text-purple-600 hover:bg-gray-100 disabled:opacity-50 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <SafeIcon icon={FiInstagram} className="w-5 h-5" />
              {loading ? 'Connecting...' : 'Connect Instagram'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default InstagramConnect;