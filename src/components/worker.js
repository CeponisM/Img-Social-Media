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
      console.log('Alignment complete, size:', result.cols, 'x', result.rows);
    }
    if (processingChoices.warp) {
      console.log('Warping image...');
      result = await warpImage(result, index, totalFrames);
      console.log('Warping complete, size:', result.cols, 'x', result.rows);
    }
    if (processingChoices.blend && prevImg) {
      console.log('Blending image...');
      result = await blendImage(result, prevImg);
      console.log('Blending complete, size:', result.cols, 'x', result.rows);
    }
    if (processingChoices.colorCorrect) {
      console.log('Color correcting image...');
      const corrected = await correctColorAndExposure(result);
      result.delete();
      result = corrected;
      console.log('Color correction complete, size:', result.cols, 'x', result.rows);
    }
    if (processingChoices.stabilize && prevImg) {
      console.log('Stabilizing image...');
      const stabilized = await stabilizeImage(result, prevImg);
      result.delete();
      result = stabilized;
      console.log('Stabilization complete, size:', result.cols, 'x', result.rows);
    }
    if (processingChoices.enhance) {
      console.log('Enhancing image...');
      const enhanced = await enhanceImage(result);
      result.delete();
      result = enhanced;
      console.log('Enhancement complete, size:', result.cols, 'x', result.rows);
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
  console.log('Enhancing image for social media. Source image properties:',
              'size:', src.cols + 'x' + src.rows,
              'type:', src.type(),
              'channels:', src.channels());

  let rgbImage, channels, blurred, glowEffect, brightened, tinted, mask, vignette;

  try {
    // Convert to RGB color space if not already
    rgbImage = new cv.Mat();
    if (src.channels() === 4) {
      cv.cvtColor(src, rgbImage, cv.COLOR_RGBA2RGB);
    } else if (src.channels() === 3) {
      src.copyTo(rgbImage);
    } else {
      throw new Error(`Unexpected number of channels: ${src.channels()}`);
    }

    console.log('Converted to RGB. Image properties:',
                'size:', rgbImage.cols + 'x' + rgbImage.rows,
                'type:', rgbImage.type(),
                'channels:', rgbImage.channels());

    // Split the image into channels
    channels = new cv.MatVector();
    cv.split(rgbImage, channels);

    console.log('Split channels. Number of channels:', channels.size());

    // Adjust individual color channels
    for (let i = 0; i < 3; i++) {
      let channel = channels.get(i);
      console.log(`Processing channel ${i}. Size: ${channel.cols}x${channel.rows}, Type: ${channel.type()}`);
      
      // Increase contrast
      cv.convertScaleAbs(channel, channel, 1.2, 10);
      
      // Adjust gamma (midtones)
      let lut = new cv.Mat(1, 256, cv.CV_8U);
      for (let j = 0; j < 256; j++) {
        lut.data[j] = Math.pow(j / 255, 0.85) * 255;
      }
      cv.LUT(channel, lut, channel);
      lut.delete();
    }

    console.log('Channels processed');

    // Merge channels back
    cv.merge(channels, rgbImage);

    console.log('Channels merged');

    // Apply slight blur for softer look
    blurred = new cv.Mat();
    cv.GaussianBlur(rgbImage, blurred, new cv.Size(0, 0), 1.5, 1.5);

    console.log('Blur applied');

    // Blend original and blurred image for "glow" effect
    glowEffect = new cv.Mat();
    cv.addWeighted(rgbImage, 0.75, blurred, 0.25, 0, glowEffect);

    console.log('Glow effect applied');

    // Increase overall brightness and contrast
    brightened = new cv.Mat();
    cv.convertScaleAbs(glowEffect, brightened, 1.1, 15);

    console.log('Brightness and contrast adjusted');

    // Apply slight color tint (warm filter)
    tinted = new cv.Mat();
    let M = cv.matFromArray(3, 3, cv.CV_32F, [1.1, 0, 0, 0, 1.07, 0, 0, 0, 1.05]);
    cv.transform(brightened, tinted, M);
    M.delete();

    console.log('Color tint applied');

    // Apply vignette effect
    let center = new cv.Point(src.cols / 2, src.rows / 2);
    mask = new cv.Mat(src.rows, src.cols, cv.CV_8U);
    for (let y = 0; y < src.rows; y++) {
      for (let x = 0; x < src.cols; x++) {
        let distance = Math.sqrt(Math.pow(x - center.x, 2) + Math.pow(y - center.y, 2));
        let value = Math.max(0, Math.min(255, 255 - (distance / Math.max(center.x, center.y)) * 70));
        mask.ucharPtr(y, x)[0] = value;
      }
    }
    vignette = new cv.Mat();
    cv.addWeighted(tinted, 0.8, mask, 0.2, 0, vignette);

    console.log('Vignette effect applied');

    console.log('Social media image enhancement completed successfully');
    return vignette;
  } catch (error) {
    console.error('Error in enhanceImage:', error);
    throw error;
  } finally {
    // Cleanup
    const matsToDelete = [rgbImage, channels, blurred, glowEffect, brightened, tinted, mask];
    for (let mat of matsToDelete) {
      if (mat && !mat.isDeleted()) {
        mat.delete();
      }
    }
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