import React, { useState } from 'react';

function EditProfileModal({ user, onClose, onSave }) {
    const [editedProfile, setEditedProfile] = useState({
        bioTitle: user.bioTitle || '',
        bio: user.bio || '',
        website: user.website || '',
        location: user.location || '',
    });

    function sanitizeInput(input) {
        return input.replace(/<[^>]*>/g, ''); // strip tags only
    }

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditedProfile(prev => ({ ...prev, [name]: value })); // no sanitize here
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Sanitize input at submit time
        const cleanedProfile = {
            bioTitle: sanitizeInput(editedProfile.bioTitle).trim(),
            bio: sanitizeInput(editedProfile.bio).trim(),
            website: sanitizeInput(editedProfile.website).trim(),
            location: sanitizeInput(editedProfile.location).trim(),
        };

        // Client-side validation
        if (cleanedProfile.bioTitle.length > 50) {
            alert('Bio title must be less than 50 characters');
            return;
        }
        if (cleanedProfile.bio.length > 150) {
            alert('Bio must be less than 150 characters');
            return;
        }
        if (cleanedProfile.website && !isValidUrl(cleanedProfile.website)) {
            alert('Please enter a valid website URL');
            return;
        }
        if (cleanedProfile.location.length > 50) {
            alert('Location must be less than 50 characters');
            return;
        }

        onSave(cleanedProfile);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="edit-profile-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Edit Profile</h3>
                <form className="edit-profile-form" onSubmit={handleSubmit}>
                    <input
                        name="bioTitle"
                        value={editedProfile.bioTitle}
                        onChange={handleInputChange}
                        placeholder="Bio Title"
                    />
                    <textarea
                        name="bio"
                        value={editedProfile.bio}
                        onChange={handleInputChange}
                        placeholder="Bio"
                    />
                    <input
                        name="website"
                        value={editedProfile.website}
                        onChange={handleInputChange}
                        placeholder="Website"
                    />
                    <input
                        name="location"
                        value={editedProfile.location}
                        onChange={handleInputChange}
                        placeholder="Location"
                    />
                    <button type="submit">Save Changes</button>
                </form>
            </div>
        </div>
    );
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

export default EditProfileModal;