console.log('Worker script started');

let cv = null;

self.importScripts('/opencv.js');

function initOpenCV() {
  return new Promise((resolve, reject) => {
    if (self.cv) {
      cv = self.cv;
      console.log('OpenCV already loaded');
      resolve();
    } else {
      console.log('Waiting for OpenCV to load');
      self.Module = {
        onRuntimeInitialized: () => {
          cv = self.cv;
          console.log('OpenCV loaded successfully');
          resolve();
        }
      };
    }
  });
}

self.onmessage = async function (e) {
  console.log('Worker received message:', e.data);
  try {
    await initOpenCV();

    const { images, action, processingChoices } = e.data;

    if (action === 'processImages') {
      console.log('Starting to process images in worker');
      console.log('Number of images received:', images.length);
      if (images.length === 0) {
        throw new Error('No images received');
      }
      const processedImages = await processImages(images, processingChoices);
      self.postMessage({ action: 'processImagesComplete', processedImages });
    } else {
      throw new Error('Unknown action: ' + action);
    }
  } catch (error) {
    console.error('Error in worker:', error);
    self.postMessage({ 
      action: 'error', 
      error: error.message, 
      stack: error.stack,
      details: error.toString()
    });
  }
};

async function processImages(images, processingChoices) {
  console.log('Processing images, count:', images.length);
  const processedImages = [];
  let prevImg = null;

  for (let i = 0; i < images.length; i++) {
    console.log(`Processing image ${i + 1} of ${images.length}`);
    try {
      console.log('Loading image into OpenCV');
      const src = loadImage(images[i]);
      console.log('Image loaded, size:', src.cols, 'x', src.rows);
      
      console.log('Processing frame');
      let processed = await processFrame(src, prevImg, i, images.length, processingChoices);
      console.log('Frame processed, size:', processed.cols, 'x', processed.rows);

      console.log('Converting processed frame to ImageData');
      let processedImageData = new ImageData(
        new Uint8ClampedArray(processed.data),
        processed.cols,
        processed.rows
      );
      console.log('Conversion complete');

      processedImages.push(processedImageData);

      if (prevImg) {
        prevImg.delete();
      }
      prevImg = processed.clone();
      src.delete();
      processed.delete();

    } catch (error) {
      console.error(`Error processing image ${i + 1}:`, error);
      throw new Error(`Error processing image ${i + 1}: ${error.message}`);
    }
  }

  if (prevImg) {
    prevImg.delete();
  }
  console.log('All images processed');
  return processedImages;
}

function loadImage(imageData) {
  return cv.matFromImageData(imageData);
}

async function processFrame(src, prevImg, index, totalFrames, processingChoices) {
  console.log(`Processing frame ${index + 1} with choices:`, processingChoices);
  let result = src.clone();

  try {
    if (processingChoices.align && prevImg) {
      console.log('Aligning image...');
      result = await alignImage(result, prevImg);
    }
    if (processingChoices.enhance) {
      console.log('Enhancing image...');
      result = await enhanceImage(result);
    }
    if (processingChoices.colorGrade) {
      console.log('Color grading image...');
      result = await colorGradeImage(result);
    }
    if (processingChoices.sharpen) {
      console.log('Sharpening image...');
      result = await sharpenImage(result);
    }
    if (processingChoices.denoise) {
      console.log('Denoising image...');
      result = await denoiseImage(result);
    }
    if (processingChoices.vignette) {
      console.log('Applying vignette...');
      result = await applyVignette(result);
    }

    // Ensure the result is in the correct format (8-bit per channel, 4 channels)
    let finalResult = new cv.Mat();
    cv.cvtColor(result, finalResult, cv.COLOR_BGR2RGBA);
    result.delete();

    return finalResult;
  } catch (error) {
    console.error(`Error processing frame ${index + 1}:`, error);
    if (result && !result.isDeleted()) {
      result.delete();
    }
    throw error;
  }
}

