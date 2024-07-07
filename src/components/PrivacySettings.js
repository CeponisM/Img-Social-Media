import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

function PrivacySettings({ user }) {
    const [settings, setSettings] = useState({
        postsVisibility: 'public',
        allowFollowers: true
    });

    useEffect(() => {
        fetchPrivacySettings();
    }, [user]);

    const fetchPrivacySettings = async () => {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                setSettings(userDoc.data().privacySettings || {
                    postsVisibility: 'public',
                    allowFollowers: true
                });
            }
        } catch (error) {
            console.error('Error fetching privacy settings:', error);
        }
    };

    const handleSettingChange = async (setting, value) => {
        try {
            const newSettings = { ...settings, [setting]: value };
            setSettings(newSettings);
            await updateDoc(doc(db, 'users', user.uid), {
                privacySettings: newSettings
            });
        } catch (error) {
            console.error('Error updating privacy settings:', error);
        }
    };

    return (
        <div className="privacy-settings">
            <h2>Privacy Settings</h2>
            <div>
                <label>
                    Posts Visibility:
                    <select
                        value={settings.postsVisibility}
                        onChange={(e) => handleSettingChange('postsVisibility', e.target.value)}
                    >
                        <option value="public">Public</option>
                        <option value="followers">Followers Only</option>
                        <option value="private">Private</option>
                    </select>
                </label>
            </div>
            <div>
                <label>
                    Allow Followers:
                    <input
                        type="checkbox"
                        checked={settings.allowFollowers}
                        onChange={(e) => handleSettingChange('allowFollowers', e.target.checked)}
                    />
                </label>
            </div>
        </div>
    );
}

export default PrivacySettings;
