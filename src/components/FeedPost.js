import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import './FeedPost.css';

const FeedPost = React.memo(({ post, user }) => {
    const [isLiked, setIsLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(0);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [showComments, setShowComments] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const intervalRef = useRef(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setIsLiked(post.likes && post.likes.includes(user.uid));
        setLikesCount(post.likes ? post.likes.length : 0);
    }, [post, user]);

    useEffect(() => {
        if (post.imageUrls && post.imageUrls.length > 1) {
            intervalRef.current = setInterval(() => {
                setCurrentFrame((prevFrame) => (prevFrame + 1) % post.imageUrls.length);
            }, post.loopSpeed || 500);
        }
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [post.imageUrls, post.loopSpeed]);

    const handleLike = useCallback(async () => {
        try {
            setIsLoading(true);
            const postRef = doc(db, 'posts', post.id);
            if (isLiked) {
                await updateDoc(postRef, {
                    likes: arrayRemove(user.uid)
                });
                setIsLiked(false);
                setLikesCount(prevCount => prevCount - 1);
            } else {
                await updateDoc(postRef, {
                    likes: arrayUnion(user.uid)
                });
                setIsLiked(true);
                setLikesCount(prevCount => prevCount + 1);
            }
        } catch (error) {
            console.error('Error updating like:', error);
            setError('Failed to update like. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [isLiked, post.id, user.uid]);

    const handleCommentSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!newComment.trim() || newComment.length > 500) return; // Add length check

        try {
            setIsLoading(true);
            const commentRef = await addDoc(collection(db, 'comments'), {
                postId: post.id,
                userId: user.uid,
                userName: user.displayName || user.email,
                content: newComment.trim(),
                createdAt: serverTimestamp(), // Use server timestamp
                likes: []
            });

            setComments(prevComments => [...prevComments, {
                id: commentRef.id,
                userId: user.uid,
                userName: user.displayName || user.email,
                content: newComment,
                createdAt: new Date(),
                likes: []
            }]);
            setNewComment('');
        } catch (error) {
            console.error('Error adding comment:', error);
            setError('Failed to add comment. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [newComment, post.id, user.uid, user.displayName, user.email]);

    const fetchComments = useCallback(async () => {
        const q = query(
            collection(db, 'comments'),
            where('postId', '==', post.id),
            orderBy('likes', 'desc'),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const fetchedComments = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setComments(fetchedComments);
    }, [post.id]);

    const toggleComments = useCallback(() => {
        if (!showComments) {
            fetchComments();
        }
        setShowComments(!showComments);
    }, [comments, user.uid]);

    const handleCommentLike = useCallback(async (commentId) => {
        const commentRef = doc(db, 'comments', commentId);
        const comment = comments.find(c => c.id === commentId);
        if (comment.likes.includes(user.uid)) {
            await updateDoc(commentRef, {
                likes: arrayRemove(user.uid)
            });
            setComments(prevComments => prevComments.map(c =>
                c.id === commentId ? { ...c, likes: c.likes.filter(id => id !== user.uid) } : c
            ));
        } else {
            await updateDoc(commentRef, {
                likes: arrayUnion(user.uid)
            });
            setComments(prevComments => prevComments.map(c =>
                c.id === commentId ? { ...c, likes: [...c.likes, user.uid] } : c
            ));
        }
    }, [comments, user.uid]);

    const memoizedComments = useMemo(() => (
        <ul className="comments-list">
            {comments.map(comment => (
                <li key={comment.id} className="comment">
                    <span className="comment-username">{comment.userName}</span>
                    <span className="comment-content">{comment.content}</span>
                    <button onClick={() => handleCommentLike(comment.id)} className="comment-like-btn">
                        {comment.likes.includes(user.uid) ? '❤️' : '🤍'} {comment.likes.length}
                    </button>
                </li>
            ))}
        </ul>
    ), [comments, handleCommentLike, user.uid]);

    return (
        <div className="feed-post">
            <div className="post-header">
                <img src={post.userAvatar || 'default-avatar.png'} alt="User avatar" className="user-avatar" />
                <span className="user-name">{post.userName}</span>
            </div>
            {error && <div className="error-message">{error}</div>}
            {isLoading && <div className="loading-indicator">Loading...</div>}
            <div className="post-content">
                {post.imageUrls && post.imageUrls.length > 1 ? (
                    post.imageUrls.map((url, index) => (
                        <img
                            key={index}
                            src={url}
                            alt={`Loop frame ${index + 1}`}
                            style={{ display: index === currentFrame ? 'block' : 'none' }}
                        />
                    ))
                ) : (
                    <img src={post.imageUrls?.[0] || post.imageUrl} alt="Post content" />
                )}
            </div>
            <div className="post-actions">
                <button onClick={handleLike} className={`like-btn ${isLiked ? 'liked' : ''}`}>
                    {isLiked ? '❤️' : '🤍'} {likesCount}
                </button>
                <button onClick={toggleComments} className="comment-btn">
                    💬 {comments.length}
                </button>
            </div>
            <p className="post-caption">{post.caption}</p>
            {showComments && (
                <div className="comments-section">
                    {memoizedComments}
                    <form onSubmit={handleCommentSubmit} className="comment-form">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                        />
                        <button type="submit">Post</button>
                    </form>
                </div>
            )}
        </div>
    );
});

export default FeedPost;