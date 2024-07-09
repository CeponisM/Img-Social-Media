import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const createNotification = async (recipientId, senderId, type, contentId, userAvatar, senderUsername, postImage) => {
    try {
        await addDoc(collection(db, 'notifications'), {
            recipientId,
            senderId,
            type,
            contentId,
            userAvatar,
            senderUsername,
            postImage,
            createdAt: serverTimestamp(),
            read: false
        });
    } catch (error) {
        console.error('Error creating notification:', error);
    }
};

export const combineNotifications = (notifications) => {
    const combinedNotifications = [];
    const notificationMap = new Map();

    notifications.forEach(notification => {
        const key = `${notification.type}-${notification.contentId}`;
        if (notificationMap.has(key)) {
            const existingNotification = notificationMap.get(key);
            existingNotification.otherUsers = (existingNotification.otherUsers || 0) + 1;
        } else {
            notificationMap.set(key, { ...notification, otherUsers: 0 });
        }
    });

    notificationMap.forEach(notification => {
        combinedNotifications.push(notification);
    });

    return combinedNotifications;
};