async function alignImage(src, prevImg) {
  try {
    const gray1 = new cv.Mat();
    const gray2 = new cv.Mat();
    cv.cvtColor(src, gray1, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(prevImg, gray2, cv.COLOR_RGBA2GRAY);

    const orb = new cv.ORB(500);
    const kp1 = new cv.KeyPointVector();
    const kp2 = new cv.KeyPointVector();
    const des1 = new cv.Mat();
    const des2 = new cv.Mat();

    orb.detectAndCompute(gray1, new cv.Mat(), kp1, des1);
    orb.detectAndCompute(gray2, new cv.Mat(), kp2, des2);

    const bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
    const matches = new cv.DMatchVector();
    bf.match(des1, des2, matches);

    const good_matches = Array.from(matches).sort((a, b) => a.distance - b.distance).slice(0, 50);

    if (good_matches.length < 4) {
      throw new Error('Not enough good matches found for alignment');
    }

    const src_pts = cv.matFromArray(good_matches.length, 2, cv.CV_32F,
      good_matches.flatMap(m => [kp1.get(m.queryIdx).pt.x, kp1.get(m.queryIdx).pt.y]));
    const dst_pts = cv.matFromArray(good_matches.length, 2, cv.CV_32F,
      good_matches.flatMap(m => [kp2.get(m.trainIdx).pt.x, kp2.get(m.trainIdx).pt.y]));

    const H = cv.findHomography(src_pts, dst_pts, cv.RANSAC);

    if (!H || H.empty()) {
      throw new Error('Failed to find homography matrix');
    }

    const aligned = new cv.Mat();
    cv.warpPerspective(src, aligned, H, new cv.Size(src.cols, src.rows));

    // Clean up
    gray1.delete(); gray2.delete(); des1.delete(); des2.delete();
    src_pts.delete(); dst_pts.delete(); H.delete();
    orb.delete(); bf.delete(); matches.delete();

    return aligned;
  } catch (error) {
    console.error('Error in alignImage:', error);
    return src.clone(); // Return the original image if alignment fails
  }
}

async function warpImage(src, index, totalFrames) {
  const progress = index / (totalFrames - 1);
  const angle = Math.sin(progress * Math.PI * 2) * 2; // Subtle rotation
  const scale = 1 + Math.sin(progress * Math.PI * 2) * 0.05; // Subtle zoom

  const center = new cv.Point(src.cols / 2, src.rows / 2);
  const M = cv.getRotationMatrix2D(center, angle, scale);
  const dsize = new cv.Size(src.cols, src.rows);
  const warped = new cv.Mat();
  cv.warpAffine(src, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  M.delete();
  return warped;
}

async function blendImage(src, prevImg) {
  try {
    console.log('Starting image blending...');
    console.log('Source image size:', src.cols, 'x', src.rows);
    console.log('Previous image size:', prevImg.cols, 'x', prevImg.rows);

    if (src.cols !== prevImg.cols || src.rows !== prevImg.rows) {
      console.warn('Image sizes do not match. Resizing previous image.');
      const resized = new cv.Mat();
      cv.resize(prevImg, resized, new cv.Size(src.cols, src.rows));
      const blended = new cv.Mat();
      cv.addWeighted(src, 0.7, resized, 0.3, 0, blended);
      resized.delete();
      return blended;
    }

    const blended = new cv.Mat();
    cv.addWeighted(src, 0.7, prevImg, 0.3, 0, blended);
    return blended;
  } catch (error) {
    console.error('Error in blendImage:', error);
    return src.clone(); // Return the original image if blending fails
  }
}

async function correctColorAndExposure(src) {
  try {
    console.log('Starting color correction...');
    console.log('Source image size:', src.cols, 'x', src.rows);

    const lab = new cv.Mat();
    cv.cvtColor(src, lab, cv.COLOR_RGB2Lab);

    const channels = new cv.MatVector();
    cv.split(lab, channels);

    if (channels.size() !== 3) {
      throw new Error(`Expected 3 channels, but got ${channels.size()}`);
    }

    const l_channel = channels.get(0);
    const a_channel = channels.get(1);
    const b_channel = channels.get(2);

    console.log('Channel sizes:',
      `L: ${l_channel.cols}x${l_channel.rows}`,
      `a: ${a_channel.cols}x${a_channel.rows}`,
      `b: ${b_channel.cols}x${b_channel.rows}`);

    // Enhance lightness
    cv.equalizeHist(l_channel, l_channel);

    // Enhance color (with bounds checking)
    const normalizeChannel = (channel) => {
      const minMaxResult = cv.minMaxLoc(channel);
      if (minMaxResult.minVal < minMaxResult.maxVal) {
        cv.normalize(channel, channel, 0, 255, cv.NORM_MINMAX);
      }
    };

    normalizeChannel(a_channel);
    normalizeChannel(b_channel);

    const mergedChannels = new cv.MatVector();
    mergedChannels.push_back(l_channel);
    mergedChannels.push_back(a_channel);
    mergedChannels.push_back(b_channel);

    cv.merge(mergedChannels, lab);
    const result = new cv.Mat();
    cv.cvtColor(lab, result, cv.COLOR_Lab2RGB);

    console.log('Color correction completed');

    // Clean up
    lab.delete();
    channels.delete();
    l_channel.delete();
    a_channel.delete();
    b_channel.delete();
    mergedChannels.delete();

    return result;
  } catch (error) {
    console.error('Error in correctColorAndExposure:', error);
    return src.clone(); // Return the original image if color correction fails
  }
}

async function stabilizeImage(src, prevImg) {
  try {
    console.log('Starting image stabilization...');
    console.log('Source image size:', src.cols, 'x', src.rows);
    console.log('Previous image size:', prevImg.cols, 'x', prevImg.rows);

    const gray1 = new cv.Mat();
    const gray2 = new cv.Mat();
    cv.cvtColor(src, gray1, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(prevImg, gray2, cv.COLOR_RGBA2GRAY);

    const points1 = new cv.Mat();
    const points2 = new cv.Mat();
    const status = new cv.Mat();
    const error = new cv.Mat();

    cv.goodFeaturesToTrack(gray1, points1, 200, 0.01, 10);
    cv.calcOpticalFlowPyrLK(gray1, gray2, points1, points2, status, error);

    const good_new = [];
    const good_old = [];

    for (let i = 0; i < status.rows; i++) {
      if (status.data[i] === 1) {
        good_new.push(new cv.Point(points2.data32F[i * 2], points2.data32F[i * 2 + 1]));
        good_old.push(new cv.Point(points1.data32F[i * 2], points1.data32F[i * 2 + 1]));
      }
    }

    if (good_new.length < 4 || good_old.length < 4) {
      console.log('Not enough good points for stabilization');
      return src.clone();
    }

    console.log('Number of good points:', good_new.length);

    const M = cv.estimateRigidTransform(good_old, good_new, false);

    if (!M || M.rows === 0) {
      console.log('Failed to estimate rigid transform');
      return src.clone();
    }

    const stabilized = new cv.Mat();
    cv.warpAffine(src, stabilized, M, new cv.Size(src.cols, src.rows));

    console.log('Image stabilization completed');

    // Clean up
    gray1.delete(); gray2.delete(); points1.delete(); points2.delete();
    status.delete(); error.delete(); M.delete();

    return stabilized;
  } catch (error) {
    console.error('Error in stabilizeImage:', error);
    return src.clone(); // Return the original image if stabilization fails
  }
}

async function enhanceImage(src) {
  try {
    let result = src.clone();
    
    // Convert to LAB color space
    let lab = new cv.Mat();
    cv.cvtColor(result, lab, cv.COLOR_BGR2Lab);
    
    // Split channels
    let channels = new cv.MatVector();
    cv.split(lab, channels);
    
    // Enhance L channel (brightness)
    let l_channel = channels.get(0);
    cv.equalizeHist(l_channel, l_channel);
    
    // Merge channels
    cv.merge(channels, lab);
    
    // Convert back to BGR
    cv.cvtColor(lab, result, cv.COLOR_Lab2BGR);
    
    // Adjust contrast
    let alpha = 1.2; // Contrast control (1.0-3.0)
    let beta = 10;   // Brightness control (0-100)
    cv.convertScaleAbs(result, result, alpha, beta);
    
    // Clean up
    lab.delete();
    channels.delete();
    
    return result;
  } catch (error) {
    console.error('Error in enhanceImage:', error);
    return src.clone();
  }
}

async function colorGradeImage(src) {
  try {
    let result = src.clone();
    
    // Convert to HSV
    let hsv = new cv.Mat();
    cv.cvtColor(result, hsv, cv.COLOR_BGR2HSV);
    
    // Split channels
    let channels = new cv.MatVector();
    cv.split(hsv, channels);
    
    // Adjust hue (rotate colors)
    let h_channel = channels.get(0);
    cv.add(h_channel, new cv.Scalar(30), h_channel); // Rotate hue by 30 degrees
    
    // Increase saturation
    let s_channel = channels.get(1);
    cv.multiply(s_channel, new cv.Scalar(1.2), s_channel);
    
    // Merge channels
    cv.merge(channels, hsv);
    
    // Convert back to BGR
    cv.cvtColor(hsv, result, cv.COLOR_HSV2BGR);
    
    // Clean up
    hsv.delete();
    channels.delete();
    
    return result;
  } catch (error) {
    console.error('Error in colorGradeImage:', error);
    return src.clone();
  }
}

async function sharpenImage(src) {
  try {
    let sharpened = new cv.Mat();
    let kernel = cv.Mat.ones(3, 3, cv.CV_32F);
    kernel.floatPtr(1, 1)[0] = 5;
    cv.filter2D(src, sharpened, -1, kernel, new cv.Point(-1, -1), 0, cv.BORDER_DEFAULT);
    kernel.delete();
    return sharpened;
  } catch (error) {
    console.error('Error in sharpenImage:', error);
    return src.clone();
  }
}

async function denoiseImage(src) {
  try {
    let denoised = new cv.Mat();
    cv.fastNlMeansDenoisingColored(src, denoised, 10, 10, 7, 21);
    return denoised;
  } catch (error) {
    console.error('Error in denoiseImage:', error);
    return src.clone();
  }
}

async function applyVignette(src) {
  try {
    let result = src.clone();
    let rows = result.rows;
    let cols = result.cols;
    let kernel_x = cv.getGaussianKernel(cols, cols * 0.3);
    let kernel_y = cv.getGaussianKernel(rows, rows * 0.3);
    let kernel = kernel_y.matMul(kernel_x.t());
    let mask = new cv.Mat();
    cv.normalize(kernel, mask, 0, 1, cv.NORM_MINMAX);
    let channels = new cv.MatVector();
    cv.split(result, channels);
    for (let i = 0; i < 3; i++) {
      cv.multiply(channels.get(i), mask, channels.get(i));
    }
    cv.merge(channels, result);
    kernel.delete();
    mask.delete();
    channels.delete();
    return result;
  } catch (error) {
    console.error('Error in applyVignette:', error);
    return src.clone();
  }
}

// function blobToDataURL(blob) {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.onloadend = () => resolve(reader.result);
//     reader.onerror = reject;
//     reader.readAsDataURL(blob);
//   });
// }