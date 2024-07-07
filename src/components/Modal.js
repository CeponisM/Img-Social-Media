import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, limit, getDocs, updateDoc, arrayUnion, arrayRemove, doc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import './Modal.css';

const Modal = React.memo(({ post, onClose, user, currentUser, onLike, onComment, handleUserClick }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [error, setError] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [slectedPost, setSelectedPost] = useState(null);
  const navigate = useNavigate();

  const sanitizeInput = useCallback((input) => {
    return DOMPurify.sanitize(input);
  }, []);

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
      const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const commentsWithReplies = await Promise.all(fetchedComments.map(async (comment) => {
        const repliesQuery = query(
          collection(db, 'comments', comment.id, 'replies'),
          orderBy('createdAt', 'asc')
        );
        const unsubscribeReplies = onSnapshot(repliesQuery, (repliesSnapshot) => {
          const replies = repliesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setComments(prevComments =>
            prevComments.map(prevComment =>
              prevComment.id === comment.id ? { ...prevComment, replies } : prevComment
            )
          );
        });
        comment.unsubscribeReplies = unsubscribeReplies;

        const initialRepliesSnapshot = await getDocs(repliesQuery);
        const replies = initialRepliesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { ...comment, replies };
      }));

      setComments(commentsWithReplies);
    }, (err) => setError(`Error fetching comments: ${err.message}`));

    return () => {
      unsubscribe();
      comments.forEach(comment => comment.unsubscribeReplies && comment.unsubscribeReplies());
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
        content: replyText.trim(),
        createdAt: serverTimestamp(),
      };
      await addDoc(replyRef, newReply);

      setReplyingTo(null);
    } catch (error) {
      setError(`Error adding reply: ${error.message}`);
    }
  }, [currentUser]);

  const handleLike = useCallback(async () => {
    await onLike(post.id);
  }, [onLike, post.id]);

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

  const memoizedComments = useMemo(() => {
    return comments.map(comment => (
      <li key={comment.id} className="comment">
        <Link to={`/profile/${comment.userId}`} onClick={() => onClose()}><strong>{sanitizeInput(comment.userName)}</strong></Link>: {sanitizeInput(comment.content)}
        <button onClick={() => setReplyingTo(comment.id)}>Reply</button>
        {comment.replies && comment.replies.map(reply => (
          <div key={reply.id} className="reply">
            <Link to={`/profile/${reply.userId}`} onClick={() => onClose()}><strong>{sanitizeInput(reply.userName)}</strong></Link>: {sanitizeInput(reply.content)}
          </div>
        ))}
        {replyingTo === comment.id && (
          <form onSubmit={(e) => {
            e.preventDefault();
            handleReply(comment.id, e.target.reply.value);
            e.target.reply.value = '';
          }}>
            <input type="text" name="reply" placeholder="Write a reply..." />
            <button type="submit">Post Reply</button>
          </form>
        )}
      </li>
    ));
  }, [comments, replyingTo, handleReply, sanitizeInput]);

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
            <button onClick={handleLike} className="like-button">
              {post.likes.includes(currentUser?.uid) ? 'Unlike' : 'Like'}
            </button>
            <span>{post.likes.length} likes</span>
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
