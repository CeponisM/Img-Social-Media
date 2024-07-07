import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import './Notifications.css';

const Notifications = ({ currentUser }) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNotifications = async () => {
            if (!currentUser) return;

            try {
                const q = query(
                    collection(db, 'notifications'),
                    where('recipientId', '==', currentUser.uid),
                    orderBy('createdAt', 'desc'),
                    limit(20)
                );
                const querySnapshot = await getDocs(q);
                const notificationsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setNotifications(notificationsData);
                setLoading(false);

                // Mark notifications as read
                const batch = db.batch();
                querySnapshot.docs.forEach((doc) => {
                    if (!doc.data().read) {
                        batch.update(doc.ref, { read: true });
                    }
                });
                await batch.commit();

                // Reset user's unreadNotifications count
                const userRef = collection(db, 'users');
                const userQuery = query(userRef, where('uid', '==', currentUser.uid));
                const userSnapshot = await getDocs(userQuery);
                if (!userSnapshot.empty) {
                    const userDoc = userSnapshot.docs[0];
                    await updateDoc(userDoc.ref, { unreadNotifications: 0 });
                }
            } catch (error) {
                console.error('Error fetching notifications:', error);
                setLoading(false);
            }
        };

        fetchNotifications();
    }, [currentUser]);

    const renderNotificationContent = (notification) => {
        switch (notification.type) {
            case 'follow':
                return (
                    <Link to={`/profile/${notification.senderId}`}>
                        <strong>{notification.senderUsername}</strong> started following you
                    </Link>
                );
            case 'like':
                return (
                    <Link to={`/post/${notification.contentId}`}>
                        <strong>{notification.senderUsername}</strong> liked your post
                    </Link>
                );
            case 'comment':
                return (
                    <Link to={`/post/${notification.contentId}`}>
                        <strong>{notification.senderUsername}</strong> commented on your post
                    </Link>
                );
            default:
                return null;
        }
    };

    if (loading) {
        return <div className="notifications-loading">Loading notifications...</div>;
    }

    return (
        <div className="notifications-container">
            <h2>Notifications</h2>
            {notifications.length === 0 ? (
                <p>No notifications yet.</p>
            ) : (
                <ul className="notifications-list">
                    {notifications.map((notification) => (
                        <li key={notification.id} className={`notification-item ${notification.read ? 'read' : 'unread'}`}>
                            {renderNotificationContent(notification)}
                            <span className="notification-time">
                                {new Date(notification.createdAt.toDate()).toLocaleString()}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default Notifications;
