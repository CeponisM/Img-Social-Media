import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [isUsernameTaken, setIsUsernameTaken] = useState(false);
  const navigate = useNavigate();

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

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (isUsernameTaken) {
      setError("Please choose a different username.");
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        username,
        email,
        photoURL: null,
        followers: [],
        following: ["DYNjzN8DqIakiOFnTqwzJveGmIn2"],
        privacySettings: { postsVisibility: 'public' }
      });

      navigate('/complete-profile', { state: { user: userCredential.user } });
    } catch (error) {
      setError(error.message);
    }
  };

  const handleGoogleSignUp = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
  
      // Check if the user document already exists
      const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', user.email)));
  
      if (userDoc.empty) {
        // If the user document does not exist, create it
        await setDoc(doc(db, 'users', user.uid), {
          username: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          followers: [],
          following: ["DYNjzN8DqIakiOFnTqwzJveGmIn2"],
          privacySettings: { postsVisibility: 'public' }
        });
  
        navigate('/complete-profile', { state: { user } });
      } else {
        // If the user document exists, navigate to the profile page
        navigate(`/profile/${user.uid}`);
      }
    } catch (error) {
      setError(error.message);
    }
  };
  

  return (
    <div className="sign-up">
      <h2>Sign Up</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSignUp}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={handleUsernameChange}
          required
        />
        {isUsernameTaken && <p className="error">This username is already taken.</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={isUsernameTaken}>Sign Up</button>
      </form>
      <button onClick={handleGoogleSignUp}>Sign Up with Google</button>
    </div>
  );
}

export default SignUp;
