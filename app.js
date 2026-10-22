document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const workspace = document.getElementById('workspace');
    const thumbnailList = document.getElementById('thumbnail-list');
    
    const canvasOriginal = document.getElementById('canvas-original');
    const ctxOriginal = canvasOriginal.getContext('2d');
    const canvasResult = document.getElementById('canvas-result');
    const ctxResult = canvasResult.getContext('2d');
    const resultContainer = document.getElementById('result-container');
    
    const processBtn = document.getElementById('process-btn');
    const downloadSingleBtn = document.getElementById('download-single-btn');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const exportFormat = document.getElementById('export-format');
    const addMoreBtn = document.getElementById('add-more-btn');
    
    // Sliders & Controls
    const controls = {
        mode: document.querySelectorAll('input[name="mode"]'),
        brightness: document.getElementById('brightness'),
        contrast: document.getElementById('contrast'),
        threshold: document.getElementById('threshold'),
        shadow: document.getElementById('shadow')
    };
    
    const thresholdContainer = document.getElementById('threshold-container');

    // State
    let images = []; // Array of { id, file, imgObj, processedDataUrl }
    let currentImageIndex = -1;
    let isProcessing = false;

    // --- File Upload & Drag-Drop ---
    
    // --- History & Undo/Redo ---
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const resetImageBtn = document.getElementById('reset-image-btn');

    function cloneCanvasOrImage(source) {
        const c = document.createElement('canvas');
        c.width = source.width || source.naturalWidth;
        c.height = source.height || source.naturalHeight;
        c.getContext('2d').drawImage(source, 0, 0);
        return c;
    }

    function saveHistoryState(imgObj) {
        if (!imgObj) return;
        
        if (imgObj.historyIndex < imgObj.history.length - 1) {
            imgObj.history = imgObj.history.slice(0, imgObj.historyIndex + 1);
        }
        
        // Keep max 15 states to avoid memory issues
        if (imgObj.history.length >= 15) {
            imgObj.history.shift();
            imgObj.historyIndex--;
        }
        
        imgObj.history.push({
            imgElement: cloneCanvasOrImage(imgObj.imgElement),
            eraserMask: cloneCanvasOrImage(imgObj.eraserMask),
            settings: JSON.parse(JSON.stringify(imgObj.settings))
        });
        imgObj.historyIndex++;
        updateHistoryButtons();
    }
    
    function updateUIFromSettings(settings) {
        if (!settings) return;
        
        ['brightness', 'contrast', 'threshold', 'shadow'].forEach(id => {
            const slider = document.getElementById(id);
            const valSpan = document.getElementById(`${id}-val`);
            if (slider && valSpan) {
                slider.value = settings[id];
                valSpan.textContent = settings[id];
            }
        });
        
        const modeRadios = document.querySelectorAll('input[name="mode"]');
        modeRadios.forEach(r => {
            r.checked = (r.value === settings.mode);
        });
        
        const thresholdContainer = document.getElementById('threshold-container');
        if (thresholdContainer) {
            thresholdContainer.style.opacity = settings.mode === 'bw' ? '1' : '0.5';
            thresholdContainer.style.pointerEvents = settings.mode === 'bw' ? 'auto' : 'none';
        }
    }

    function updateHistoryButtons() {
        if (currentImageIndex === -1) {
            if(undoBtn) undoBtn.disabled = true;
            if(redoBtn) redoBtn.disabled = true;
            if(resetImageBtn) resetImageBtn.disabled = true;
            return;
        }
        
        const imgObj = images[currentImageIndex];
        if(undoBtn) undoBtn.disabled = imgObj.historyIndex <= 0;
        if(redoBtn) redoBtn.disabled = imgObj.historyIndex >= imgObj.history.length - 1;
        if(resetImageBtn) resetImageBtn.disabled = false;
    }

    if(undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (currentImageIndex === -1) return;
            const imgObj = images[currentImageIndex];
            if (imgObj.historyIndex > 0) {
                imgObj.historyIndex--;
                applyHistoryState(imgObj);
            }
        });
    }

    if(redoBtn) {
        redoBtn.addEventListener('click', () => {
            if (currentImageIndex === -1) return;
            const imgObj = images[currentImageIndex];
            if (imgObj.historyIndex < imgObj.history.length - 1) {
                imgObj.historyIndex++;
                applyHistoryState(imgObj);
            }
        });
    }

    function applyHistoryState(imgObj) {
        const state = imgObj.history[imgObj.historyIndex];
        imgObj.imgElement = cloneCanvasOrImage(state.imgElement);
        imgObj.eraserMask = cloneCanvasOrImage(state.eraserMask);
        if (state.settings) {
            imgObj.settings = JSON.parse(JSON.stringify(state.settings));
            updateUIFromSettings(imgObj.settings);
        }
        updateHistoryButtons();
        updateOriginalPreview(); // Update the left side preview
        scheduleProcess(); // Update the right side processed result
    }

    if(resetImageBtn) {
        resetImageBtn.addEventListener('click', () => {
            if (currentImageIndex === -1) return;
            if (!confirm('آیا مطمئن هستید که می‌خواهید این تصویر به حالت اولیه برگردد؟ تمام برش‌ها و پاک‌کردن‌ها از بین می‌رود.')) return;
            
            const imgObj = images[currentImageIndex];
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    imgObj.imgElement = img;
                    imgObj.eraserMask = document.createElement('canvas');
                    imgObj.eraserMask.width = img.naturalWidth;
                    imgObj.eraserMask.height = img.naturalHeight;
                    imgObj.history = [];
                    imgObj.historyIndex = -1;
                    
                    const controls = {
                        brightness: document.getElementById('brightness'),
                        contrast: document.getElementById('contrast'),
                        threshold: document.getElementById('threshold'),
                        shadow: document.getElementById('shadow'),
                        mode: document.querySelectorAll('input[name="mode"]')
                    };
                    imgObj.settings = {
                        mode: Array.from(controls.mode).find(r => r.checked).value,
                        brightness: controls.brightness.value,
                        contrast: controls.contrast.value,
                        threshold: controls.threshold.value,
                        shadow: controls.shadow.value
                    };
                    
                    saveHistoryState(imgObj);
                    updateOriginalPreview();
                    scheduleProcess();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(imgObj.file);
        });
    }
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    addMoreBtn.addEventListener('click', () => fileInput.click());

    function handleFiles(files) {
        if (!files.length) return;
        
        let fileProcessedCount = 0;
        
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const imgObj = {
                        id: Date.now() + Math.random().toString(36).substr(2, 9),
                        file: file,
                        name: file.name,
                        imgElement: img,
                        processedDataUrl: null,
                        eraserMask: document.createElement('canvas'),
                        history: [],
                        historyIndex: -1
                    };
                    const controls = {
                        brightness: document.getElementById('brightness'),
                        contrast: document.getElementById('contrast'),
                        threshold: document.getElementById('threshold'),
                        shadow: document.getElementById('shadow'),
                        mode: document.querySelectorAll('input[name="mode"]')
                    };
                    imgObj.settings = {
                        mode: Array.from(controls.mode).find(r => r.checked).value,
                        brightness: controls.brightness.value,
                        contrast: controls.contrast.value,
                        threshold: controls.threshold.value,
                        shadow: controls.shadow.value
                    };
                    imgObj.eraserMask.width = img.naturalWidth;
                    imgObj.eraserMask.height = img.naturalHeight;
                    
                    images.push(imgObj);
                    saveHistoryState(imgObj); // Save initial state
                    
                    addThumbnail(imgObj, images.length - 1);
                    
                    fileProcessedCount++;
                    if (fileProcessedCount === 1 && currentImageIndex === -1) {
                        // First image loaded
                        workspace.classList.remove('hidden');
                        dropZone.style.display = 'none';
                        selectImage(0);
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // --- Rotate ---
    const rotateBtn = document.getElementById('rotate-btn');
    if (rotateBtn) {
        rotateBtn.addEventListener('click', () => {
            if (currentImageIndex === -1) return;
            const imgObj = images[currentImageIndex];
            
            const w = imgObj.imgElement.naturalWidth || imgObj.imgElement.width;
            const h = imgObj.imgElement.naturalHeight || imgObj.imgElement.height;
            
            // Create a new canvas to hold the rotated image
            const rotatedCanvas = document.createElement('canvas');
            rotatedCanvas.width = h;
            rotatedCanvas.height = w;
            const ctx = rotatedCanvas.getContext('2d', { willReadFrequently: true });
            
            // Move origin to center, rotate, and move back
            ctx.translate(h / 2, w / 2);
            ctx.rotate(90 * Math.PI / 180);
            ctx.translate(-w / 2, -h / 2);
            
            // Draw image
            ctx.drawImage(imgObj.imgElement, 0, 0, w, h);
            
            // Replace imgElement with rotated canvas
            imgObj.imgElement = rotatedCanvas;
            
            // Reset eraser mask since dimensions swapped
            imgObj.eraserMask = document.createElement('canvas');
            imgObj.eraserMask.width = h;
            imgObj.eraserMask.height = w;
            
            // If crop mode is on, turn it off to avoid logic issues with rotated dimensions
            if (cropModeEnabled) {
                const cToggle = document.getElementById('crop-toggle');
                if (cToggle) cToggle.click();
            }
            
            saveHistoryState(imgObj);
            
            // Update views
            updateOriginalPreview();
            scheduleProcess();
        });
    }

    // --- UI Updates ---

    function addThumbnail(imgObj, index) {
        const div = document.createElement('div');
        div.className = 'thumb-wrapper';
        div.dataset.index = index;
        
        const img = document.createElement('img');
        img.src = imgObj.imgElement.src;
        
        const btn = document.createElement('button');
        btn.className = 'remove-thumb';
        btn.innerHTML = '×';
        btn.onclick = (e) => {
            e.stopPropagation();
            removeImage(index);
        };
        
        div.appendChild(img);
        div.appendChild(btn);
        
        div.onclick = () => selectImage(index);
        thumbnailList.appendChild(div);
    }

    function removeImage(index) {
        images.splice(index, 1);
        updateThumbnails();
        if (images.length === 0) {
            workspace.classList.add('hidden');
            dropZone.style.display = 'block';
            currentImageIndex = -1;
        } else {
            selectImage(Math.min(index, images.length - 1));
        }
    }

    function updateThumbnails() {
        thumbnailList.innerHTML = '';
        images.forEach((img, i) => addThumbnail(img, i));
        if (currentImageIndex !== -1 && images[currentImageIndex]) {
            thumbnailList.children[currentImageIndex].classList.add('active');
        }
    }

    function selectImage(index) {
        if (!images[index]) return;
        
        currentImageIndex = index;
        Array.from(thumbnailList.children).forEach((child, i) => {
            child.classList.toggle('active', i === index);
        });
        
        if (typeof resetZoom === 'function') resetZoom();
        updateOriginalPreview();
        updateUIFromSettings(images[index].settings);
        updateHistoryButtons();
        
        // Auto process
        processCurrentImage();
    }

    function updateOriginalPreview() {
        if (currentImageIndex === -1) return;
        const imgObj = images[currentImageIndex];
        canvasOriginal.width = imgObj.imgElement.naturalWidth || imgObj.imgElement.width;
        canvasOriginal.height = imgObj.imgElement.naturalHeight || imgObj.imgElement.height;
        ctxOriginal.drawImage(imgObj.imgElement, 0, 0);
        applyZoomTransform();
        if (cropModeEnabled) {
            updateCropOverlay();
        }
    }

    // --- Zoom Logic ---
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomFitBtn = document.getElementById('zoom-fit-btn');
    const zoomLevelSpan = document.getElementById('zoom-level');
    const originalContainer = document.getElementById('original-container');

    let zoomScale = 1;
    let panX = 0, panY = 0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;

    function applyZoomTransform() {
        canvasOriginal.style.transform = `scale(${zoomScale}) translate(${panX}px, ${panY}px)`;
        canvasOriginal.style.transformOrigin = 'center center';
        
        // Redraw overlay to map to new visual coordinates
        if (cropModeEnabled) updateCropOverlay();
        
        if (zoomLevelSpan) zoomLevelSpan.textContent = Math.round(zoomScale * 100) + '%';
    }

    function setZoom(newScale) {
        zoomScale = Math.max(0.25, Math.min(5, newScale));
        if (Math.abs(zoomScale - 1) < 0.05) zoomScale = 1; // snap to 100%
        if (zoomScale <= 1) { panX = 0; panY = 0; } // reset pan when zoomed out
        applyZoomTransform();
    }

    function resetZoom() {
        zoomScale = 1;
        panX = 0;
        panY = 0;
        applyZoomTransform();
        if (cropModeEnabled) updateCropOverlay();
    }

    // Mouse wheel zoom
    originalContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom(zoomScale + delta);
    }, { passive: false });

    // Zoom buttons
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => setZoom(zoomScale + 0.25));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setZoom(zoomScale - 0.25));
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', () => resetZoom());

    // Pan with middle mouse or left mouse when zoomed in
    originalContainer.addEventListener('mousedown', (e) => {
        if (zoomScale <= 1) return;
        if (cropModeEnabled && e.target.closest('.crop-handle, .crop-overlay polygon')) return;
        if (eraserModeEnabled) return;
        isPanning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        originalContainer.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - panStartX;
        panY = e.clientY - panStartY;
        applyZoomTransform();
        if (cropModeEnabled) updateCropOverlay();
    });

    document.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            originalContainer.style.cursor = zoomScale > 1 ? 'grab' : 'default';
        }
    });

    // --- Sliders logic ---
    
    function updateSliderValue(sliderId) {
        const slider = document.getElementById(sliderId);
        const valSpan = document.getElementById(`${sliderId}-val`);
        slider.addEventListener('input', () => {
            valSpan.textContent = slider.value;
        });
    }
    
    ['brightness', 'contrast', 'threshold', 'shadow'].forEach(updateSliderValue);

    // Debounced auto-processing
    let processTimeout = null;
    function scheduleProcess() {
        if (processTimeout) clearTimeout(processTimeout);
        processTimeout = setTimeout(() => processCurrentImage(), 300);
    }

    // Auto-process when sliders change
    ['brightness', 'contrast', 'threshold', 'shadow'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('input', (e) => {
            if (currentImageIndex !== -1) {
                images[currentImageIndex].settings[id] = e.target.value;
                scheduleProcess();
            }
        });
        el.addEventListener('change', () => {
            if (currentImageIndex !== -1) {
                saveHistoryState(images[currentImageIndex]);
            }
        });
    });

    // Toggle threshold slider visibility based on mode & auto-process
    controls.mode.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            thresholdContainer.style.opacity = val === 'bw' ? '1' : '0.5';
            thresholdContainer.style.pointerEvents = val === 'bw' ? 'auto' : 'none';
            if (currentImageIndex !== -1) {
                images[currentImageIndex].settings.mode = val;
                saveHistoryState(images[currentImageIndex]);
                scheduleProcess();
            }
        });
    });

    // --- Smart Eraser Logic ---
    const eraserToggleBtn = document.getElementById('eraser-toggle');
    const eraserClearBtn = document.getElementById('eraser-clear');
    const brushSizeContainer = document.getElementById('brush-size-container');
    const brushSizeSlider = document.getElementById('brush-size');
    const brushSizeVal = document.getElementById('brush-size-val');
    
    const brushIntensityContainer = document.getElementById('brush-intensity-container');
    const brushIntensitySlider = document.getElementById('brush-intensity');
    const brushIntensityVal = document.getElementById('brush-intensity-val');

    let eraserModeEnabled = false;
    let isErasing = false;
    let lastEraserPos = null;

    // --- Crop Logic ---
    const cropToggleBtn = document.getElementById('crop-toggle');
    const cropApplyBtn = document.getElementById('crop-apply');
    const cropOverlay = document.getElementById('crop-overlay');
    const cropPolygon = document.getElementById('crop-polygon');
    const cropHandles = [
        document.getElementById('crop-tl'),
        document.getElementById('crop-tr'),
        document.getElementById('crop-br'),
        document.getElementById('crop-bl')
    ];
    let cropModeEnabled = false;
    // Points stored in image coordinates (0 to naturalWidth/Height)
    let cropPoints = [];
    let draggingHandleIndex = -1;

    function initCropPoints() {
        if (currentImageIndex === -1) return;
        const imgObj = images[currentImageIndex];
        const w = imgObj.imgElement.naturalWidth || imgObj.imgElement.width;
        const h = imgObj.imgElement.naturalHeight || imgObj.imgElement.height;
        
        // Initial crop rectangle is 10% from edges
        cropPoints = [
            { x: w * 0.1, y: h * 0.1 },
            { x: w * 0.9, y: h * 0.1 },
            { x: w * 0.9, y: h * 0.9 },
            { x: w * 0.1, y: h * 0.9 }
        ];
        updateCropOverlay();
    }

    function imageToSvg(imgX, imgY) {
        const container = document.getElementById('original-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const cw = canvasOriginal.width;
        const ch = canvasOriginal.height;
        const rectWidth = canvasOriginal.offsetWidth;
        const rectHeight = canvasOriginal.offsetHeight;
        
        const uX = (imgX / cw) * rectWidth;
        const uY = (imgY / ch) * rectHeight;
        const dx = uX - rectWidth / 2;
        const dy = uY - rectHeight / 2;
        
        const centerX = containerWidth / 2 + panX * zoomScale;
        const centerY = containerHeight / 2 + panY * zoomScale;
        
        return { 
            x: centerX + dx * zoomScale, 
            y: centerY + dy * zoomScale 
        };
    }

    function svgToImage(svgX, svgY) {
        const container = document.getElementById('original-container');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const cw = canvasOriginal.width;
        const ch = canvasOriginal.height;
        const rectWidth = canvasOriginal.offsetWidth;
        const rectHeight = canvasOriginal.offsetHeight;
        
        const centerX = containerWidth / 2 + panX * zoomScale;
        const centerY = containerHeight / 2 + panY * zoomScale;
        
        const dx = (svgX - centerX) / zoomScale;
        const dy = (svgY - centerY) / zoomScale;
        
        const uX = dx + rectWidth / 2;
        const uY = dy + rectHeight / 2;
        
        let imgX = (uX / rectWidth) * cw;
        let imgY = (uY / rectHeight) * ch;
        
        // Clamp
        imgX = Math.max(0, Math.min(cw, imgX));
        imgY = Math.max(0, Math.min(ch, imgY));
        
        return { x: imgX, y: imgY };
    }

    function updateCropOverlay() {
        if (!cropModeEnabled || cropPoints.length === 0) return;
        const ptsSvg = cropPoints.map(p => imageToSvg(p.x, p.y));
        
        cropPolygon.setAttribute('points', ptsSvg.map(p => `${p.x},${p.y}`).join(' '));
        
        for (let i = 0; i < 4; i++) {
            cropHandles[i].setAttribute('cx', ptsSvg[i].x);
            cropHandles[i].setAttribute('cy', ptsSvg[i].y);
        }
    }

    function toggleCropMode() {
        if (currentImageIndex === -1) return;
        cropModeEnabled = !cropModeEnabled;
        const cropToggleBtn2 = document.getElementById('crop-toggle-2');
        if (cropModeEnabled) {
            if (cropToggleBtn) {
                cropToggleBtn.textContent = 'لغو برش';
                cropToggleBtn.classList.replace('secondary-btn', 'primary-btn');
            }
            if (cropToggleBtn2) {
                cropToggleBtn2.textContent = 'لغو برش';
                cropToggleBtn2.classList.replace('secondary-btn', 'primary-btn');
            }
            cropApplyBtn.style.display = 'block';
            cropOverlay.style.display = 'block';
            initCropPoints();
        } else {
            if (cropToggleBtn) {
                cropToggleBtn.textContent = 'برش پرسپکتیو (خاموش)';
                cropToggleBtn.classList.replace('primary-btn', 'secondary-btn');
            }
            if (cropToggleBtn2) {
                cropToggleBtn2.textContent = 'برش پرسپکتیو';
                cropToggleBtn2.classList.replace('primary-btn', 'secondary-btn');
            }
            cropApplyBtn.style.display = 'none';
            cropOverlay.style.display = 'none';
        }
    }

    if (cropToggleBtn) {
        cropToggleBtn.addEventListener('click', toggleCropMode);
    }
    const cropToggleBtn2 = document.getElementById('crop-toggle-2');
    if (cropToggleBtn2) {
        cropToggleBtn2.addEventListener('click', toggleCropMode);
    }

        // Crop Handles Dragging
        cropHandles.forEach((handle, index) => {
            handle.addEventListener('mousedown', (e) => {
                draggingHandleIndex = index;
                e.stopPropagation(); // prevent other events
            });
        });

        // Use document for mousemove/mouseup to prevent losing tracking when mouse moves fast
        document.addEventListener('mousemove', (e) => {
            if (draggingHandleIndex === -1 || !cropModeEnabled) return;
            const svgRect = cropOverlay.getBoundingClientRect();
            const svgX = e.clientX - svgRect.left;
            const svgY = e.clientY - svgRect.top;
            
            cropPoints[draggingHandleIndex] = svgToImage(svgX, svgY);
            updateCropOverlay();
        });

        const stopCropDrag = () => { draggingHandleIndex = -1; };
        document.addEventListener('mouseup', stopCropDrag);

        // Enter key to confirm crop
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && cropModeEnabled && !cropApplyBtn.disabled) {
                e.preventDefault();
                cropApplyBtn.click();
            }
        });

        cropApplyBtn.addEventListener('click', async () => {
            if (currentImageIndex === -1) return;
            const imgObj = images[currentImageIndex];
            
            const originalText = cropApplyBtn.textContent;
            cropApplyBtn.textContent = 'در حال برش...';
            cropApplyBtn.disabled = true;
            
            // Allow UI to render the loading text
            await new Promise(r => setTimeout(r, 50));
            
            try {
                // Calculate destination size based on max width/height of the polygon
                const w1 = Math.hypot(cropPoints[0].x - cropPoints[1].x, cropPoints[0].y - cropPoints[1].y);
                const w2 = Math.hypot(cropPoints[2].x - cropPoints[3].x, cropPoints[2].y - cropPoints[3].y);
                const dstW = Math.max(10, Math.round(Math.max(w1, w2)));
                
                const h1 = Math.hypot(cropPoints[1].x - cropPoints[2].x, cropPoints[1].y - cropPoints[2].y);
                const h2 = Math.hypot(cropPoints[3].x - cropPoints[0].x, cropPoints[3].y - cropPoints[0].y);
                const dstH = Math.max(10, Math.round(Math.max(h1, h2)));
                
                if (dstW < 10 || dstH < 10) {
                    alert('کادر برش خیلی کوچک است!');
                    return;
                }
                
                // Apply warp
                const warpedCanvas = await window.DocProcessor.perspectiveWarp(imgObj.imgElement, cropPoints, dstW, dstH);
                
                // Replace imgElement with warped canvas directly (Canvas API works as image source)
                imgObj.imgElement = warpedCanvas;
                
                // Reset eraser mask for this image since size changed
                imgObj.eraserMask = document.createElement('canvas');
                imgObj.eraserMask.width = dstW;
                imgObj.eraserMask.height = dstH;
                
                // Turn off crop mode
                if (cropModeEnabled) {
                    cropToggleBtn.click();
                }
                
                saveHistoryState(imgObj);
                
                // Update views
                updateOriginalPreview();
                scheduleProcess();
            } catch (err) {
                console.error('Crop Error:', err);
                alert('خطا در برش تصویر!');
            } finally {
                cropApplyBtn.textContent = originalText;
                cropApplyBtn.disabled = false;
            }
        });

    if (eraserToggleBtn) {
        eraserToggleBtn.addEventListener('click', () => {
            eraserModeEnabled = !eraserModeEnabled;
            if (eraserModeEnabled) {
                eraserToggleBtn.textContent = 'پاک‌کن هوشمند (روشن)';
                eraserToggleBtn.classList.replace('secondary-btn', 'primary-btn');
                eraserClearBtn.style.display = 'block';
                brushSizeContainer.style.display = 'block';
                brushIntensityContainer.style.display = 'block';
                resultContainer.classList.add('eraser-active');
            } else {
                eraserToggleBtn.textContent = 'پاک‌کن هوشمند (خاموش)';
                eraserToggleBtn.classList.replace('primary-btn', 'secondary-btn');
                eraserClearBtn.style.display = 'none';
                brushSizeContainer.style.display = 'none';
                brushIntensityContainer.style.display = 'none';
                resultContainer.classList.remove('eraser-active');
            }
        });

        brushSizeSlider.addEventListener('input', () => {
            brushSizeVal.textContent = brushSizeSlider.value;
        });

        brushIntensitySlider.addEventListener('input', () => {
            brushIntensityVal.textContent = brushIntensitySlider.value;
        });

        eraserClearBtn.addEventListener('click', () => {
            if (currentImageIndex === -1) return;
            const imgObj = images[currentImageIndex];
            const maskCtx = imgObj.eraserMask.getContext('2d');
            maskCtx.clearRect(0, 0, imgObj.eraserMask.width, imgObj.eraserMask.height);
            saveHistoryState(imgObj);
            scheduleProcess();
        });

        function getMousePos(canvas, evt) {
            const container = document.getElementById('original-container');
            const containerRect = container.getBoundingClientRect();
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            
            const cw = canvas.width;
            const ch = canvas.height;
            const rectWidth = canvas.offsetWidth;
            const rectHeight = canvas.offsetHeight;
            
            const centerX = containerWidth / 2 + panX * zoomScale;
            const centerY = containerHeight / 2 + panY * zoomScale;
            
            const mouseX = evt.clientX - containerRect.left;
            const mouseY = evt.clientY - containerRect.top;
            
            const dx = (mouseX - centerX) / zoomScale;
            const dy = (mouseY - centerY) / zoomScale;
            
            const uX = dx + rectWidth / 2;
            const uY = dy + rectHeight / 2;
            
            const x = (uX / rectWidth) * cw;
            const y = (uY / rectHeight) * ch;
            
            return { x, y };
        }

        canvasResult.addEventListener('mousedown', (e) => {
            if (!eraserModeEnabled || currentImageIndex === -1) return;
            isErasing = true;
            lastEraserPos = getMousePos(canvasResult, e);
        });

        canvasResult.addEventListener('mousemove', (e) => {
            if (!isErasing || !eraserModeEnabled || currentImageIndex === -1) return;
            const pos = getMousePos(canvasResult, e);
            const brushSize = parseInt(brushSizeSlider.value);
            const brushIntensity = parseInt(brushIntensitySlider.value) / 100;
            const imgObj = images[currentImageIndex];
            const maskCtx = imgObj.eraserMask.getContext('2d');
            
            maskCtx.strokeStyle = `rgba(255, 255, 255, ${brushIntensity})`;
            maskCtx.lineWidth = brushSize;
            maskCtx.lineCap = 'round';
            maskCtx.lineJoin = 'round';
            maskCtx.beginPath();
            maskCtx.moveTo(lastEraserPos.x, lastEraserPos.y);
            maskCtx.lineTo(pos.x, pos.y);
            maskCtx.stroke();
            
            ctxResult.strokeStyle = `rgba(255, 255, 255, ${Math.max(0.1, brushIntensity / 2)})`;
            ctxResult.lineWidth = brushSize;
            ctxResult.lineCap = 'round';
            ctxResult.lineJoin = 'round';
            ctxResult.beginPath();
            ctxResult.moveTo(lastEraserPos.x, lastEraserPos.y);
            ctxResult.lineTo(pos.x, pos.y);
            ctxResult.stroke();
            
            lastEraserPos = pos;
        });

        const stopErasing = () => {
            if (isErasing) {
                isErasing = false;
                if (currentImageIndex !== -1) {
                    saveHistoryState(images[currentImageIndex]);
                }
                scheduleProcess();
            }
        };
        
        canvasResult.addEventListener('mouseup', stopErasing);
        canvasResult.addEventListener('mouseleave', stopErasing);
    }

    // --- Background Removal ---
    const bgRemoveBtn = document.getElementById('bg-remove-btn');
    const bgToleranceSlider = document.getElementById('bg-tolerance');
    const bgToleranceVal = document.getElementById('bg-tolerance-val');
    const bgSmoothSlider = document.getElementById('bg-smooth');
    const bgSmoothVal = document.getElementById('bg-smooth-val');

    if (bgToleranceSlider) {
        bgToleranceSlider.addEventListener('input', () => {
            bgToleranceVal.textContent = bgToleranceSlider.value;
        });
    }
    if (bgSmoothSlider) {
        bgSmoothSlider.addEventListener('input', () => {
            bgSmoothVal.textContent = bgSmoothSlider.value;
        });
    }

    if (bgRemoveBtn) {
        bgRemoveBtn.addEventListener('click', async () => {
            if (currentImageIndex === -1) return;
            const imgObj = images[currentImageIndex];
            
            bgRemoveBtn.textContent = '\u23f3 \u062f\u0631 \u062d\u0627\u0644 \u062d\u0630\u0641 \u0628\u06a9\u06af\u0631\u0627\u0646\u062f...';
            bgRemoveBtn.disabled = true;
            
            try {
                const tolerance = parseInt(bgToleranceSlider.value);
                const edgeSmooth = parseInt(bgSmoothSlider.value);
                
                const resultCanvas = await window.DocProcessor.removeBackground(
                    imgObj.imgElement, tolerance, edgeSmooth
                );
                
                imgObj.imgElement = resultCanvas;
                
                // Reset eraser mask for new dimensions
                imgObj.eraserMask = document.createElement('canvas');
                imgObj.eraserMask.width = resultCanvas.width;
                imgObj.eraserMask.height = resultCanvas.height;
                
                saveHistoryState(imgObj);
                updateOriginalPreview();
                scheduleProcess();
                
                // Switch to PNG format since we have transparency
                if (exportFormat) exportFormat.value = 'image/png';
            } catch (err) {
                console.error('Background Removal Error:', err);
                alert('\u062e\u0637\u0627 \u062f\u0631 \u062d\u0630\u0641 \u0628\u06a9\u06af\u0631\u0627\u0646\u062f: ' + (err.message || err));
            } finally {
                bgRemoveBtn.textContent = '\u062d\u0630\u0641 \u0628\u06a9\u06af\u0631\u0627\u0646\u062f';
                bgRemoveBtn.disabled = false;
            }
        });
    }

    // --- Transfer to Composer ---
    const openComposerLink = document.getElementById('open-composer-link');
    if (openComposerLink) {
        openComposerLink.addEventListener('click', () => {
            if (currentImageIndex !== -1 && images[currentImageIndex]) {
                const imgObj = images[currentImageIndex];
                const dataUrl = imgObj.processedDataUrl || canvasResult.toDataURL('image/png');
                try {
                    localStorage.setItem('composer_import_image', JSON.stringify({
                        name: imgObj.name || 'تصویر اسکن شده',
                        dataUrl: dataUrl
                    }));
                } catch (e) {
                    console.warn('Could not store image for composer:', e);
                }
            }
        });
    }

    // --- Processing ---

    async function processCurrentImage() {
        if (currentImageIndex === -1 || isProcessing) return;
        
        isProcessing = true;
        resultContainer.classList.add('loading');
        
        const imgObj = images[currentImageIndex];
        const options = {
            ...imgObj.settings,
            eraserMask: imgObj.eraserMask
        };
        
        try {
            const processedCanvas = await window.DocProcessor.process(imgObj.imgElement, options);
            
            canvasResult.width = processedCanvas.width;
            canvasResult.height = processedCanvas.height;
            ctxResult.drawImage(processedCanvas, 0, 0);
            
            imgObj.processedDataUrl = canvasResult.toDataURL(exportFormat.value, 0.9);
            
        } catch (error) {
            console.error("Processing failed", error);
        } finally {
            isProcessing = false;
            resultContainer.classList.remove('loading');
        }
    }

    processBtn.addEventListener('click', processCurrentImage);

    // --- Downloads ---

    downloadSingleBtn.addEventListener('click', () => {
        if (currentImageIndex === -1 || !images[currentImageIndex].processedDataUrl) return;
        
        const imgObj = images[currentImageIndex];
        const format = exportFormat.value === 'image/jpeg' ? 'jpg' : 'png';
        const link = document.createElement('a');
        link.download = `scanned_${imgObj.name.split('.')[0]}.${format}`;
        link.href = imgObj.processedDataUrl;
        link.click();
    });

    downloadAllBtn.addEventListener('click', async () => {
        if (images.length === 0) return;
        
        downloadAllBtn.textContent = 'در حال آماده‌سازی...';
        downloadAllBtn.disabled = true;
        
        const zip = new JSZip();
        const format = exportFormat.value === 'image/jpeg' ? 'jpg' : 'png';
        
        // Ensure all are processed
        
        for (let i = 0; i < images.length; i++) {
            let imgObj = images[i];
            
            // Re-apply specific options for the batch export with each image's mask
            const exportOptions = { ...imgObj.settings, eraserMask: imgObj.eraserMask };
            const processedCanvas = await window.DocProcessor.process(imgObj.imgElement, exportOptions);
            const dataUrl = processedCanvas.toDataURL(exportFormat.value, 0.9);
            const base64Data = dataUrl.replace(/^data:image\/(png|jpeg);base64,/, "");
            zip.file(`scanned_${imgObj.name.split('.')[0]}.${format}`, base64Data, {base64: true});
        }
        
        zip.generateAsync({type:"blob"}).then(function(content) {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = "scanned_documents.zip";
            link.click();
            
            downloadAllBtn.textContent = 'دانلود همه (ZIP)';
            downloadAllBtn.disabled = false;
        });
    });

    // --- PDF Download ---
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    
    // Page sizes in mm
    const PDF_SIZES = {
        'id-card': { w: 85.6, h: 53.98, label: 'کارت ملی' },
        'a5':      { w: 148,  h: 210,   label: 'A5' },
        'a4':      { w: 210,  h: 297,   label: 'A4' },
        'a3':      { w: 297,  h: 420,   label: 'A3' }
    };

    downloadPdfBtn.addEventListener('click', async () => {
        const pdfSizeRadio = document.querySelector('input[name="pdf-size"]:checked');
        if (!pdfSizeRadio) {
            alert('لطفاً یک سایز PDF انتخاب کنید!');
            return;
        }
        if (images.length === 0) {
            alert('هیچ تصویری وجود ندارد!');
            return;
        }

        const sizeKey = pdfSizeRadio.value;
        const size = PDF_SIZES[sizeKey];
        
        downloadPdfBtn.textContent = '⏳ در حال ساخت PDF...';
        downloadPdfBtn.disabled = true;

        try {
            const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
            if (!jsPDF) {
                alert('کتابخانه سازنده PDF بارگذاری نشده است. لطفاً چند ثانیه صبر کنید یا صفحه را رفرش کنید.');
                return;
            }
            
            // For ID Card, we output an A4 page to prevent printer scaling issues.
            const isIdCard = (sizeKey === 'id-card');
            
            let pageW = isIdCard ? PDF_SIZES['a4'].w : size.w;
            let pageH = isIdCard ? PDF_SIZES['a4'].h : size.h;
            
            const orientation = pageW > pageH ? 'landscape' : 'portrait';
            
            const doc = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: [pageW, pageH]
            });

            let currentIdCardY = 20; // 2cm margin from top
            
            for (let i = 0; i < images.length; i++) {
                if (i > 0) {
                    if (isIdCard) {
                        // For ID cards, only add a new page if we run out of vertical space
                        if (currentIdCardY + size.h + 10 > pageH - 20) {
                            doc.addPage([pageW, pageH], orientation);
                            currentIdCardY = 20;
                        }
                    } else {
                        // For A4/A5, always add a new page
                        doc.addPage([pageW, pageH], orientation);
                    }
                }
                
                const imgObj = images[i];
                const exportOptions = { ...imgObj.settings, eraserMask: imgObj.eraserMask };
                const processedCanvas = await window.DocProcessor.process(imgObj.imgElement, exportOptions);
                
                const imgW = processedCanvas.width;
                const imgH = processedCanvas.height;
                const imgRatio = imgW / imgH;
                
                let drawW, drawH, offsetX, offsetY;
                
                if (isIdCard) {
                    // Force the image into the exact physical dimensions of an ID card (85.6 x 53.98)
                    // We maintain aspect ratio so it doesn't distort if poorly cropped
                    const targetRatio = size.w / size.h;
                    if (imgRatio > targetRatio) {
                        drawW = size.w;
                        drawH = size.w / imgRatio;
                    } else {
                        drawH = size.h;
                        drawW = size.h * imgRatio;
                    }
                    // Center relative to A5 width (148mm) so it prints safely on BOTH A4 and A5 papers
                    // A5 width is 148. So center is at (148 - drawW) / 2 = ~31mm.
                    offsetX = Math.max(10, (148 - drawW) / 2);
                    offsetY = currentIdCardY;
                    
                    // Increment Y for the next image on this page
                    currentIdCardY += drawH + 10; // 10mm gap between cards
                } else {
                    const margin = 5;
                    const safeW = pageW - (margin * 2);
                    const safeH = pageH - (margin * 2);
                    const safeRatio = safeW / safeH;
                    
                    if (imgRatio > safeRatio) {
                        drawW = safeW;
                        drawH = safeW / imgRatio;
                        offsetX = margin;
                        offsetY = margin + (safeH - drawH) / 2;
                    } else {
                        drawH = safeH;
                        drawW = safeH * imgRatio;
                        offsetX = margin + (safeW - drawW) / 2;
                        offsetY = margin;
                    }
                }
                
                // Pass canvas directly to avoid huge base64 strings and memory issues
                doc.addImage(processedCanvas, 'JPEG', offsetX, offsetY, drawW, drawH);
            }

            doc.save(`scanned_${size.label}.pdf`);

        } catch (err) {
            console.error('PDF Error:', err);
            alert('خطا در ساخت PDF: ' + (err.message || err));
        } finally {
            downloadPdfBtn.textContent = 'دانلود PDF';
            downloadPdfBtn.disabled = false;
        }
    });
});
