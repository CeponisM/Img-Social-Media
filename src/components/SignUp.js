import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { motion } from 'framer-motion';
import './Auth.css';

function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isUsernameTaken, setIsUsernameTaken] = useState(false);
  const [isUsernameChecking, setIsUsernameChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Reset general error when any input changes
  useEffect(() => {
    if (error) setError(null);
  }, [email, password, confirmPassword, username]);

  // Validate password match when either password field changes
  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setFieldErrors(prev => ({ ...prev, confirmPassword: "Passwords don't match" }));
    } else {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.confirmPassword;
        return newErrors;
      });
    }
  }, [password, confirmPassword]);

  const checkUsername = async (name) => {
    if (name.length < 3) {
      setFieldErrors(prev => ({ ...prev, username: 'Username must be at least 3 characters' }));
      setIsUsernameTaken(false);
      return;
    }
    
    // Check for valid characters (letters, numbers, underscores, periods)
    if (!/^[a-zA-Z0-9._]+$/.test(name)) {
      setFieldErrors(prev => ({ ...prev, username: 'Username can only contain letters, numbers, periods and underscores' }));
      setIsUsernameTaken(false);
      return;
    }
    
    try {
      setIsUsernameChecking(true);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', name.toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setFieldErrors(prev => ({ ...prev, username: 'This username is already taken' }));
        setIsUsernameTaken(true);
      } else {
        // Username is available, remove any previous username error
        setFieldErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.username;
          return newErrors;
        });
        setIsUsernameTaken(false);
      }
    } catch (error) {
      console.error('Error checking username:', error);
    } finally {
      setIsUsernameChecking(false);
    }
  };

  // Debounced username check
  useEffect(() => {
    const handler = setTimeout(() => {
      if (username && username.length >= 3) {
        checkUsername(username);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [username]);

  const handleUsernameChange = (e) => {
    const name = e.target.value;
    setUsername(name);
    
    // Immediate client-side validation
    if (name.length < 3 && name.length > 0) {
      setFieldErrors(prev => ({ ...prev, username: 'Username must be at least 3 characters' }));
    } else if (!/^[a-zA-Z0-9._]+$/.test(name) && name.length > 0) {
      setFieldErrors(prev => ({ ...prev, username: 'Username can only contain letters, numbers, periods and underscores' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    let isValid = true;

    if (!username || username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
      isValid = false;
    }

    if (!email) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
      isValid = false;
    }

    if (!password) {
      newErrors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      isValid = false;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords don't match";
      isValid = false;
    }

    setFieldErrors(newErrors);
    return isValid;
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    
    if (!validateForm() || isUsernameTaken) {
      return;
    }
    
    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: username.toLowerCase(),
        displayName: username,
        email,
        photoURL: null,
        followers: [],
        following: ["DYNjzN8DqIakiOFnTqwzJveGmIn2"],
        privacySettings: { postsVisibility: 'public' },
        createdAt: new Date()
      });

      navigate('/complete-profile', { state: { user: userCredential.user } });
    } catch (error) {
      console.error('Sign up error:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak. Please use a stronger password.');
      } else {
        setError('An error occurred during sign up. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
  
      // Check if the user document already exists
      const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', user.email)));
  
      if (userDoc.empty) {
        // Generate a username based on display name
        let suggestedUsername = user.displayName?.toLowerCase().replace(/\s+/g, '.') || '';
        
        // Check if the username is taken and modify if necessary
        let isUnique = false;
        let counter = 0;
        let finalUsername = suggestedUsername;
        
        while (!isUnique && counter < 5) {
          const usernameCheck = await getDocs(query(collection(db, 'users'), where('username', '==', finalUsername)));
          if (usernameCheck.empty) {
            isUnique = true;
          } else {
            counter++;
            finalUsername = `${suggestedUsername}${counter}`;
          }
        }
        
        // If we couldn't find a unique username, use email prefix
        if (!isUnique) {
          finalUsername = user.email.split('@')[0];
        }
        
        // Create user document
        await setDoc(doc(db, 'users', user.uid), {
          username: finalUsername,
          displayName: user.displayName || finalUsername,
          email: user.email,
          photoURL: user.photoURL,
          followers: [],
          following: ["DYNjzN8DqIakiOFnTqwzJveGmIn2"],
          privacySettings: { postsVisibility: 'public' },
          createdAt: new Date()
        });
  
        navigate('/complete-profile', { state: { user } });
      } else {
        // If the user document exists, navigate to the profile page
        navigate(`/profile/${user.uid}`);
      }
    } catch (error) {
      console.error('Google sign up error:', error);
      setError('Failed to sign up with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      className="auth-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <button className="back-button" onClick={() => navigate('/')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      
      <div className="auth-header">
        <h2>Create Account</h2>
        <p>Join our creative community</p>
      </div>
      
      {error && (
        <motion.div 
          className="error-message"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {error}
        </motion.div>
      )}
      
      <form className="auth-form" onSubmit={handleSignUp}>
        <div className={`form-group ${fieldErrors.username ? 'has-error' : ''}`}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={handleUsernameChange}
            required
            disabled={loading}
          />
          {fieldErrors.username && <div className="error-message">{fieldErrors.username}</div>}
          {isUsernameChecking && <div className="checking-message">Checking availability...</div>}
        </div>
        
        <div className={`form-group ${fieldErrors.email ? 'has-error' : ''}`}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          {fieldErrors.email && <div className="error-message">{fieldErrors.email}</div>}
        </div>
        
        <div className={`form-group ${fieldErrors.password ? 'has-error' : ''}`}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          {fieldErrors.password && <div className="error-message">{fieldErrors.password}</div>}
        </div>
        
        <div className={`form-group ${fieldErrors.confirmPassword ? 'has-error' : ''}`}>
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
          />
          {fieldErrors.confirmPassword && <div className="error-message">{fieldErrors.confirmPassword}</div>}
        </div>
        
        <button 
          type="submit" 
          className={`auth-btn ${(loading || isUsernameTaken) ? 'disabled' : ''}`}
          disabled={loading || isUsernameTaken}
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
        </button>
      </form>
      
      <div className="auth-divider">
        <span>OR</span>
      </div>
      
      <button 
        onClick={handleGoogleSignUp} 
        className="social-login-btn"
        disabled={loading}
      >
        <div className="google-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21.8055 10.0415H21V10H12V14H17.6515C16.827 16.3285 14.6115 18 12 18C8.6865 18 6 15.3135 6 12C6 8.6865 8.6865 6 12 6C13.5295 6 14.921 6.577 15.9805 7.5195L18.809 4.691C17.023 3.0265 14.634 2 12 2C6.4775 2 2 6.4775 2 12C2 17.5225 6.4775 22 12 22C17.5225 22 22 17.5225 22 12C22 11.3295 21.931 10.675 21.8055 10.0415Z" fill="#FFC107"/>
            <path d="M3.15295 7.3455L6.43845 9.755C7.32745 7.554 9.48045 6 12 6C13.5295 6 14.921 6.577 15.9805 7.5195L18.809 4.691C17.023 3.0265 14.634 2 12 2C8.15895 2 4.82795 4.1685 3.15295 7.3455Z" fill="#FF3D00"/>
            <path d="M12 22C14.583 22 16.93 21.0115 18.7045 19.404L15.6095 16.785C14.5718 17.5742 13.3037 18.001 12 18C9.39903 18 7.19053 16.3415 6.35853 14.027L3.09753 16.5395C4.75253 19.778 8.11353 22 12 22Z" fill="#4CAF50"/>
            <path d="M21.8055 10.0415H21V10H12V14H17.6515C17.2571 15.1082 16.5467 16.0766 15.608 16.7855L15.6095 16.7845L18.7045 19.4035C18.4855 19.6025 22 17 22 12C22 11.3295 21.931 10.675 21.8055 10.0415Z" fill="#1976D2"/>
          </svg>
        </div>
        Sign Up with Google
      </button>
      
      <div className="auth-footer">
        <p>Already have an account? <Link to="/signin">Sign In</Link></p>
      </div>
    </motion.div>
  );
}

export default SignUp;