import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { storage, db } from '../firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

function ImageEditor({ user }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [images, setImages] = useState([]);
    const [loopSpeed, setLoopSpeed] = useState(500);
    const [filter, setFilter] = useState('none');
    const [isPlaying, setIsPlaying] = useState(true);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isReversed, setIsReversed] = useState(false);
    const [brightness, setBrightness] = useState(100);
    const [contrast, setContrast] = useState(100);
    const [saturation, setSaturation] = useState(100);
    const [blur, setBlur] = useState(0);
    const [hueRotate, setHueRotate] = useState(0);
    const [caption, setCaption] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    const canvasRef = useRef(null);
    const originalImagesRef = useRef([]);

    const applyEffects = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            console.warn('Canvas element is not available');
            return;
        }
        const ctx = canvas.getContext('2d');
        const img = originalImagesRef.current[currentImageIndex];

        if (!img) {
            console.warn('Image is not available');
            return;
        }

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px) hue-rotate(${hueRotate}deg)`;
        ctx.drawImage(img, 0, 0);

        if (filter !== 'none') {
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = filter;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-over';
        }
    }, [currentImageIndex, brightness, contrast, saturation, blur, hueRotate, filter]);

    useEffect(() => {
        setIsMounted(true);
        return () => setIsMounted(false);
    }, []);

    useEffect(() => {
        if (location.state && location.state.images) {
            const loadImages = async () => {
                const loadedImages = await Promise.all(
                    location.state.images.map(src => new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.src = src;
                    }))
                );
                setImages(location.state.images);
                originalImagesRef.current = loadedImages;
                setIsLoading(false);
            };
            loadImages();
        } else {
            navigate('/capture');
        }
    }, [location, navigate]);

    useEffect(() => {
        if (isMounted && !isLoading) {
            applyEffects();
        }
    }, [applyEffects, isMounted, isLoading]);

    const updateImageIndex = useCallback(() => {
        if (isPlaying && images.length > 0) {
            setCurrentImageIndex((prevIndex) => {
                if (isReversed) {
                    if (prevIndex === 0) {
                        setIsReversed(false);
                        return 1;
                    }
                    return prevIndex - 1;
                } else {
                    if (prevIndex === images.length - 1) {
                        setIsReversed(true);
                        return images.length - 2;
                    }
                    return prevIndex + 1;
                }
            });
        }
    }, [isPlaying, isReversed, images.length]);

    useEffect(() => {
        const interval = setInterval(updateImageIndex, loopSpeed);
        return () => clearInterval(interval);
    }, [updateImageIndex, loopSpeed]);

    const handleSpeedChange = (e) => {
        setLoopSpeed(Number(e.target.value));
    };

    const handleFilterChange = (e) => {
        setFilter(e.target.value);
    };

    const togglePlayPause = () => {
        setIsPlaying(!isPlaying);
    };

    const saveLoop = async () => {
        if (!user) {
            alert('You must be logged in to save loops');
            return;
        }

        try {
            setIsLoading(true);

            // Create the full loop sequence
            const fullLoopSequence = [
                ...originalImagesRef.current,
                ...originalImagesRef.current.slice(1, -1).reverse()
            ];

            console.log('Processing images...');
            const processedImages = await Promise.all(fullLoopSequence.map(async (img, index) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;

                ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px) hue-rotate(${hueRotate}deg)`;
                ctx.drawImage(img, 0, 0);

                if (filter !== 'none') {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.fillStyle = filter;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.globalCompositeOperation = 'source-over';
                }

                return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
            }));

            console.log('Uploading images...');
            const uploadTasks = processedImages.map(async (blob, index) => {
                const storageRef = ref(storage, `loops/${user.uid}/${Date.now()}_${index}.jpg`);
                const snapshot = await uploadBytes(storageRef, blob);
                return getDownloadURL(snapshot.ref);
            });

            const imageUrls = await Promise.all(uploadTasks);
            console.log('Images uploaded successfully');

            console.log('Saving to Firestore...');
            const docData = {
                userId: user.uid,
                imageUrls: imageUrls,
                userAvatar: user.photoURL,
                caption: caption,
                filter: filter,
                loopSpeed: loopSpeed,
                brightness: brightness,
                contrast: contrast,
                saturation: saturation,
                blur: blur,
                hueRotate: hueRotate,
                likes: [],
                createdAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, 'posts'), docData);
            console.log('Document written with ID: ', docRef.id);

            alert('Loop saved successfully!');
            navigate('/profile');
        } catch (error) {
            console.error('Error saving loop:', error);
            if (error.code) {
                console.error('Error code:', error.code);
            }
            if (error.message) {
                console.error('Error message:', error.message);
            }
            alert(`Failed to save loop. Error: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const discardAndGoBack = () => {
        navigate('/capture');
    };

    return (
        <div className="image-editor">
            {isLoading ? (
                <div className="loading">
                    <p>Loading...</p>
                </div>
            ) : (
                <>
                    <div className="top-bar">
                        <button className="icon-button" onClick={discardAndGoBack}>
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h2>Edit Loop</h2>
                        <button className="icon-button" onClick={saveLoop}>
                            <i className="fas fa-check"></i>
                        </button>
                    </div>
                    <div className="canvas-container">
                        {isMounted && <canvas ref={canvasRef}></canvas>}
                    </div>
                    <div className="caption-input">
                        <input
                            type="text"
                            placeholder="Add a caption..."
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                        />
                    </div>
                    <div className="controls">
                        <div className="control-row">
                            <button className="icon-button" onClick={togglePlayPause}>
                                <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`}></i>
                            </button>
                            <input
                                type="range"
                                min="100"
                                max="1000"
                                step="100"
                                value={loopSpeed}
                                onChange={handleSpeedChange}
                            />
                        </div>
                        <div className="filter-options">
                            <select value={filter} onChange={handleFilterChange}>
                                <option value="none">Normal</option>
                                <option value="rgba(128, 128, 128, 0.5)">Grayscale</option>
                                <option value="rgba(112, 66, 20, 0.5)">Sepia</option>
                                <option value="rgba(255, 255, 255, 0.8)">Bright</option>
                                <option value="rgba(0, 0, 0, 0.5)">Dark</option>
                            </select>
                        </div>
                        <div className="adjustment-controls">
                            <div className="control-group">
                                <label>Brightness</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={brightness}
                                    onChange={(e) => setBrightness(Number(e.target.value))}
                                />
                            </div>
                            <div className="control-group">
                                <label>Contrast</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={contrast}
                                    onChange={(e) => setContrast(Number(e.target.value))}
                                />
                            </div>
                            <div className="control-group">
                                <label>Saturation</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={saturation}
                                    onChange={(e) => setSaturation(Number(e.target.value))}
                                />
                            </div>
                            <div className="control-group">
                                <label>Blur</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="10"
                                    step="0.1"
                                    value={blur}
                                    onChange={(e) => setBlur(Number(e.target.value))}
                                />
                            </div>
                            <div className="control-group">
                                <label>Hue Rotate</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    value={hueRotate}
                                    onChange={(e) => setHueRotate(Number(e.target.value))}
                                />
                            </div>
                        </div>
                        <button className="post-button" onClick={saveLoop}>
                            Post
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

export default ImageEditor;
