// Image Processing Algorithms (Canvas API)
// Optimized for phone-captured document photos

class ImageProcessor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    async process(imageElement, options) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const width = imageElement.naturalWidth || imageElement.width;
                    const height = imageElement.naturalHeight || imageElement.height;
                    
                    this.canvas.width = width;
                    this.canvas.height = height;
                    
                    this.ctx.drawImage(imageElement, 0, 0, width, height);
                    let processedData = this.ctx.getImageData(0, 0, width, height);
                    
                    const brightness = parseInt(options.brightness) || 0;
                    const contrast = parseInt(options.contrast) || 0;
                    const threshold = parseInt(options.threshold) || 128;
                    const shadowStrength = (parseInt(options.shadow) || 0) / 100;
                    
                    if (options.mode === 'bw') {
                        processedData = this.processBW(processedData, width, height, shadowStrength, threshold);
                    } else if (options.mode === 'color') {
                        processedData = this.processColor(processedData, width, height, shadowStrength);
                    } else if (options.mode === 'enhance') {
                        processedData = this.processEnhance(processedData, width, height, shadowStrength);
                    }
                    
                    if (brightness !== 0 || contrast !== 0) {
                        processedData = this.applyBrightnessContrast(processedData, brightness, contrast);
                    }

                    if (options.eraserMask) {
                        processedData = this.applySmartEraser(processedData, options.eraserMask, width, height);
                    }

                    this.ctx.putImageData(processedData, 0, 0);
                    resolve(this.canvas);
                } catch (err) {
                    reject(err);
                }
            }, 50);
        });
    }

    // ============================================================
    // B&W Scan - Clean black text on white background
    // ============================================================
    processBW(imgData, w, h, shadowStrength, thresholdValue) {
        const data = imgData.data;
        let gray = new Float32Array(w * h);

        // Convert to grayscale (float for precision)
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }

        // Shadow removal with large-kernel background estimation
        if (shadowStrength > 0) {
            gray = this.removeShadows(gray, w, h, shadowStrength);
        }

        // Adaptive threshold using Sauvola-inspired method
        // Use large window for document-scale features
        const windowSize = Math.max(15, Math.floor(Math.min(w, h) / 15));
        // Map slider: 0=very sensitive (more black), 255=less sensitive (more white)
        // k controls how much darker a pixel must be vs local mean to be "ink"
        const k = 0.1 + (thresholdValue / 255) * 0.5; // range 0.1 to 0.6

        const localMean = this.multiPassBoxBlur(gray, w, h, windowSize);
        const localStdDev = this.computeLocalStdDev(gray, localMean, w, h, windowSize);

        const newData = new ImageData(w, h);
        const out = newData.data;

        for (let i = 0, j = 0; i < out.length; i += 4, j++) {
            // Sauvola: threshold = mean * (1 + k * (stddev / R - 1))
            const R = 128;
            const localThresh = localMean[j] * (1.0 + k * (localStdDev[j] / R - 1.0));
            const val = gray[j] < localThresh ? 0 : 255;
            out[i] = val;
            out[i + 1] = val;
            out[i + 2] = val;
            out[i + 3] = data[i + 3];
        }

        return newData;
    }

    // ============================================================
    // Color Scan - Clean document with preserved grayscale tones
    // This is what CamScanner-like apps typically produce
    // ============================================================
    processColor(imgData, w, h, shadowStrength) {
        const data = imgData.data;
        let gray = new Float32Array(w * h);

        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }

        // Strong shadow removal
        if (shadowStrength > 0) {
            gray = this.removeShadows(gray, w, h, shadowStrength);
        }

        // Contrast stretching based on histogram
        gray = this.histogramStretch(gray, w, h);

        // Gamma correction to brighten midtones (make paper whiter)
        const gamma = 1.4;
        for (let i = 0; i < gray.length; i++) {
            gray[i] = 255 * Math.pow(gray[i] / 255, 1 / gamma);
        }

        const newData = new ImageData(w, h);
        const out = newData.data;

        for (let i = 0, j = 0; i < out.length; i += 4, j++) {
            const val = this.clamp(gray[j]);
            out[i] = val;
            out[i + 1] = val;
            out[i + 2] = val;
            out[i + 3] = data[i + 3];
        }

        return newData;
    }

    // ============================================================
    // Enhance - Light cleanup, keeps original character
    // ============================================================
    processEnhance(imgData, w, h, shadowStrength) {
        const data = imgData.data;

        // Per-channel shadow removal for color preservation
        let r = new Float32Array(w * h);
        let g = new Float32Array(w * h);
        let b = new Float32Array(w * h);

        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            r[j] = data[i];
            g[j] = data[i + 1];
            b[j] = data[i + 2];
        }

        if (shadowStrength > 0) {
            const mildStrength = shadowStrength * 0.6;
            r = this.removeShadows(r, w, h, mildStrength);
            g = this.removeShadows(g, w, h, mildStrength);
            b = this.removeShadows(b, w, h, mildStrength);
        }

        // Light contrast stretch per channel
        r = this.histogramStretch(r, w, h, 2, 98);
        g = this.histogramStretch(g, w, h, 2, 98);
        b = this.histogramStretch(b, w, h, 2, 98);

        const newData = new ImageData(w, h);
        const out = newData.data;

        for (let i = 0, j = 0; i < out.length; i += 4, j++) {
            out[i] = this.clamp(r[j]);
            out[i + 1] = this.clamp(g[j]);
            out[i + 2] = this.clamp(b[j]);
            out[i + 3] = data[i + 3];
        }

        return newData;
    }

    // ============================================================
    // CORE: Shadow Removal via Background Division
    // ============================================================
    removeShadows(channel, w, h, strength) {
        // Use very large blur to estimate background illumination
        // Larger radius = better shadow estimation for big shadows
        const radius = Math.max(20, Math.floor(Math.min(w, h) / 5));
        const background = this.multiPassBoxBlur(channel, w, h, radius);

        const result = new Float32Array(w * h);

        // Find max background value for normalization
        let maxBg = 0;
        for (let i = 0; i < background.length; i++) {
            if (background[i] > maxBg) maxBg = background[i];
        }
        if (maxBg === 0) maxBg = 1;

        for (let i = 0; i < channel.length; i++) {
            const bg = background[i] || 1;
            // Divide by background and normalize
            const corrected = (channel[i] / bg) * maxBg;
            // Blend based on strength
            result[i] = channel[i] * (1 - strength) + corrected * strength;
        }

        return result;
    }

    // ============================================================
    // Histogram-based Contrast Stretching
    // ============================================================
    histogramStretch(channel, w, h, lowPercentile = 1, highPercentile = 99) {
        const size = w * h;

        // Build histogram
        const histogram = new Int32Array(256);
        for (let i = 0; i < size; i++) {
            const val = Math.min(255, Math.max(0, Math.round(channel[i])));
            histogram[val]++;
        }

        // Find percentile bounds
        const lowCount = Math.floor(size * lowPercentile / 100);
        const highCount = Math.floor(size * highPercentile / 100);

        let cumulative = 0;
        let lowVal = 0;
        for (let i = 0; i < 256; i++) {
            cumulative += histogram[i];
            if (cumulative >= lowCount) { lowVal = i; break; }
        }

        cumulative = 0;
        let highVal = 255;
        for (let i = 255; i >= 0; i--) {
            cumulative += histogram[i];
            if (cumulative >= (size - highCount)) { highVal = i; break; }
        }

        if (highVal <= lowVal) highVal = lowVal + 1;

        // Stretch
        const result = new Float32Array(size);
        const range = highVal - lowVal;
        for (let i = 0; i < size; i++) {
            result[i] = ((channel[i] - lowVal) / range) * 255;
            if (result[i] < 0) result[i] = 0;
            if (result[i] > 255) result[i] = 255;
        }

        return result;
    }

    // ============================================================
    // Multi-pass Box Blur (approximates Gaussian)
    // 3 passes of box blur ≈ Gaussian blur
    // ============================================================
    multiPassBoxBlur(source, w, h, radius) {
        let current = new Float32Array(source);
        // 3 passes for better Gaussian approximation
        const passes = 3;
        const passRadius = Math.max(1, Math.floor(radius / passes));

        for (let p = 0; p < passes; p++) {
            current = this.boxBlurFloat(current, w, h, passRadius);
        }
        return current;
    }

    // Single-pass box blur on Float32Array
    boxBlurFloat(source, w, h, r) {
        const temp = new Float32Array(w * h);
        const target = new Float32Array(w * h);

        // Horizontal pass
        for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            let sum = 0;
            const kernelSize = 2 * r + 1;

            // Initialize sum for first pixel
            for (let i = -r; i <= r; i++) {
                sum += source[rowOffset + Math.min(w - 1, Math.max(0, i))];
            }

            for (let x = 0; x < w; x++) {
                temp[rowOffset + x] = sum / kernelSize;
                const addIdx = Math.min(w - 1, x + r + 1);
                const remIdx = Math.max(0, x - r);
                sum += source[rowOffset + addIdx] - source[rowOffset + remIdx];
            }
        }

        // Vertical pass
        for (let x = 0; x < w; x++) {
            let sum = 0;
            const kernelSize = 2 * r + 1;

            for (let i = -r; i <= r; i++) {
                sum += temp[Math.min(h - 1, Math.max(0, i)) * w + x];
            }

            for (let y = 0; y < h; y++) {
                target[y * w + x] = sum / kernelSize;
                const addIdx = Math.min(h - 1, y + r + 1);
                const remIdx = Math.max(0, y - r);
                sum += temp[addIdx * w + x] - temp[remIdx * w + x];
            }
        }

        return target;
    }

    // ============================================================
    // Compute Local Standard Deviation for Sauvola threshold
    // ============================================================
    computeLocalStdDev(gray, localMean, w, h, radius) {
        // Compute local mean of squared values
        const squared = new Float32Array(w * h);
        for (let i = 0; i < gray.length; i++) {
            squared[i] = gray[i] * gray[i];
        }
        const localMeanSq = this.multiPassBoxBlur(squared, w, h, radius);

        // stddev = sqrt(E[X^2] - E[X]^2)
        const stddev = new Float32Array(w * h);
        for (let i = 0; i < gray.length; i++) {
            const variance = Math.max(0, localMeanSq[i] - localMean[i] * localMean[i]);
            stddev[i] = Math.sqrt(variance);
        }
        return stddev;
    }

    // ============================================================
    // Brightness & Contrast adjustment
    // ============================================================
    applyBrightnessContrast(imgData, brightness, contrast) {
        const data = imgData.data;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
            data[i] = this.clamp(factor * (data[i] - 128) + 128 + brightness);
            data[i + 1] = this.clamp(factor * (data[i + 1] - 128) + 128 + brightness);
            data[i + 2] = this.clamp(factor * (data[i + 2] - 128) + 128 + brightness);
        }
        return imgData;
    }

    clamp(val) {
        return Math.min(255, Math.max(0, Math.round(val)));
    }

    // ============================================================
    // Perspective Crop Math & Warp
    // ============================================================
    async perspectiveWarp(imageElement, pts, dstW, dstH) {
        // pts is array of 4 points: [{x,y}, {x,y}, {x,y}, {x,y}] (TL, TR, BR, BL)
        // Destination points are corners of dstW x dstH rectangle
        const dstPts = [
            {x: 0, y: 0},
            {x: dstW, y: 0},
            {x: dstW, y: dstH},
            {x: 0, y: dstH}
        ];
        
        // We want a matrix M that maps dstPts to pts (so we can inverse map)
        const M = this.getHomography(dstPts, pts);
        
        // Create canvas to read original image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageElement.naturalWidth || imageElement.width;
        tempCanvas.height = imageElement.naturalHeight || imageElement.height;
        const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        tCtx.drawImage(imageElement, 0, 0);
        const srcData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        
        // Create destination image data
        const dstData = new ImageData(dstW, dstH);
        
        // Warp pixels
        this.warpPixels(srcData, dstData, M);
        
        // Return a new canvas with the warped image
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = dstW;
        resultCanvas.height = dstH;
        resultCanvas.getContext('2d').putImageData(dstData, 0, 0);
        return resultCanvas;
    }

    getHomography(src, dst) {
        // src and dst are array of 4 {x,y} points
        // Returns 3x3 matrix mapping src to dst
        // We solve A * h = 0
        const A = [];
        for (let i = 0; i < 4; i++) {
            const x = src[i].x;
            const y = src[i].y;
            const u = dst[i].x;
            const v = dst[i].y;
            A.push([-x, -y, -1, 0, 0, 0, x*u, y*u, u]);
            A.push([0, 0, 0, -x, -y, -1, x*v, y*v, v]);
        }
        
        // Solve A*h = 0 using Gaussian elimination on A^T * A or by simple elimination since it's 8x9
        // A is 8x9. We can set h_8 = 1 and solve for 8 variables.
        const B = [];
        for (let i = 0; i < 8; i++) {
            B.push([...A[i].slice(0,8), -A[i][8]]); // Move last column to RHS
        }
        
        const h = this.solveLinearSystem(B);
        h.push(1.0); // h_8
        
        return [
            [h[0], h[1], h[2]],
            [h[3], h[4], h[5]],
            [h[6], h[7], h[8]]
        ];
    }
    
    solveLinearSystem(M) {
        // M is 8x9 matrix (8 equations, 8 unknowns + 1 RHS)
        const n = 8;
        for (let i = 0; i < n; i++) {
            // Find pivot
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
                    maxRow = k;
                }
            }
            
            // Swap
            const temp = M[i];
            M[i] = M[maxRow];
            M[maxRow] = temp;
            
            // Make diagonal 1
            const pivot = M[i][i];
            if (Math.abs(pivot) < 1e-10) return Array(n).fill(0); // Singular
            for (let j = i; j <= n; j++) {
                M[i][j] /= pivot;
            }
            
            // Eliminate other rows
            for (let k = 0; k < n; k++) {
                if (k === i) continue;
                const factor = M[k][i];
                for (let j = i; j <= n; j++) {
                    M[k][j] -= factor * M[i][j];
                }
            }
        }
        
        // Return RHS
        const result = [];
        for (let i = 0; i < n; i++) {
            result.push(M[i][n]);
        }
        return result;
    }
    
    warpPixels(src, dst, M) {
        const sw = src.width;
        const sh = src.height;
        const dw = dst.width;
        const dh = dst.height;
        
        const srcData = src.data;
        const dstData = dst.data;
        
        for (let y = 0; y < dh; y++) {
            for (let x = 0; x < dw; x++) {
                // Map dst(x,y) to src(u,v)
                const z = M[2][0] * x + M[2][1] * y + M[2][2];
                let u = (M[0][0] * x + M[0][1] * y + M[0][2]) / z;
                let v = (M[1][0] * x + M[1][1] * y + M[1][2]) / z;
                
                // Bilinear interpolation
                const u0 = Math.floor(u);
                const v0 = Math.floor(v);
                const u1 = u0 + 1;
                const v1 = v0 + 1;
                
                const fu = u - u0;
                const fv = v - v0;
                
                const dstIdx = (y * dw + x) * 4;
                
                if (u0 >= 0 && u1 < sw && v0 >= 0 && v1 < sh) {
                    const i00 = (v0 * sw + u0) * 4;
                    const i10 = (v0 * sw + u1) * 4;
                    const i01 = (v1 * sw + u0) * 4;
                    const i11 = (v1 * sw + u1) * 4;
                    
                    for (let c = 0; c < 4; c++) {
                        const val = (
                            srcData[i00 + c] * (1 - fu) * (1 - fv) +
                            srcData[i10 + c] * fu * (1 - fv) +
                            srcData[i01 + c] * (1 - fu) * fv +
                            srcData[i11 + c] * fu * fv
                        );
                        dstData[dstIdx + c] = val;
                    }
                } else {
                    // Out of bounds
                    dstData[dstIdx] = 0;
                    dstData[dstIdx+1] = 0;
                    dstData[dstIdx+2] = 0;
                    dstData[dstIdx+3] = 0;
                }
            }
        }
    }

    // ============================================================
    // Smart Eraser
    // ============================================================
    applySmartEraser(imgData, maskCanvas, w, h) {
        const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
        const maskData = maskCtx.getImageData(0, 0, w, h).data;
        const data = imgData.data;

        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            const maskVal = maskData[i+3]; // Read Alpha channel for intensity
            if (maskVal > 0) {
                const r = data[i], g = data[i+1], b = data[i+2];
                const luma = r * 0.299 + g * 0.587 + b * 0.114;
                
                // Smart protection: if it's very dark (text), protection is 1.
                // If it's lighter (shadow/smudge), protection is 0.
                const protection = Math.max(0, Math.min(1, (120 - luma) / 60));
                
                const eraseFactor = (maskVal / 255) * (1 - protection);
                
                data[i] = r + (255 - r) * eraseFactor;
                data[i+1] = g + (255 - g) * eraseFactor;
                data[i+2] = b + (255 - b) * eraseFactor;
            }
        }
        return imgData;
    }

    // ============================================================
    // Background Removal - حذف خودکار پس‌زمینه اسناد
    // ============================================================
    async removeBackground(imageElement, tolerance = 30, edgeSmooth = 3) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const width = imageElement.naturalWidth || imageElement.width;
                    const height = imageElement.naturalHeight || imageElement.height;

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.drawImage(imageElement, 0, 0, width, height);

                    const imgData = ctx.getImageData(0, 0, width, height);
                    const data = imgData.data;

                    // ۱. نمونه‌برداری از رنگ‌های ۴ گوشه تصویر (میانگین بلوک‌های ۲۰×۲۰)
                    const blockSize = Math.min(20, Math.floor(width / 4), Math.floor(height / 4));
                    const sampleCorner = (startX, startY) => {
                        let rSum = 0, gSum = 0, bSum = 0, count = 0;
                        const endY = Math.min(height, startY + blockSize);
                        const endX = Math.min(width, startX + blockSize);
                        for (let y = startY; y < endY; y++) {
                            for (let x = startX; x < endX; x++) {
                                const idx = (y * width + x) * 4;
                                rSum += data[idx];
                                gSum += data[idx + 1];
                                bSum += data[idx + 2];
                                count++;
                            }
                        }
                        return count > 0 ? { r: rSum / count, g: gSum / count, b: bSum / count } : { r: 255, g: 255, b: 255 };
                    };

                    const cTL = sampleCorner(0, 0);
                    const cTR = sampleCorner(width - blockSize, 0);
                    const cBL = sampleCorner(0, height - blockSize);
                    const cBR = sampleCorner(width - blockSize, height - blockSize);

                    // ۴. محاسبه نقشه لبه‌ها با الگوریتم سوبل (Sobel edge detection)
                    const gray = new Uint8Array(width * height);
                    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                        gray[j] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
                    }

                    const edgeMap = new Uint8Array(width * height);
                    for (let y = 1; y < height - 1; y++) {
                        const rowOffset = y * width;
                        for (let x = 1; x < width - 1; x++) {
                            const idx = rowOffset + x;
                            const p00 = gray[idx - width - 1], p01 = gray[idx - width], p02 = gray[idx - width + 1];
                            const p10 = gray[idx - 1],                                  p12 = gray[idx + 1];
                            const p20 = gray[idx + width - 1], p21 = gray[idx + width], p22 = gray[idx + width + 1];

                            const gx = (-p00 + p02) + 2 * (-p10 + p12) + (-p20 + p22);
                            const gy = (-p00 - 2 * p01 - p02) + (p20 + 2 * p21 + p22);

                            const mag = Math.min(255, Math.round(Math.sqrt(gx * gx + gy * gy) / 4));
                            edgeMap[idx] = mag;
                        }
                    }

                    // آستانه لبه برای جلوگیری از حذف یا نفوذ به حاشیه‌های سند
                    const edgeThreshold = 35;

                    // فاصله رنگی مجاز بر اساس tolerance (۰-۱۰۰)
                    const maxColorDist = tolerance * 2.8;
                    const colorDist = (r, g, b, corner) => {
                        const dr = r - corner.r;
                        const dg = g - corner.g;
                        const db = b - corner.b;
                        return Math.sqrt(dr * dr + dg * dg + db * db);
                    };

                    // ۲ و ۳. الگوریتم Flood-fill از هر ۴ گوشه به صورت همزمان
                    const visited = new Uint8Array(width * height);
                    const isBackground = new Uint8Array(width * height);
                    const queue = new Int32Array(width * height);
                    let head = 0;
                    let tail = 0;

                    const addSeed = (x, y) => {
                        if (x < 0 || x >= width || y < 0 || y >= height) return;
                        const idx = y * width + x;
                        if (visited[idx] === 0) {
                            visited[idx] = 1;
                            isBackground[idx] = 1;
                            queue[tail++] = idx;
                        }
                    };

                    // بذرهای اولیه در ۴ گوشه تصویر
                    addSeed(0, 0);
                    addSeed(width - 1, 0);
                    addSeed(0, height - 1);
                    addSeed(width - 1, height - 1);

                    const dx = [1, -1, 0, 0];
                    const dy = [0, 0, 1, -1];

                    while (head < tail) {
                        const curIdx = queue[head++];
                        const cx = curIdx % width;
                        const cy = (curIdx / width) | 0;

                        for (let d = 0; d < 4; d++) {
                            const nx = cx + dx[d];
                            const ny = cy + dy[d];

                            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                            const nIdx = ny * width + nx;
                            if (visited[nIdx]) continue;
                            visited[nIdx] = 1;

                            // ۵. حفاظت از لبه‌ها با استفاده از نقشه لبه
                            if (edgeMap[nIdx] > edgeThreshold) {
                                continue;
                            }

                            // مقایسه رنگ پیکسل با رنگ‌های گوشه‌ها
                            const pIdx = nIdx * 4;
                            const r = data[pIdx];
                            const g = data[pIdx + 1];
                            const b = data[pIdx + 2];

                            const minDist = Math.min(
                                colorDist(r, g, b, cTL),
                                colorDist(r, g, b, cTR),
                                colorDist(r, g, b, cBL),
                                colorDist(r, g, b, cBR)
                            );

                            if (minDist <= maxColorDist) {
                                isBackground[nIdx] = 1;
                                queue[tail++] = nIdx;
                            }
                        }
                    }

                    // ماسک آلفای اولیه: پس‌زمینه = ۰، پیش‌زمینه = ۲۵۵
                    let alphaMask = new Uint8Array(width * height);
                    for (let i = 0; i < width * height; i++) {
                        alphaMask[i] = isBackground[i] ? 0 : 255;
                    }

                    // ۶. اعمال Gaussian Blur روی ماسک آلفا برای نرم‌سازی لبه‌ها
                    const smoothRadius = Math.min(20, Math.max(0, Math.round(edgeSmooth)));
                    if (smoothRadius > 0) {
                        alphaMask = this.applyAlphaMaskBlur(alphaMask, width, height, smoothRadius);
                    }

                    // ۷. تنظیم کانال آلفا برای شفاف‌سازی پیکسل‌های پس‌زمینه
                    for (let i = 0; i < width * height; i++) {
                        const a = alphaMask[i];
                        const idx = i * 4;
                        data[idx + 3] = a < 3 ? 0 : Math.min(data[idx + 3], a);
                    }

                    // ۸. برگرداندن بوم با تصویر شفاف حاصل
                    ctx.putImageData(imgData, 0, 0);
                    resolve(canvas);
                } catch (err) {
                    reject(err);
                }
            }, 50);
        });
    }

    applyAlphaMaskBlur(mask, w, h, radius) {
        const sigma = Math.max(0.8, radius / 2.5);
        const kernelSize = 2 * radius + 1;
        const kernel = new Float32Array(kernelSize);
        let kSum = 0;
        for (let i = -radius; i <= radius; i++) {
            const val = Math.exp(-(i * i) / (2 * sigma * sigma));
            kernel[i + radius] = val;
            kSum += val;
        }
        for (let i = 0; i < kernelSize; i++) {
            kernel[i] /= kSum;
        }

        const temp = new Float32Array(w * h);
        const result = new Uint8Array(w * h);

        // پیمایش افقی
        for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const px = Math.min(w - 1, Math.max(0, x + k));
                    sum += mask[rowOffset + px] * kernel[k + radius];
                }
                temp[rowOffset + x] = sum;
            }
        }

        // پیمایش عمودی
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                let sum = 0;
                for (let k = -radius; k <= radius; k++) {
                    const py = Math.min(h - 1, Math.max(0, y + k));
                    sum += temp[py * w + x] * kernel[k + radius];
                }
                result[y * w + x] = Math.round(sum);
            }
        }

        return result;
    }
}

window.DocProcessor = new ImageProcessor();
