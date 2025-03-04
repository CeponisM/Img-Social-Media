# React VSCO-Style Image Social Media App

A modern image-based social media app built with React and Firebase.

## Overview

This app allows users to:

- Create profiles and follow other users
- Capture multiple images from a camera
- Apply filters and aesthetic settings to image sequences
- Loop and preview posts before uploading
- Share posts with captions and interact via likes, comments, and replies
- Browse a feed of posts from followed users
- Receive notifications for post and comment interactions

## Features

### User Authentication
- Firebase Authentication for sign-in/sign-up
- Profile completion flow

### Posts
- Sequence of images stitched into a loop
- Filter effects (brightness, contrast, saturation, hue, blur, etc.)
- Interval customization for loop playback speed
- Auto and manual capture modes using OpenCV.js (via Web Worker)
- Upload with caption, store in Firebase Storage and Firestore

### Social Interactions
- Like posts and comments
- Reply to comments
- Follow/unfollow users
- Real-time notifications

### Feed & Profile
- Home feed showing latest posts from followed users
- User profiles with paginated posts
- Privacy settings and profile editing

### UI and UX
- Responsive design with dark mode support
- Smooth transitions using Framer Motion

## Tech Stack

- **Frontend**: React 18, React Router, Framer Motion
- **Backend**: Firebase Authentication, Firestore, Firebase Storage
- **Image Processing**: OpenCV.js (via `worker.js`)
- **Performance**: React.memo, lazy loading, virtualization

## Scripts

- `npm start` – start development server
- `npm run build` – build production app
- `npm test` – run tests

## Notes

- OpenCV features are loaded dynamically in a Web Worker (`worker.js`)
- Post modal support included for deep linking from notifications
- Project uses Firestore queries for pagination and filtering

---
