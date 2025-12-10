import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import HomePage from './components/HomePage';
import ChatPage from './components/ChatPage';
import SettingsPage from './components/SettingsPage';
import PricingPage from './components/PricingPage';
import SchedulerPage from './components/SchedulerPage';
import TemplateManager from './components/TemplateManager';
import InstagramCallback from './components/InstagramCallback';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/chat/:chatId" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/scheduler" element={<SchedulerPage />} />
        <Route path="/templates" element={<TemplateManager />} />
        <Route path="/instagram/callback" element={<InstagramCallback />} />
      </Routes>
    </Router>
  );
}

export default App;