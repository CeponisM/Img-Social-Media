import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { initializeImageProcessing, terminateImageProcessing, processImages } from './ImageProcessing';

import './ImageCapture.css';

function ImageCapture() {
  const videoRef = useRef(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [error, setError] = useState(null);
  const [imageCount, setImageCount] = useState(3);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAutoCapture, setIsAutoCapture] = useState(false);
  const [captureDelay, setCaptureDelay] = useState(2000);
  const [isCapturing, setIsCapturing] = useState(false);
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isOpenCVLoading, setIsOpenCVLoading] = useState(true);
  const [processingChoices, setProcessingChoices] = useState({
    align: true,
    enhance: true,
    colorGrade: true,
    sharpen: true,
    denoise: true,
    vignette: true
  });

  useEffect(() => {
    console.log("Initializing image processing");
    initializeImageProcessing(handleWorkerMessage);
    return () => {
      console.log("Terminating image processing");
      terminateImageProcessing();
    };
  }, []);

  const handleWorkerMessage = useCallback((message) => {
    console.log('Received worker message:', message);
    switch (message.action) {
      case 'progress':
        setProcessingProgress(message.progress);
        break;
      case 'error':
        setError(message.error);
        break;
    }
  }, []);

  useEffect(() => {
    if (capturedImages.length === imageCount) {
      console.log(`Starting to process ${capturedImages.length} images`);
      console.log('First captured image data URL length:', capturedImages[0].length);
      setIsProcessing(true);
      setProcessingProgress(0);
      processImages(capturedImages, processingChoices)
        .then(processed => {
          console.log('Images processed successfully', processed.length);
          navigate('/edit', { state: { images: processed } });
        })
        .catch(error => {
          console.error('Error processing images:', error);
          setError(`Error processing images: ${error.message}. Please try again.`);
          setIsProcessing(false);
          setCapturedImages([]);
        });
    }
  }, [capturedImages, imageCount, navigate, processingChoices]);

  const resetProcessing = () => {
    setIsProcessing(false);
    setProcessingProgress(0);
    setCapturedImages([]);
    setError(null);
  };

  const startCamera = useCallback(async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      setError(null);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Unable to access the camera. Please ensure you have granted the necessary permissions and that your device has a camera.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
    setIsCapturing(false);
  }, []);

  const captureImage = useCallback(() => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    const imageDataUrl = canvas.toDataURL('image/jpeg');
    setCapturedImages(prevImages => {
      const newImages = [...prevImages, imageDataUrl];
      if (newImages.length >= imageCount) {
        stopCamera();
      }
      return newImages;
    });
  }, [imageCount, stopCamera]);

  useEffect(() => {
    let interval;
    if (isCameraActive && isAutoCapture && isCapturing && capturedImages.length < imageCount) {
      interval = setInterval(() => {
        captureImage();
      }, captureDelay);
    }
    return () => clearInterval(interval);
  }, [isCameraActive, isAutoCapture, isCapturing, capturedImages.length, imageCount, captureDelay, captureImage]);

  const resetCapture = useCallback(() => {
    setCapturedImages([]);
    stopCamera();
  }, [stopCamera]);

  const handleImageCountChange = useCallback((e) => {
    const count = parseInt(e.target.value, 10);
    setImageCount(count);
    setCapturedImages([]);
  }, []);

  const handleAutoCaptureChange = (e) => {
    setIsAutoCapture(e.target.checked);
    setIsCapturing(false);
  };

  const handleCaptureDelayChange = (e) => {
    setCaptureDelay(parseInt(e.target.value, 10));
  };

  const startCapturing = () => {
    setIsCapturing(true);
  };

  return (
    <div className="image-capture">
      <h2>Capture Images</h2>
      {error && <p className="error">{error}</p>}
      <div className="controls">
        <div className="control-group">
          <label htmlFor="imageCount">Number of images: </label>
          <input
            type="number"
            id="imageCount"
            value={imageCount}
            onChange={handleImageCountChange}
            min="1"
            max="10"
          />
        </div>
        <div className="control-group">
          <label htmlFor="autoCapture">Auto Capture: </label>
          <input
            type="checkbox"
            id="autoCapture"
            checked={isAutoCapture}
            onChange={handleAutoCaptureChange}
          />
        </div>
        {isAutoCapture && (
          <div className="control-group">
            <label htmlFor="captureDelay">Capture Delay (ms): </label>
            <input
              type="range"
              id="captureDelay"
              min="500"
              max="5000"
              step="100"
              value={captureDelay}
              onChange={handleCaptureDelayChange}
            />
            <span>{captureDelay}ms</span>
          </div>
        )}
      </div>
      <div className="camera-container">
        <video ref={videoRef} playsInline />
        {isCapturing && <div className="capturing-indicator"></div>}
      </div>
      <div className="button-container">
        {!isCameraActive && <button onClick={startCamera}>Start Camera</button>}
        {isCameraActive && (
          <>
            {!isAutoCapture && (
              <button onClick={captureImage} disabled={capturedImages.length >= imageCount}>
                Capture Image ({capturedImages.length}/{imageCount})
              </button>
            )}
            {isAutoCapture && !isCapturing && (
              <button onClick={startCapturing}>Start Auto Capture</button>
            )}
            {isAutoCapture && isCapturing && (
              <button onClick={() => setIsCapturing(false)}>Stop Auto Capture</button>
            )}
            <button onClick={stopCamera}>Stop Camera</button>
          </>
        )}
        {capturedImages.length > 0 && <button onClick={resetCapture}>Reset</button>}
      </div>
      <div className="processing-choices">
        <h3>Processing Options:</h3>
        {Object.keys(processingChoices).map(choice => (
          <label key={choice}>
            <input
              type="checkbox"
              checked={processingChoices[choice]}
              onChange={e => setProcessingChoices(prev => ({ ...prev, [choice]: e.target.checked }))}
            />
            {choice.charAt(0).toUpperCase() + choice.slice(1)}
          </label>
        ))}
      </div>
      {isProcessing && (
        <div className="processing-overlay">
          {isOpenCVLoading ? (
            <p>Loading OpenCV... This may take a few moments.</p>
          ) : (
            <>
              <p>Processing images... {processingProgress.toFixed(2)}%</p>
              <button onClick={resetProcessing}>Cancel and Reset</button>
            </>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <pre>{JSON.stringify({ capturedImages: capturedImages.length, isProcessing, processingProgress }, null, 2)}</pre>
      <div className="captured-images">
        {capturedImages.map((img, index) => (
          <img key={index} src={img} alt={`Captured ${index + 1}`} />
        ))}
      </div>
    </div>
  );
}

export default ImageCapture;
