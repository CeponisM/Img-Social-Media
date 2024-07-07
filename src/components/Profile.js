import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { storage, auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where, getDocs, orderBy, limit, startAfter, doc, addDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove, getDoc, increment, serverTimestamp } from 'firebase/firestore';
import { useNavigate, useParams } from 'react-router-dom';
import { createNotification } from '../utils/notificationHelpers';
import Modal from './Modal';
import './Profile.css';

function Profile({ currentUser }) {
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [privacySettings, setPrivacySettings] = useState({});
  const navigate = useNavigate();
  const observer = useRef();
  const POSTS_PER_PAGE = 9;

  const lastPostElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchMorePosts();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  const fetchUserData = useCallback(async () => {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        setUser({ id: userDocSnap.id, ...userData });
        setPrivacySettings(userData.privacySettings || {});
        setFollowers(userData.followers?.length || 0);
        setFollowing(userData.following?.length || 0);

        if (currentUser) {
          setIsFollowing(userData.followers?.includes(currentUser.uid) || false);
        }
      } else {
        setError('User not found');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Failed to load user data');
    }
  }, [userId, currentUser]);

  const handleFollowToggle = useCallback(async () => {
    if (!currentUser) {
      navigate('/signin');
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      const currentUserRef = doc(db, 'users', currentUser.uid);

      if (isFollowing) {
        await updateDoc(userRef, {
          followers: arrayRemove(currentUser.uid)
        });
        await updateDoc(currentUserRef, {
          following: arrayRemove(userId)
        });
        setFollowers(prev => prev - 1);
      } else {
        await updateDoc(userRef, {
          followers: arrayUnion(currentUser.uid)
        });
        await updateDoc(currentUserRef, {
          following: arrayUnion(userId)
        });
        setFollowers(prev => prev + 1);
        await createNotification(userId, currentUser.uid, 'follow');
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Error updating follow status:', error);
      setError('Failed to update follow status');
    }
  }, [currentUser, userId, isFollowing, navigate]);

  const fetchUserPosts = useCallback(async () => {
    try {
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(POSTS_PER_PAGE)
      );
      const querySnapshot = await getDocs(q);
      const fetchedPosts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPosts(fetchedPosts);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
    } catch (error) {
      console.error('Error fetching user posts:', error);
      setError('Failed to load user posts');
    }
  }, [userId]);

  const fetchMorePosts = useCallback(async () => {
    if (!lastVisible) return;
    try {
      setLoading(true);
      const q = query(
        collection(db, 'posts'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(POSTS_PER_PAGE)
      );
      const querySnapshot = await getDocs(q);
      const newPosts = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPosts(prevPosts => [...prevPosts, ...newPosts]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setHasMore(querySnapshot.docs.length === POSTS_PER_PAGE);
    } catch (error) {
      console.error('Error fetching more posts:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, lastVisible]);

  useEffect(() => {
    const loadProfileData = async () => {
      setLoading(true);
      try {
        await fetchUserData();
        await fetchUserPosts();
      } catch (error) {
        console.error('Error loading profile data:', error);
        setError('Failed to load profile data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, [fetchUserData, fetchUserPosts]);

  const handleProfilePictureUpload = useCallback(async (event) => {
    if (!currentUser || currentUser.uid !== userId) return;

    const file = event.target.files[0];
    if (!file) return;

    try {
      const storageRef = ref(storage, `profile_pictures/${userId}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'users', userId), {
        photoURL: downloadURL
      });

      setUser(prevUser => ({ ...prevUser, photoURL: downloadURL }));
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      setError('Failed to upload profile picture');
    }
  }, [currentUser, userId]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, [navigate]);

  const handleCreateNewLoop = useCallback(() => {
    navigate('/capture');
  }, [navigate]);

  const handleLike = useCallback(async (postId) => {
    if (!currentUser) {
      navigate('/signin');
      return;
    }

    try {
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      const currentLikes = postDoc.data().likes || [];

      if (currentLikes.includes(currentUser.uid)) {
        await updateDoc(postRef, {
          likes: arrayRemove(currentUser.uid)
        });
      } else {
        await updateDoc(postRef, {
          likes: arrayUnion(currentUser.uid)
        });
        if (postDoc.data().userId !== currentUser.uid) {
          await createNotification(postDoc.data().userId, currentUser.uid, 'like', postId);
        }
      }

      setPosts(prevPosts => prevPosts.map(post =>
        post.id === postId
          ? {
            ...post,
            likes: post.likes.includes(currentUser.uid)
              ? post.likes.filter(id => id !== currentUser.uid)
              : [...post.likes, currentUser.uid]
          }
          : post
      ));

      if (selectedPost && selectedPost.id === postId) {
        setSelectedPost(prevPost => ({
          ...prevPost,
          likes: prevPost.likes.includes(currentUser.uid)
            ? prevPost.likes.filter(id => id !== currentUser.uid)
            : [...prevPost.likes, currentUser.uid]
        }));
      }
    } catch (error) {
      console.error('Error updating like status:', error);
      setError('Failed to update like status');
    }
  }, [currentUser, navigate, selectedPost]);

  const handleComment = useCallback(async (postId, commentText) => {
    if (!currentUser) {
      navigate('/signin');
      return;
    }

    try {
      const commentRef = collection(db, 'comments');
      const newComment = {
        postId,
        userId: currentUser.uid,
        userName: currentUser.displayName,
        content: commentText,
        createdAt: serverTimestamp(),
        likes: [],
      };

      const docRef = await addDoc(commentRef, newComment);
      newComment.id = docRef.id;

      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        commentCount: increment(1)
      });

      const postDoc = await getDoc(postRef);
      if (postDoc.data().userId !== currentUser.uid) {
        await createNotification(postDoc.data().userId, currentUser.uid, 'comment', postId);
      }

      setPosts(prevPosts => prevPosts.map(post =>
        post.id === postId
          ? { ...post, commentCount: (post.commentCount || 0) + 1 }
          : post
      ));

      if (selectedPost && selectedPost.id === postId) {
        setSelectedPost(prevPost => ({
          ...prevPost,
          commentCount: (prevPost.commentCount || 0) + 1
        }));
      }

      return newComment;
    } catch (error) {
      console.error('Error adding comment:', error);
      setError('Failed to add comment');
    }
  }, [currentUser, navigate, selectedPost]);

  const renderPostContent = useCallback((post) => {
    if (!post) return null;

    if (post.imageUrls && post.imageUrls.length > 0) {
      if (post.imageUrls.length > 1) {
        return <img src={post.imageUrls[0]} alt="Loop thumbnail" className="post-thumbnail" loading="lazy" />;
      } else {
        return <img src={post.imageUrls[0]} alt="Post content" className="post-thumbnail" loading="lazy" />;
      }
    } else if (post.imageUrl) {
      return <img src={post.imageUrl} alt="Post content" className="post-thumbnail" loading="lazy" />;
    } else {
      return <div className="no-image">No image available</div>;
    }
  }, []);

  const memoizedPostGrid = useMemo(() => (
    <div className="posts-grid">
      {posts.map((post, index) => (
        <div
          key={post.id}
          className="post"
          ref={index === posts.length - 1 ? lastPostElementRef : null}
          onClick={() => setSelectedPost(post)}
        >
          {renderPostContent(post)}
          <div className="post-overlay">
            <p className="post-caption">{post.caption || 'No caption'}</p>
            <div className="post-stats">
              <span>{post.likes.length} likes</span>
              <span>{post.commentCount || 0} comments</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  ), [posts, lastPostElementRef, renderPostContent, setSelectedPost]);

  const canViewPosts = useCallback(() => {
    if (currentUser && currentUser.uid === user?.id) return true;
    if (privacySettings.postsVisibility === 'public') return true;
    if (privacySettings.postsVisibility === 'followers' && isFollowing) return true;
    return false;
  }, [currentUser, user, privacySettings, isFollowing]);

  if (error) {
    return (
      <div className="profile error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Go to Home</button>
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  if (error) {
    return (
      <div className="profile error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Go to Home</button>
      </div>
    );
  }

  return (
    <div className="profile">
      <div className="profile-header">
        <img
          src={user.photoURL || '/default-avatar.png'}
          alt={`${user.username}'s profile`}
          className="profile-picture"
        />
        {currentUser && currentUser.uid === userId && (
          <input
            type="file"
            accept="image/*"
            onChange={handleProfilePictureUpload}
            style={{ display: 'none' }}
            id="profile-picture-upload"
          />
        )}
        {currentUser && currentUser.uid === userId && (
          <label htmlFor="profile-picture-upload" className="upload-button">
            Change Profile Picture
          </label>
        )}
        <div className="profile-info">
          <h2>{user.username}</h2>
          <p>{followers} followers · {following} following</p>
          <p className="bio">{user.bio}</p>
          <div className="profile-actions">
            {currentUser && currentUser.uid === user.id ? (
              <>
                <button onClick={handleCreateNewLoop} className="create-loop-btn">Create New Loop</button>
                <button onClick={handleSignOut} className="sign-out-btn">Sign Out</button>
              </>
            ) : (
              <>
                {currentUser && currentUser.uid !== userId && (
                  <button onClick={handleFollowToggle} className={isFollowing ? 'unfollow-btn' : 'follow-btn'}>
                    {isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {canViewPosts() ? (
        <>
          {memoizedPostGrid}

          {loading && <div className="loading">Loading...</div>}
          {!hasMore && <div className="no-more-posts">No more posts to load</div>}

          {selectedPost && (
            <Modal
              onClose={() => setSelectedPost(null)}
              post={selectedPost}
              user={user}
              currentUser={currentUser}
              onLike={handleLike}
              onComment={handleComment}
            />
          )}
        </>
      ) : (
        <div className="private-profile">
          <p>This profile is private. Follow this user to see their posts.</p>
        </div>
      )}
    </div>
  );
}

export default Profile;
