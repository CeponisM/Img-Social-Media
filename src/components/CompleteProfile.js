import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';

function CompleteProfile() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [isUsernameTaken, setIsUsernameTaken] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        navigate('/signin');
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  const checkUsername = async (name) => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', '==', name));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  };

  const handleUsernameChange = async (e) => {
    const name = e.target.value.toLowerCase();
    setUsername(name);
    if (name.length > 0) {
      const taken = await checkUsername(name);
      setIsUsernameTaken(taken);
    } else {
      setIsUsernameTaken(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    
    if (isUsernameTaken) {
      setError("Please choose a different username.");
      return;
    }
    try {
      await setDoc(doc(db, 'users', user.uid), {
        username,
        email: user.email,
        photoURL: user.photoURL,
        followers: [],
        following: ["DYNjzN8DqIakiOFnTqwzJveGmIn2"],
        privacySettings: { postsVisibility: 'public' },
        profileCompleted: true
      });
      navigate(`/profile/${user.uid}`);
    } catch (error) {
      setError(error.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/signin');
    } catch (error) {
      setError(error.message);
    }
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="complete-profile">
      <h2>Complete Your Profile</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Choose a Username"
          value={username}
          onChange={handleUsernameChange}
          required
        />
        {isUsernameTaken && <p className="error">This username is already taken.</p>}
        <button type="submit" disabled={isUsernameTaken}>Complete Profile</button>
      </form>
      <button onClick={handleSignOut}>Sign Out</button>
    </div>
  );
}

export default CompleteProfile;
