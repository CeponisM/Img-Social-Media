let worker = null;

export function initializeImageProcessing(messageHandler) {
    console.log('Initializing image processing');
    if (!worker) {
        console.log('Creating new worker');
        worker = new Worker(new URL('./worker.js', import.meta.url));
        console.log('Worker created');

        worker.onmessage = function (e) {
            console.log('Received message from worker:', e.data);
            if (e.data.action === 'error') {
                console.error('Worker error:', e.data.error);
                console.error('Error stack:', e.data.stack);
                messageHandler({ action: 'error', error: e.data.error, stack: e.data.stack });
            } else {
                messageHandler(e.data);
            }
        };

        worker.onerror = function (error) {
            console.error('Worker error:', error);
            messageHandler({ action: 'error', error: error.message });
        };
    }
}

export function terminateImageProcessing() {
    console.log('Terminating image processing');
    if (worker) {
        worker.terminate();
        worker = null;
    }
}

export function processImages(images, processingChoices) {
    console.log('processImages called with', images.length, 'images and choices:', processingChoices);
    return new Promise((resolve, reject) => {
        if (!worker) {
            console.error('Worker not initialized');
            reject(new Error('Worker not initialized'));
            return;
        }

        const timeout = setTimeout(() => {
            console.error('Worker did not respond within 60 seconds');
            reject(new Error('Processing timed out'));
        }, 60000);

        function messageHandler(e) {
            console.log('Received message from worker:', e.data);
            switch (e.data.action) {
                case 'processImagesComplete':
                    clearTimeout(timeout);
                    console.log('Processing complete, converting to data URLs');
                    Promise.all(e.data.processedImages.map(imageDataToDataURL))
                        .then(dataURLs => {
                            console.log('Conversion complete, resolving promise');
                            resolve(dataURLs);
                        })
                        .catch(error => {
                            console.error('Error converting to data URLs:', error);
                            reject(new Error(`Error converting to data URLs: ${error.message}`));
                        });
                    break;
                case 'progress':
                    console.log('Processing progress:', e.data.progress);
                    break;
                case 'error':
                    clearTimeout(timeout);
                    console.error('Worker error:', e.data.error);
                    reject(new Error(e.data.error));
                    break;
            }
        }

        worker.onmessage = messageHandler;

        // Convert data URLs to ImageData
        const convertToImageData = (dataUrl) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(ctx.getImageData(0, 0, img.width, img.height));
                };
                img.src = dataUrl;
            });
        };

        // Convert ImageData to data URL
        const imageDataToDataURL = (imageData) => {
            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/jpeg');
        };

        Promise.all(images.map(convertToImageData))
            .then(imageDataArray => {
                console.log('Sending images to worker for processing');
                worker.postMessage({ action: 'processImages', images: imageDataArray, processingChoices });
            })
            .catch(error => {
                reject(new Error(`Error converting images: ${error.message}`));
            });
    });
}
