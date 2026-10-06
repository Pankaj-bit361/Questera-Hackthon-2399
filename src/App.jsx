import React, {lazy, Suspense} from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
const LoginPage = lazy(() => import('./components/LoginPage'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const HomePage = lazy(() => import('./components/HomePage'));
const ChatPage = lazy(() => import('./components/ChatPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const AutopilotPage = lazy(() => import('./components/AutopilotPage'));
const PricingPage = lazy(() => import('./components/PricingPage'));
const SchedulerPage = lazy(() => import('./components/SchedulerPage'));
const TemplateManager = lazy(() => import('./components/TemplateManager'));
const InstagramCallback = lazy(() => import('./components/InstagramCallback'));
const LinkedInCallback = lazy(() => import('./components/LinkedInCallback'));
const TwitterCallback = lazy(() => import('./components/TwitterCallback'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const AnalyticsPage = lazy(() => import('./components/AnalyticsPage'));
const VideoChatPage = lazy(() => import('./components/VideoChatPage'));
const EmailCampaignDashboard = lazy(() => import('./components/EmailCampaignDashboard'));
const FirstWeekPage = lazy(() => import('./components/FirstWeekPage'));
import './App.css';

const MotionPage = lazy(() => import('./motion/MotionPage'));
const StudioPage = lazy(() => import('./studio/StudioPage'));
const studioView = <Suspense fallback={<div style={{minHeight:'100vh',background:'#0c0d0f',color:'#b8c5a4',display:'grid',placeItems:'center'}}>Opening Studio…</div>}><StudioPage /></Suspense>;
const motionView = <Suspense fallback={<div style={{minHeight:'100vh',background:'#101113',color:'#b8c5a4',display:'grid',placeItems:'center'}}>Opening Motion Studio…</div>}><MotionPage /></Suspense>;

function App() {
  return (
    <>
      <Router>
        <Suspense fallback={<div style={{minHeight:'100dvh',background:'#101113',color:'#b8c5a4',display:'grid',placeItems:'center'}}>Opening your workspace…</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/motion" element={studioView} />
          <Route path="/motion/classic" element={motionView} />
          <Route path="/motion/:projectId" element={motionView} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/chat/:chatId" element={<ChatPage />} />
          <Route path="/video/:chatId" element={<VideoChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/autopilot" element={<AutopilotPage />} />
          <Route path="/autopilot/:autopilotId" element={<AutopilotPage />} />
          <Route path="/first-week" element={<FirstWeekPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/scheduler" element={<SchedulerPage />} />
          <Route path="/templates" element={<TemplateManager />} />
          <Route path="/instagram/callback" element={<InstagramCallback />} />
          <Route path="/linkedin/callback" element={<LinkedInCallback />} />
          <Route path="/twitter/callback" element={<TwitterCallback />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/email-campaign" element={<EmailCampaignDashboard />} />
        </Routes>
        </Suspense>
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