import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { auth } from './firebase';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './components/Home';
import SignIn from './components/SignIn';
import SignUp from './components/SignUp';
import Profile from './components/Profile';
import ImageCapture from './components/ImageCapture';
import ImageEditor from './components/ImageEditor';
import PrivacySettings from './components/PrivacySettings';
import CompleteProfile from './components/CompleteProfile';
import Notifications from './components/Notifications';

import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <div className="App">
        <Header user={user} />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home user={user} />} />
            <Route path="/signup" element={user ? <Navigate to="/profile" /> : <SignUp />} />
            <Route path="/complete-profile" element={user ? <CompleteProfile /> : <Navigate to="/signin" />} />
            <Route path="/signin" element={user ? <Navigate to="/profile" /> : <SignIn />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile currentUser={user} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/:userId"
              element={<Profile currentUser={user} />}
            />
            <Route path="/capture" element={user ? <ImageCapture user={user} /> : <Navigate to="/signin" />} />
            <Route path="/edit" element={user ? <ImageEditor user={user} /> : <Navigate to="/signin" />} />
            <Route path="/privacy-settings" element={user ? <PrivacySettings user={user} /> : <Navigate to="/signin" />} />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <Notifications currentUser={user} />
                </ProtectedRoute>
              }
            />
            {/* <Route path="*" element={<Navigate to="/" replace />} /> */}
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
