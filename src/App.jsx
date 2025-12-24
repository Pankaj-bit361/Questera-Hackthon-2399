import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import LoginPage from './components/LoginPage';
import LandingPage from './components/LandingPage';
import HomePage from './components/HomePage';
import ChatPage from './components/ChatPage';
import SettingsPage from './components/SettingsPage';
import PricingPage from './components/PricingPage';
import SchedulerPage from './components/SchedulerPage';
import TemplateManager from './components/TemplateManager';
import InstagramCallback from './components/InstagramCallback';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import AnalyticsPage from './components/AnalyticsPage';
import VideoChatPage from './components/VideoChatPage';
import EmailCampaignDashboard from './components/EmailCampaignDashboard';
import './App.css';

function App() {
  return (
    <>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/video/:chatId" element={<VideoChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/scheduler" element={<SchedulerPage />} />
          <Route path="/templates" element={<TemplateManager />} />
          <Route path="/instagram/callback" element={<InstagramCallback />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/email-campaign" element={<EmailCampaignDashboard />} />
        </Routes>
      </Router>
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
        toastStyle={{
          backgroundColor: '#18181b',
          color: '#fff',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      />
    </>
  );
}

export default App;