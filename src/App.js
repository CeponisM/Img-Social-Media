import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import AppContent from './AppContent';
import './App.css';

function App() {
  return (
    <Router  basename="/9">
      <AppContent />
    </Router>
  );
}

export default App;
