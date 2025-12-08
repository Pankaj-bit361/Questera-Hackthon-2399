import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import HomePage from './components/HomePage';
import ChatPage from './components/ChatPage';
import InstagramCallback from './components/InstagramCallback';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/chat/:chatId" element={<ChatPage />} />
        <Route path="/instagram/callback" element={<InstagramCallback />} />
      </Routes>
    </Router>
  );
}

export default App;