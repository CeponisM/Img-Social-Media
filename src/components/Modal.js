import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, limit, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove, doc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import defaultAvatar from '../assets/default-avatar.png';
import './Modal.css';

const Modal = React.memo(({ post, onClose, user, currentUser, onLike, onComment, handleUserClick }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [error, setError] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedComments, setExpandedComments] = useState({});
  const [postUserData, setPostUserData] = useState(null);
  const [isLiked, setIsLiked] = useState(post?.likes?.includes(currentUser?.uid));
  const [likes, setLikes] = useState(post?.likes || []);

  useEffect(() => {
    if (post?.userId) {
      fetchUserData(post.userId).then(setPostUserData);
    }
  }, [post?.userId]);

  const sanitizeInput = useCallback((input) => {
    return DOMPurify.sanitize(input);
  }, []);

  const fetchUserData = async (userId) => {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        return userDocSnap.data();
      }
      return null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  };

  useEffect(() => {
    if (!post?.id) {
      setError('Invalid post data');
      return;
    }

    const commentsQuery = query(
      collection(db, 'comments'),
      where('postId', '==', post.id),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
      const fetchedComments = await Promise.all(snapshot.docs.map(async (doc) => {
        const commentData = { id: doc.id, ...doc.data() };
        const userData = await fetchUserData(commentData.userId);
        return {
          ...commentData,
          userAvatar: userData?.photoURL || defaultAvatar,
          userName: userData?.username || 'Unknown User'
        };
      }));

      const commentsWithReplies = await Promise.all(fetchedComments.map(async (comment) => {
        const repliesQuery = query(
          collection(db, 'comments', comment.id, 'replies'),
          orderBy('createdAt', 'asc')
        );
        const repliesSnapshot = await getDocs(repliesQuery);
        const replies = await Promise.all(repliesSnapshot.docs.map(async (doc) => {
          const replyData = { id: doc.id, ...doc.data() };
          const userData = await fetchUserData(replyData.userId);
          return {
            ...replyData,
            userAvatar: userData?.photoURL || defaultAvatar,
            userName: userData?.username || 'Unknown User'
          };
        }));
        return { ...comment, replies };
      }));

      setComments(commentsWithReplies);
    }, (err) => setError(`Error fetching comments: ${err.message}`));

    return () => {
      unsubscribe();
    };
  }, [post?.id]);

  useEffect(() => {
    if (post?.imageUrls?.length > 1) {
      const interval = setInterval(() => {
        setCurrentFrame((prevFrame) => (prevFrame + 1) % post.imageUrls.length);
      }, post.loopSpeed || 500);

      return () => clearInterval(interval);
    }
  }, [post?.imageUrls, post?.loopSpeed]);

  const handleAddComment = useCallback(async (e) => {
    e.preventDefault();
    const trimmedComment = newComment.trim();
    if (!trimmedComment || !currentUser?.uid) return;

    try {
      const addedComment = await onComment(post.id, trimmedComment);
      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      setError(`Error adding comment: ${error.message}`);
    }
  }, [newComment, post?.id, currentUser, onComment]);

  const handleReply = useCallback(async (commentId, replyText) => {
    if (!replyText.trim() || !currentUser?.uid) return;

    try {
      const replyRef = collection(db, 'comments', commentId, 'replies');
      const newReply = {
        userId: currentUser.uid,
        userName: currentUser.displayName,
        userAvatar: currentUser.photoURL,
        content: replyText.trim(),
        createdAt: serverTimestamp(),
        likes: [],
      };
      await addDoc(replyRef, newReply);

      setReplyingTo(null);
    } catch (error) {
      setError(`Error adding reply: ${error.message}`);
    }
  }, [currentUser]);

  const handleLike = useCallback(async (commentId, isReply = false, parentCommentId = null) => {
    if (!currentUser?.uid) return;

    try {
      const commentRef = isReply
        ? doc(db, 'comments', parentCommentId, 'replies', commentId)
        : doc(db, 'comments', commentId);

      const commentDoc = await getDoc(commentRef);
      const currentLikes = commentDoc.data().likes || [];

      if (currentLikes.includes(currentUser.uid)) {
        await updateDoc(commentRef, { likes: arrayRemove(currentUser.uid) });
      } else {
        await updateDoc(commentRef, { likes: arrayUnion(currentUser.uid) });
      }

      // Update local state
      setComments(prevComments =>
        prevComments.map(comment =>
          isReply && comment.id === parentCommentId
            ? {
              ...comment,
              replies: comment.replies.map(reply =>
                reply.id === commentId
                  ? { ...reply, likes: currentLikes.includes(currentUser.uid) ? currentLikes.filter(id => id !== currentUser.uid) : [...currentLikes, currentUser.uid] }
                  : reply
              )
            }
            : comment.id === commentId
              ? { ...comment, likes: currentLikes.includes(currentUser.uid) ? currentLikes.filter(id => id !== currentUser.uid) : [...currentLikes, currentUser.uid] }
              : comment
        )
      );
    } catch (error) {
      setError(`Error updating like: ${error.message}`);
    }
  }, [currentUser]);

  const handleLikeClick = async () => {
    if (!post?.likes || !Array.isArray(post.likes)) {
      console.error("Post.likes is not an array", post.likes);
      return;
    }

    try {
      await onLike(post.id); // updates Firestore
      const updatedLikes = isLiked
        ? likes.filter(uid => uid !== currentUser.uid)
        : [...likes, currentUser.uid];

      setIsLiked(!isLiked);
      setLikes(updatedLikes);
    } catch (err) {
      console.error("Error updating like:", err);
    }
  };

  const handleDoubleClick = useCallback(async () => {
    if (!post.likes.includes(currentUser?.uid)) {
      await onLike(post.id);
    }
  }, [onLike, post.id, currentUser, post.likes]);

  const renderMedia = useMemo(() => {
    if (!post?.imageUrls && !post?.imageUrl) return null;

    if (post.imageUrls?.length > 1) {
      return post.imageUrls.map((url, index) => (
        <img
          key={url}
          src={url}
          alt={`Loop frame ${index + 1}`}
          style={{
            display: index === currentFrame ? 'block' : 'none',
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
          loading="lazy"
        />
      ));
    } else {
      return (
        <img
          src={post.imageUrls?.[0] || post.imageUrl}
          alt="Post content"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      );
    }
  }, [post?.imageUrls, post?.imageUrl, currentFrame]);

  const toggleExpandReplies = useCallback((commentId) => {
    setExpandedComments(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  }, []);

  const renderReplies = useCallback((comment) => {
    const replies = comment.replies || [];
    const showMoreButton = replies.length > 3;
    const displayedReplies = expandedComments[comment.id] ? replies : replies.slice(0, 3);

    return (
      <>
        <div className="replies">
          {displayedReplies.map(reply => (
            <div key={reply.id} className="reply">
              <img src={reply.userAvatar || defaultAvatar} alt={reply.userName} className="comment-avatar" />
              <div className="comment-content">
                <span className="comment-username">{reply.userName}</span>
                <span className="comment-text">{reply.content}</span>
                <div className="comment-actions">
                  <span className="comment-action" onClick={() => handleLike(reply.id, true, comment.id)}>
                    {reply.likes?.includes(currentUser?.uid) ? '❤️' : '🤍'} {reply.likes?.length || 0}
                  </span>
                  <span className="comment-action" onClick={() => setReplyingTo(reply.id)}>Reply</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {showMoreButton && (
          <div className="show-more-replies" onClick={() => toggleExpandReplies(comment.id)}>
            {expandedComments[comment.id] ? 'Show less' : `View ${replies.length - 3} more replies`}
          </div>
        )}
      </>
    );
  }, [expandedComments, currentUser, handleLike, toggleExpandReplies]);

  const memoizedComments = useMemo(() => {
    return comments.map(comment => (
      <div key={comment.id} className="comment">
        <img src={comment.userAvatar || defaultAvatar} alt={comment.userName} className="comment-avatar" />
        <div className="comment-content">
          <Link to={`/profile/${comment.userId}`} onClick={() => handleUserClick(comment.userId)}>
            <span className="comment-username">{sanitizeInput(comment.userName)}</span>
          </Link>
          <span className="comment-text">{sanitizeInput(comment.content)}</span>
          <div className="comment-actions">
            <span className="comment-action" onClick={() => handleLike(comment.id)}>
              {comment.likes?.includes(currentUser?.uid) ? '❤️' : '🤍'} {comment.likes?.length || 0}
            </span>
            <span className="comment-action" onClick={() => setReplyingTo(comment.id)}>Reply</span>
          </div>
          {renderReplies(comment)}
          {replyingTo === comment.id && (
            <form onSubmit={(e) => {
              e.preventDefault();
              handleReply(comment.id, e.target.reply.value);
              e.target.reply.value = '';
            }}>
              <input type="text" name="reply" placeholder="Write a reply..." className="comment-input" />
              <button type="submit" className="post-button">Post</button>
            </form>
          )}
        </div>
      </div>
    ));
  }, [comments, replyingTo, handleReply, sanitizeInput, handleLike, currentUser, renderReplies, handleUserClick]);


  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content error">
          <p>{error}</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-post" onDoubleClick={handleDoubleClick}>
          <div className="modal-media">
            {renderMedia}
          </div>
          <div className="modal-post-details">
            <p className="modal-caption">{sanitizeInput(post?.caption) || 'No caption'}</p>
            <p className="modal-meta">
              <span>Filter: {post?.filter || 'None'}</span>
              <span>Speed: {post?.loopSpeed ? `${post.loopSpeed}ms` : 'N/A'}</span>
            </p>
            <p className="modal-date">
              {post?.createdAt?.toDate().toLocaleString() || 'Date unknown'}
            </p>
            <div className="post-actions">
              <button onClick={handleLikeClick} className="like-button">
                {post.likes.includes(currentUser?.uid) ? '❤️' : '🤍'}
              </button>
              <span>{post.likes.length} likes</span>
            </div>
          </div>
        </div>
        <div className="modal-comments">
          <h3>Comments</h3>
          <ul>
            {memoizedComments}
          </ul>
          <form onSubmit={handleAddComment} className="comment-form">
            <input
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              maxLength={500}
            />
            <button type="submit" disabled={!newComment.trim() || !currentUser}>Post</button>
          </form>
        </div>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>
    </div>
  );
});

export default Modal;
