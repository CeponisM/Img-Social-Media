import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc,
  startAfter 
} from 'firebase/firestore';
import FeedPost from './FeedPost';
import { motion, AnimatePresence } from 'framer-motion';
import './Home.css';

// Memoized FeedPost component for better performance
const MemoizedFeedPost = memo(FeedPost);

function Home({ user }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [followingIds, setFollowingIds] = useState([]);
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const observer = useRef();
  const lastPostRef = useRef();
  const postsPerPage = 5; // Easy to adjust later

  // Fetch following IDs when user changes
  useEffect(() => {
    const fetchFollowingIds = async () => {
      if (!user) return;
      
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setFollowingIds(userData.following || []);
        }
      } catch (error) {
        console.error('Error fetching following IDs:', error);
      }
    };

    fetchFollowingIds();
  }, [user]);

  // Handle Firebase's "in" array limit (max 10 items) by batching queries
  const fetchPostsFromUserIds = useCallback(async (userIds, afterDoc = null) => {
    let allPosts = [];
    
    // Create batches of 10 IDs (Firebase limit for "in" operator)
    for (let i = 0; i < userIds.length; i += 10) {
      const batchIds = userIds.slice(i, i + 10);
      if (batchIds.length === 0) continue;
      
      const postsRef = collection(db, 'posts');
      let q;
      
      if (afterDoc && i === 0) {
        // Only apply startAfter to the first batch
        q = query(
          postsRef,
          where('userId', 'in', batchIds),
          orderBy('createdAt', 'desc'),
          startAfter(afterDoc),
          limit(postsPerPage)
        );
      } else {
        q = query(
          postsRef,
          where('userId', 'in', batchIds),
          orderBy('createdAt', 'desc'),
          limit(postsPerPage)
        );
      }

      const querySnapshot = await getDocs(q);
      
      const batchPosts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore timestamps to JS Date objects
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));
      
      allPosts = [...allPosts, ...batchPosts];
      
      // Set last visible from the first batch only
      if (i === 0 && querySnapshot.docs.length > 0) {
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      }
    }
    
    // Sort all posts by creation date
    return allPosts.sort((a, b) => b.createdAt - a.createdAt);
  }, []);

  // Main posts fetch function
  const fetchPosts = useCallback(async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      let userIds = [];
      
      // If user is not following anyone, still show their own posts
      if (followingIds.length === 0) {
        userIds = [user.uid];
      } else {
        userIds = [...followingIds, user.uid];
      }
      
      const fetchedPosts = await fetchPostsFromUserIds(userIds);
      
      // Limit to postsPerPage items for initial load
      const limitedPosts = fetchedPosts.slice(0, postsPerPage);
      
      setPosts(limitedPosts);
      setHasMore(fetchedPosts.length === postsPerPage);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [user, followingIds, fetchPostsFromUserIds]);

  // Load more posts for infinite scrolling
  const fetchMorePosts = useCallback(async () => {
    if (!lastVisible || loading || !hasMore || !user) return;
    
    try {
      setLoading(true);
      
      let userIds = [];
      
      if (followingIds.length === 0) {
        userIds = [user.uid];
      } else {
        userIds = [...followingIds, user.uid];
      }
      
      const newPosts = await fetchPostsFromUserIds(userIds, lastVisible);
      
      if (newPosts.length > 0) {
        setPosts(prevPosts => {
          // Filter out any duplicates before adding new posts
          const existingIds = new Set(prevPosts.map(post => post.id));
          const uniqueNewPosts = newPosts.filter(post => !existingIds.has(post.id));
          return [...prevPosts, ...uniqueNewPosts];
        });
      }
      
      setHasMore(newPosts.length === postsPerPage);
    } catch (error) {
      console.error('Error fetching more posts:', error);
    } finally {
      setLoading(false);
    }
  }, [user, followingIds, lastVisible, loading, hasMore, fetchPostsFromUserIds]);

  // Fetch posts when user or followingIds change
  useEffect(() => {
    if (user) {
      fetchPosts();
    }
  }, [user, followingIds, fetchPosts]);

  // Setup Intersection Observer for infinite scrolling
  useEffect(() => {
    if (!hasMore || loading || !lastPostRef.current) return;
    
    if (observer.current) observer.current.disconnect();
    
    const options = {
      root: null, // Use viewport as root
      rootMargin: '100px', // Start loading before the element is visible
      threshold: 0.1 // Trigger when 10% of the element is visible
    };
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        fetchMorePosts();
      }
    }, options);
    
    observer.current.observe(lastPostRef.current);
    
    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, [hasMore, loading, fetchMorePosts]);
  
  // Fetch suggested users
  useEffect(() => {
    const fetchSuggestedUsers = async () => {
      if (!user) return;
      
      try {
        // Get users that the current user is not following
        const usersRef = collection(db, 'users');
        const q = query(
          usersRef,
          where('uid', '!=', user.uid),
          limit(10)
        );
        
        const querySnapshot = await getDocs(q);
        const allUsers = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Filter out users that are already being followed
        const followingSet = new Set(followingIds);
        const filteredUsers = allUsers.filter(u => 
          u.id !== user.uid && 
          !followingSet.has(u.id)
        );
        
        // Randomize and limit to 3 suggestions
        const shuffled = filteredUsers.sort(() => 0.5 - Math.random());
        setSuggestedUsers(shuffled.slice(0, 3));
      } catch (error) {
        console.error('Error fetching suggested users:', error);
      }
    };
    
    if (user) {
      fetchSuggestedUsers();
    }
  }, [user, followingIds]);

  // Handle follow/unfollow user action
  const handleFollowUser = useCallback(async (userId) => {
    if (!user) return;
    
    try {
      // Update the current user's following list
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentFollowing = userData.following || [];
        
        // Add userId to following list if not already following
        if (!currentFollowing.includes(userId)) {
          await updateDoc(userRef, {
            following: [...currentFollowing, userId]
          });
          
          // Update local state
          setFollowingIds(prev => [...prev, userId]);
          
          // Remove from suggested users
          setSuggestedUsers(prev => prev.filter(u => u.id !== userId));
        }
      }
    } catch (error) {
      console.error('Error following user:', error);
    }
  }, [user]);

  // Landing page for non-authenticated users
  if (!user) {
    return (
      <motion.div 
        className="landing-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div 
          className="landing-hero"
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <h1>Create, Share, Connect</h1>
          <p>Capture beautiful moments, apply stunning filters, and share with your community</p>
          
          <div className="cta-buttons">
            <Link to="/signin" className="cta-button primary">Sign In</Link>
            <Link to="/signup" className="cta-button secondary">Create Account</Link>
          </div>
        </motion.div>
        
        <div className="landing-features">
          <motion.div 
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <div className="feature-icon">📷</div>
            <div className='feature-card-spacer' />
            <h3>Loop Images</h3>
            <p>Capture multiple images and create stunning visual loops that tell your story</p>
          </motion.div>
          
          <motion.div 
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <div className="feature-icon">🎨</div>
            <div className='feature-card-spacer' />
            <h3>Custom Filters</h3>
            <p>Apply beautiful filters and adjustments to make your visuals stand out</p>
          </motion.div>
          
          <motion.div 
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <div className="feature-icon">👥</div>
            <div className='feature-card-spacer' />
            <h3>Connect</h3>
            <p>Share your creations and connect with a community of like-minded creators</p>
          </motion.div>

          <motion.div 
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <div className="feature-icon">✨</div>
            <div className='feature-card-spacer' />
            <h3>Show Your Style</h3>
            <p>Customize a unique profile that highlights your best work and personal aesthetic</p>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  // Main feed for authenticated users
  return (
    <div className="home-container">
      <div className="feed-container">
        <motion.h2 
          className="feed-title"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          Your Feed
        </motion.h2>
        
        {initialLoading ? (
          <div className="skeleton-container">
            {[1, 2, 3].map(i => (
              <div key={i} className="post-skeleton">
                <div className="skeleton-header">
                  <div className="skeleton-avatar"></div>
                  <div className="skeleton-username"></div>
                </div>
                <div className="skeleton-image"></div>
                <div className="skeleton-actions"></div>
                <div className="skeleton-caption"></div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-feed">
            <div className="empty-icon">📷</div>
            <h3>No Posts Yet</h3>
            <p>Follow more users to see their posts in your feed</p>
            <Link to="/explore" className="primary-button">Explore Users</Link>
          </div>
        ) : (
          <AnimatePresence>
            <div className="feed">
              {posts.map((post, index) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  ref={index === posts.length - 1 ? lastPostRef : null}
                >
                  <MemoizedFeedPost post={post} user={user} />
                </motion.div>
              ))}
              
              {loading && !initialLoading && (
                <div className="loading-indicator">
                  <div className="loading-spinner"></div>
                  <p>Loading more posts...</p>
                </div>
              )}
              
              {!loading && !hasMore && posts.length > 0 && (
                <div className="end-message">You've reached the end of your feed</div>
              )}
            </div>
          </AnimatePresence>
        )}
      </div>
      
      <div className="sidebar">
        <div className="user-profile-card">
          <Link to={`/profile/${user.uid}`} className="user-avatar">
            <img 
              src={user.photoURL || '/default-avatar.png'} 
              alt={user.displayName || 'User avatar'} 
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/default-avatar.png';
              }}
            />
          </Link>
          <div className="user-info">
            <Link to={`/profile/${user.uid}`} className="username">
              {user.displayName || 'User'}
            </Link>
            <span className="user-email">{user.email}</span>
          </div>
        </div>
        
        {suggestedUsers.length > 0 && (
          <div className="suggested-users">
            <h3>Suggested for you</h3>
            {suggestedUsers.map(suggestedUser => (
              <div key={suggestedUser.id} className="suggested-user">
                <Link to={`/profile/${suggestedUser.id}`} className="user-avatar small">
                  <img 
                    src={suggestedUser.photoURL || '/default-avatar.png'} 
                    alt={suggestedUser.displayName || 'User avatar'} 
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '/default-avatar.png';
                    }}
                  />
                </Link>
                <div className="user-info">
                  <Link to={`/profile/${suggestedUser.id}`} className="username small">
                    {suggestedUser.displayName || suggestedUser.username || 'User'}
                  </Link>
                  <span className="suggestion-reason">Suggested for you</span>
                </div>
                <button 
                  className="follow-button"
                  onClick={() => handleFollowUser(suggestedUser.id)}
                >
                  Follow
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="app-info">
          <div className="links">
            <a href="/about">About</a> • 
            <a href="/help">Help</a> • 
            <a href="/privacy">Privacy</a> • 
            <a href="/terms">Terms</a>
          </div>
          <p className="copyright">© {new Date().getFullYear()} VSCO-Style App</p>
        </div>
      </div>
    </div>
  );
}

export default Home;