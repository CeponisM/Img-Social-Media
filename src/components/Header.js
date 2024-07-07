import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, limit, onSnapshot } from 'firebase/firestore';
import './Header.css';

function Header({ user }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      const userRef = collection(db, 'users');
      const q = query(userRef, where('uid', '==', user.uid));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          setUnreadNotifications(userData.unreadNotifications || 0);
        }
      });

      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm) {
        handleSearch();
      } else {
        setSearchResults([]);
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;

    try {
      const q = query(
        collection(db, 'users'),
        where('username', '>=', searchTerm.toLowerCase()),
        where('username', '<=', searchTerm.toLowerCase() + '\uf8ff'),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSearchResults(results);
      setShowDropdown(true);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const handleSelectUser = (userId) => {
    navigate(`/profile/${userId}`);
    setSearchTerm('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo"><h1>VSCO-Style App</h1></Link>
        <nav>
          {user ? (
            <>
              <Link to={`/profile/${user.uid}`}>Profile</Link>
              <Link to="/capture">Create Loop</Link>
              <Link to="/notifications" className="notifications-link">
                Notifications
                {unreadNotifications > 0 && (
                  <span className="notification-badge">{unreadNotifications}</span>
                )}
              </Link>
              <div className="search-container" ref={searchRef}>
                <input
                  type="text"
                  placeholder="Search users"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {showDropdown && searchResults.length > 0 && (
                  <ul className="search-dropdown">
                    {searchResults.map(result => (
                      <li key={result.id} onClick={() => handleSelectUser(result.id)}>
                        <img src={result.photoURL || '/default-avatar.png'} alt={result.username} />
                        <span>{result.username}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={handleSignOut} className="sign-out-btn">Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/signin">Sign In</Link>
              <Link to="/signup">Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Header;
