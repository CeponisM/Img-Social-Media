import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, updateDoc, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Link, useNavigate } from 'react-router-dom';
import { combineNotifications } from '../utils/notificationHelpers';
import './Notifications.css';

const Notifications = ({ currentUser, openPostModal, openProfile }) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!currentUser) return;

        const notificationsRef = collection(db, 'notifications');
        const q = query(
            notificationsRef,
            where('recipientId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            let notificationsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Combine similar notifications
            notificationsData = combineNotifications(notificationsData);

            setNotifications(notificationsData);
            setLoading(false);

            // Mark notifications as read
            const batch = writeBatch(db);
            querySnapshot.docs.forEach((doc) => {
                if (!doc.data().read) {
                    batch.update(doc.ref, { read: true });
                }
            });
            await batch.commit();

            // Reset user's unreadNotifications count
            await updateDoc(doc(db, 'users', currentUser.uid), { unreadNotifications: 0 });
        }, (error) => {
            console.error("Error fetching notifications: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleNotificationClick = (notification) => {
        if (notification.type === 'follow') {
            openProfile(notification.senderId);
        } else if (['like', 'comment', 'reply', 'commentLike', 'replyLike'].includes(notification.type)) {
            openPostModal(notification.contentId, notification.recipientId);
        }
    };

    const renderNotificationContent = (notification) => {
        return (
            <div className="notification-content">
                <img
                    src={notification.userAvatar || '/default-avatar.png'}
                    alt={notification.senderUsername}
                    className="sender-avatar"
                    onClick={(e) => {
                        e.stopPropagation();
                        openProfile(notification.senderId);
                    }}
                />
                <div className="notification-text">
                    <span>
                        <strong>{notification.senderUsername}</strong>{' '}
                        {notification.type === 'follow' && 'started following you'}
                        {notification.type === 'like' && 'liked your post'}
                        {notification.type === 'comment' && 'commented on your post'}
                        {notification.type === 'reply' && 'replied to your comment'}
                        {notification.type === 'commentLike' && 'liked your comment'}
                        {notification.type === 'replyLike' && 'liked your reply'}
                        {notification.otherUsers && ` and ${notification.otherUsers} others`}
                    </span>
                    <span className="notification-time">
                        {new Date(notification.createdAt.toDate()).toLocaleString()}
                    </span>
                </div>
                {['like', 'comment', 'reply', 'commentLike', 'replyLike'].includes(notification.type) && notification.postImage && (
                    <img
                        src={notification.postImage}
                        alt="Post"
                        className="post-thumbnail"
                        onClick={() => handleNotificationClick(notification)}
                    />
                )}
            </div>
        );
    };

    if (loading) {
        return <div className="notifications-loading">Loading notifications...</div>;
    }

    return (
        <div className="notifications-container">
            <h2 className="notifications-header">Notifications</h2>
            {notifications.length === 0 ? (
                <p className="no-notifications">No notifications yet.</p>
            ) : (
                <ul className="notifications-list">
                    {notifications.map((notification) => (
                        <li 
                            key={notification.id} 
                            className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                            onClick={() => handleNotificationClick(notification)}
                        >
                            {renderNotificationContent(notification)}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default Notifications;
