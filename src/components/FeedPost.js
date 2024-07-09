import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp, increment } from 'firebase/firestore';
import { createNotification } from '../utils/notificationHelpers';
import './FeedPost.css';

const FeedPost = React.memo(({ post, user, openProfile }) => {
    const [isLiked, setIsLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(0);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [showComments, setShowComments] = useState(false);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const intervalRef = useRef(null);
    const navigate = useNavigate();

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

    useEffect(() => {
        setIsLiked(post.likes && post.likes.includes(user.uid));
        setLikesCount(post.likes ? post.likes.length : 0);
    }, [post, user]);

    const handleLike = useCallback(async () => {
        if (!user) return;
        try {
            setIsLoading(true);
            const postRef = doc(db, 'posts', post.id);
            if (isLiked) {
                await updateDoc(postRef, {
                    likes: arrayRemove(user.uid)
                });
                setIsLiked(false);
                setLikesCount(prev => prev - 1);
            } else {
                await updateDoc(postRef, {
                    likes: arrayUnion(user.uid)
                });
                setIsLiked(true);
                setLikesCount(prev => prev + 1);
                if (post.userId !== user.uid) {
                    await createNotification(post.userId, user.uid, 'like', post.id, user.photoURL, user.displayName, post.imageUrls?.[0] || post.imageUrl);
                }
            }
        } catch (error) {
            console.error('Error updating like:', error);
            setError('Failed to update like. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [isLiked, post, user]);

    const handleCommentSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!user || !newComment.trim() || newComment.length > 500) return;

        try {
            setIsLoading(true);
            const commentRef = await addDoc(collection(db, 'comments'), {
                postId: post.id,
                userId: user.uid,
                userName: user.displayName || user.email,
                content: newComment.trim(),
                createdAt: serverTimestamp(),
                likes: []
            });

            await updateDoc(doc(db, 'posts', post.id), {
                commentCount: increment(1)
            });

            if (post.userId !== user.uid) {
                await createNotification(post.userId, user.uid, 'comment', post.id, user.photoURL, user.displayName, post.imageUrls?.[0] || post.imageUrl);
            }

            setNewComment('');
        } catch (error) {
            console.error('Error adding comment:', error);
            setError('Failed to add comment. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [newComment, post, user]);

    useEffect(() => {
        if (!showComments) return;

        const q = query(
            collection(db, 'comments'),
            where('postId', '==', post.id),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const fetchedComments = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
                const commentData = { id: docSnapshot.id, ...docSnapshot.data() };
                // Fetch user data to get the photoURL
                const userDoc = await getDoc(doc(db, 'users', commentData.userId));
                commentData.userPhotoURL = userDoc.data()?.photoURL;

                // Only fetch replies if the comment has an id
                if (commentData.id) {
                    const repliesQuery = query(
                        collection(db, 'comments', commentData.id, 'replies'),
                        orderBy('createdAt', 'asc')
                    );
                    const repliesSnapshot = await getDocs(repliesQuery);
                    commentData.replies = await Promise.all(repliesSnapshot.docs.map(async (replyDoc) => {
                        const replyData = { id: replyDoc.id, ...replyDoc.data() };
                        const replyUserDoc = await getDoc(doc(db, 'users', replyData.userId));
                        replyData.userPhotoURL = replyUserDoc.data()?.photoURL;
                        return replyData;
                    }));
                } else {
                    commentData.replies = [];
                }
                return commentData;
            }));
            setComments(fetchedComments);
        });

        return () => unsubscribe();
    }, [showComments, post.id]);

    const handleReply = useCallback(async (commentId, replyContent) => {
        if (!user || !replyContent.trim()) return;

        try {
            setIsLoading(true);
            const replyRef = await addDoc(collection(db, 'comments', commentId, 'replies'), {
                postId: post.id,
                userId: user.uid,
                userName: user.displayName || user.email,
                content: replyContent.trim(),
                createdAt: serverTimestamp(),
                likes: []
            });

            await updateDoc(doc(db, 'posts', post.id), {
                commentCount: increment(1)
            });

            const commentDoc = await getDoc(doc(db, 'comments', commentId));
            const commentOwnerId = commentDoc.data().userId;

            if (commentOwnerId !== user.uid) {
                await createNotification(commentOwnerId, user.uid, 'reply', post.id, user.photoURL, user.displayName, post.imageUrls?.[0] || post.imageUrl);
            }

            // Fetch the new reply and add it to the state
            const newReplyDoc = await getDoc(replyRef);
            setComments(prevComments =>
                prevComments.map(comment =>
                    comment.id === commentId
                        ? { ...comment, replies: [...(comment.replies || []), { id: newReplyDoc.id, ...newReplyDoc.data() }] }
                        : comment
                )
            );
        } catch (error) {
            console.error('Error adding reply:', error);
            setError('Failed to add reply. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [post, user]);

    const handleCommentLike = useCallback(async (commentId, isReply = false, parentCommentId = null) => {
        if (!user) return;

        try {
            setIsLoading(true);
            const commentRef = isReply
                ? doc(db, 'comments', parentCommentId, 'replies', commentId)
                : doc(db, 'comments', commentId);

            const commentDoc = await getDoc(commentRef);
            const currentLikes = commentDoc.data().likes || [];
            const commentOwnerId = commentDoc.data().userId;

            if (currentLikes.includes(user.uid)) {
                await updateDoc(commentRef, { likes: arrayRemove(user.uid) });
            } else {
                await updateDoc(commentRef, { likes: arrayUnion(user.uid) });
                if (commentOwnerId !== user.uid) {
                    await createNotification(commentOwnerId, user.uid, isReply ? 'replyLike' : 'commentLike', post.id, user.photoURL, user.displayName, post.imageUrls?.[0] || post.imageUrl);
                }
            }

            // Update the state to reflect the change
            setComments(prevComments =>
                prevComments.map(comment =>
                    isReply && comment.id === parentCommentId
                        ? {
                            ...comment,
                            replies: comment.replies.map(reply =>
                                reply.id === commentId
                                    ? { ...reply, likes: currentLikes.includes(user.uid) ? currentLikes.filter(id => id !== user.uid) : [...currentLikes, user.uid] }
                                    : reply
                            )
                        }
                        : comment.id === commentId
                            ? { ...comment, likes: currentLikes.includes(user.uid) ? currentLikes.filter(id => id !== user.uid) : [...currentLikes, user.uid] }
                            : comment
                )
            );
        } catch (error) {
            console.error('Error updating comment like:', error);
            setError('Failed to update like. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [post, user]);

    const memoizedComments = useMemo(() => (
        <ul className="comments-list">
            {comments.map(comment => (
                <li key={comment.id} className="comment">
                    <img src={comment.userPhotoURL || '/default-avatar.png'} alt={comment.userName} className="comment-user-avatar" />
                    <div className="comment-content">
                        <Link to={`/profile/${comment.userId}`} onClick={() => openProfile(comment.userId)}>
                            <span className="comment-username">{comment.userName}</span>
                        </Link>
                        <span className="comment-text">{comment.content}</span>
                        <button onClick={() => handleCommentLike(comment.id)} className="comment-like-btn">
                            {comment.likes && comment.likes.includes(user.uid) ? '❤️' : '🤍'} {comment.likes ? comment.likes.length : 0}
                        </button>
                        {comment.replies && comment.replies.length > 0 && (
                            <ul className="replies-list">
                                {comment.replies.map(reply => (
                                    <li key={reply.id} className="reply">
                                        <img src={reply.userPhotoURL || '/default-avatar.png'} alt={reply.userName} className="reply-user-avatar" />
                                        <div className="reply-content">
                                            <span className="reply-username">{reply.userName}</span>
                                            <span className="reply-text">{reply.content}</span>
                                            <button onClick={() => handleCommentLike(reply.id, true, comment.id)} className="reply-like-btn">
                                                {reply.likes && reply.likes.includes(user.uid) ? '❤️' : '🤍'} {reply.likes ? reply.likes.length : 0}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            handleReply(comment.id, e.target.reply.value);
                            e.target.reply.value = '';
                        }} className="reply-form">
                            <input type="text" name="reply" placeholder="Write a reply..." />
                            <button type="submit">Reply</button>
                        </form>
                    </div>
                </li>
            ))}
        </ul>
    ), [comments, handleCommentLike, handleReply, user, openProfile]);

    return (
        <div className="feed-post">
            <div className="post-header">
                <Link to={`/profile/${post.userId}`} onClick={() => openProfile(post.userId)}>
                    <img src={post.userAvatar || 'default-avatar.png'} alt="User avatar" className="user-avatar" />
                </Link>
                <span className="user-name">{post.userName}</span>
            </div>
            {error && <div className="error-message">{error}</div>}
            {isLoading && <div className="loading-indicator">Loading...</div>}
            {/* Post content */}
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
                <button onClick={handleLike} className={`like-btn ${isLiked ? 'liked' : ''}`}>
                    {isLiked ? '❤️' : '🤍'} {likesCount}
                </button>
                <button onClick={() => setShowComments(!showComments)} className="comment-btn">
                    💬 {post.commentCount || 0}
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