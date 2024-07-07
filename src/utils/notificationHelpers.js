import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

export const createNotification = async (recipientId, senderId, type, contentId = null) => {
    try {
        const notificationRef = collection(db, 'notifications');
        await addDoc(notificationRef, {
            recipientId,
            senderId,
            type,
            contentId,
            createdAt: serverTimestamp(),
            read: false,
        });

        // Update user's unreadNotifications count
        const userRef = collection(db, 'users');
        const q = query(userRef, where('uid', '==', recipientId));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            await updateDoc(userDoc.ref, {
                unreadNotifications: arrayUnion(1)
            });
        }
    } catch (error) {
        console.error('Error creating notification:', error);
    }
};