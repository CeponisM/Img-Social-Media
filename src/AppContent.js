import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
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

function AppContent() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [modalPost, setModalPost] = useState(null);
    const navigate = useNavigate();

    const toggleDarkMode = () => {
        const newDarkMode = !darkMode;
        setDarkMode(newDarkMode);
        document.documentElement.classList.toggle('dark-mode', newDarkMode);
        localStorage.setItem('darkMode', newDarkMode);
    };

    useEffect(() => {
        const savedDarkMode = localStorage.getItem('darkMode') === 'true';
        setDarkMode(savedDarkMode);
        document.documentElement.classList.toggle('dark-mode', savedDarkMode);
    }, []);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setUser(user);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const openProfile = (userId) => {
        navigate(`/profile/${userId}`);
    };

    const openPostModal = async (postId, userId) => {
        if (!postId || !userId) {
            console.error('Invalid postId or userId', { postId, userId });
            return;
        }

        navigate(`/profile/${userId}`);

        try {
            console.log('Attempting to fetch post', { postId, userId });
            const postRef = doc(db, 'posts', postId);
            console.log('Post reference:', postRef);

            const postDoc = await getDoc(postRef);
            console.log('Post document:', postDoc);

            if (postDoc.exists()) {
                const postData = postDoc.data();
                console.log('Post data:', postData);
                setModalPost({ id: postDoc.id, ...postData });
            } else {
                console.error('Post not found');
            }
        } catch (error) {
            console.error('Error fetching post:', error);
        }
    };

    if (loading) {
        return <div className="loading">Loading...</div>;
    }

    return (
        <div className="App">
            <Header user={user} darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
            <main className="main-content content-below-header">
                <Routes>
                    <Route path="/" element={<Home user={user} />} />
                    <Route path="/signup" element={user ? <Navigate to="/profile" /> : <SignUp />} />
                    <Route path="/complete-profile" element={user ? <CompleteProfile /> : <Navigate to="/signin" />} />
                    <Route path="/signin" element={user ? <Navigate to="/profile" /> : <SignIn />} />
                    <Route
                        path="/profile/"
                        element={
                            <ProtectedRoute>
                                <Profile currentUser={user} modalPost={modalPost} setModalPost={setModalPost} />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/profile/:userId"
                        element={<Profile currentUser={user} modalPost={modalPost} setModalPost={setModalPost} />}
                    />
                    <Route path="/capture" element={user ? <ImageCapture user={user} /> : <Navigate to="/signin" />} />
                    <Route path="/edit" element={user ? <ImageEditor user={user} /> : <Navigate to="/signin" />} />
                    <Route path="/privacy-settings" element={user ? <PrivacySettings user={user} /> : <Navigate to="/signin" />} />
                    <Route
                        path="/notifications"
                        element={
                            <ProtectedRoute>
                                <Notifications
                                    currentUser={user}
                                    openPostModal={openPostModal}
                                    openProfile={openProfile}
                                />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </main>
        </div>
    );
}

export default AppContent;