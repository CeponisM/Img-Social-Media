import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { auth, db } from '../firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, startAfter } from 'firebase/firestore';
import FeedPost from './FeedPost';
import './Home.css';

function Home({ user }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [followingIds, setFollowingIds] = useState([]);

  useEffect(() => {
    if (user) {
      fetchFollowingIds();
    }
  }, [user]);

  const fetchFollowingIds = async () => {
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

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('userId', 'in', [...followingIds, user.uid]),
        orderBy('createdAt', 'desc'),
        limit(5)
      );

      const querySnapshot = await getDocs(q);
      const fetchedPosts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setPosts(fetchedPosts);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setHasMore(querySnapshot.docs.length === 5);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  }, [followingIds, user]);

  const fetchMorePosts = useCallback(async () => {
    if (!lastVisible) return;
    try {
      setLoading(true);
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('userId', 'in', [...followingIds, user.uid]),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(5)
      );

      const querySnapshot = await getDocs(q);
      const newPosts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setPosts(prevPosts => [...prevPosts, ...newPosts]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setHasMore(querySnapshot.docs.length === 5);
    } catch (error) {
      console.error('Error fetching more posts:', error);
    } finally {
      setLoading(false);
    }
  }, [followingIds, user, lastVisible]);

  useEffect(() => {
    if (user && followingIds.length > 0) {
      fetchPosts();
    }
  }, [user, followingIds, fetchPosts]);

  if (!user) {
    return (
      <div className="home">
        <h2>Welcome to our VSCO-Style App</h2>
        <p>Create beautiful image loops, apply filters, and manage your tasks all in one place.</p>
        <div className="cta-buttons">
          <Link to="/signin" className="btn btn-primary">Sign In</Link>
          <Link to="/signup" className="btn btn-secondary">Sign Up</Link>
        </div>
        <div className="features">
          <h3>Features:</h3>
          <ul>
            <li>Capture multiple images and create loops</li>
            <li>Apply custom filters to your loops</li>
            <li>Customize your profile</li>
            <li>Share your creations with your followers</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="home feed">
      <h2>Your Feed</h2>
      {posts.map(post => (
        <FeedPost key={post.id} post={post} user={user} />
      ))}
      {loading && <div className="loading">Loading...</div>}
      {!loading && hasMore && (
        <button onClick={fetchMorePosts} className="load-more-btn">Load More</button>
      )}
      {!loading && !hasMore && <div className="no-more-posts">No more posts to load</div>}
    </div>
  );
}

export default Home;