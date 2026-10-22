/**
 * Layout Composer Script
 * Drag-and-drop printable document layout composer
 * Offline Chrome Extension Manifest V3
 */

document.addEventListener('DOMContentLoaded', () => {
    // Paper dimensions in millimeters (width x height in portrait)
    const PAPER_SIZES = {
        'a3': { w: 297, h: 420, label: 'A3' },
        'a4': { w: 210, h: 297, label: 'A4' },
        'a5': { w: 148, h: 210, label: 'A5' }
    };

    const MM_PER_CM = 10;
    const MARGIN = 10; // mm
    const SNAP_THRESHOLD = 2.5; // mm
    const GRID_SIZE = 10; // mm (1cm)
    const GRID_MINOR = 5; // mm
    const HANDLE_SIZE = 8; // Screen pixels for corner handles

    // UI Elements
    const paperSizeRadios = document.querySelectorAll('input[name="paper-size"]');
    const orientationRadios = document.querySelectorAll('input[name="orientation"]');
    const toggleGridCheckbox = document.getElementById('toggle-grid');
    const toggleGuidelinesCheckbox = document.getElementById('toggle-guidelines');
    const imageFileInput = document.getElementById('image-file-input');
    const addImageBtn = document.getElementById('add-image-btn');
    const imageListContainer = document.getElementById('image-list');
    const imageListEmpty = document.getElementById('image-list-empty');
    const autoLayoutBtn = document.getElementById('auto-layout-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');

    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomFitBtn = document.getElementById('zoom-fit-btn');
    const zoomLevelText = document.getElementById('zoom-level-text');
    const paperInfoLabel = document.getElementById('paper-info-label');
    const cursorPosLabel = document.getElementById('cursor-pos-label');

    const paperCanvasWrapper = document.getElementById('paper-canvas-wrapper');
    const paperCanvas = document.getElementById('paper-canvas');
    const paperCtx = paperCanvas.getContext('2d');

    const rulerHCanvas = document.getElementById('ruler-h');
    const rulerHCtx = rulerHCanvas.getContext('2d');
    const rulerHWrapper = document.getElementById('ruler-h-wrapper');

    const rulerVCanvas = document.getElementById('ruler-v');
    const rulerVCtx = rulerVCanvas.getContext('2d');
    const rulerVWrapper = document.getElementById('ruler-v-wrapper');

    const sizeBadge = document.getElementById('size-badge');

    // Selected Image Controls
    const selectedImageGroup = document.getElementById('selected-image-group');
    const imgWidthInput = document.getElementById('img-width-input');
    const imgHeightInput = document.getElementById('img-height-input');
    const imgPosXInput = document.getElementById('img-posx-input');
    const imgPosYInput = document.getElementById('img-posy-input');
    const lockAspectRatioCheckbox = document.getElementById('lock-aspect-ratio');
    const matchHeightBtn = document.getElementById('match-height-btn');
    const matchWidthBtn = document.getElementById('match-width-btn');
    const composerRemoveBgBtn = document.getElementById('composer-remove-bg-btn');
    const composerToleranceContainer = document.getElementById('composer-tolerance-container');
    const composerBgTol = document.getElementById('composer-bg-tol');
    const composerBgTolVal = document.getElementById('composer-bg-tol-val');
    const rotateImageBtn = document.getElementById('rotate-image-btn');
    const bringToFrontBtn = document.getElementById('bring-to-front-btn');
    const sendToBackBtn = document.getElementById('send-to-back-btn');

    // Crop Tool Controls
    const toggleCropBtn = document.getElementById('toggle-crop-btn');
    const cropPanel = document.getElementById('crop-panel');
    const cropLeftSlider = document.getElementById('crop-left-slider');
    const cropLeftVal = document.getElementById('crop-left-val');
    const cropRightSlider = document.getElementById('crop-right-slider');
    const cropRightVal = document.getElementById('crop-right-val');
    const cropTopSlider = document.getElementById('crop-top-slider');
    const cropTopVal = document.getElementById('crop-top-val');
    const cropBottomSlider = document.getElementById('crop-bottom-slider');
    const cropBottomVal = document.getElementById('crop-bottom-val');
    const cropHalfRight = document.getElementById('crop-half-right');
    const cropHalfLeft = document.getElementById('crop-half-left');
    const cropHalfTop = document.getElementById('crop-half-top');
    const cropHalfBottom = document.getElementById('crop-half-bottom');
    const applyCropBtn = document.getElementById('apply-crop-btn');
    const resetCropBtn = document.getElementById('reset-crop-btn');

    // State
    let paperSize = 'a4';
    let orientation = 'portrait'; // or 'landscape'
    let showGrid = false;
    let showGuidelines = true;
    let images = []; // Array of { id, img, x, y, width, height, naturalWidth, naturalHeight, name }
    let selectedImageId = null;
    let scale = 1; // zoom multiplier (0.5 to 3.0)
    let basePxPerMm = 2.5; // Calculated to fit paper nicely into viewport
    
    // Interaction State
    let isDragging = false;
    let isResizing = false;
    let dragOffset = { x: 0, y: 0 }; // in mm
    let resizeHandle = null; // 'tl', 'tr', 'bl', 'br'
    let resizeStart = { x: 0, y: 0, w: 0, h: 0, mouseX: 0, mouseY: 0 };
    let guidelines = []; // Array of { type: 'h'|'v', pos: mm }
    let nextImageId = 1;

    // Core dimensions helper
    function getPaperDimensions() {
        const base = PAPER_SIZES[paperSize] || PAPER_SIZES['a4'];
        if (orientation === 'landscape') {
            return { w: base.h, h: base.w, label: base.label };
        }
        return { w: base.w, h: base.h, label: base.label };
    }

    // Coordinate conversions between Millimeters and Screen Canvas Pixels
    function mmToPixel(mm) {
        return mm * basePxPerMm * scale;
    }

    function pixelToMm(px) {
        return px / (basePxPerMm * scale);
    }

    // Calculate base px per mm so the paper fits comfortably in wrapper with padding
    function updateBaseScale() {
        const dims = getPaperDimensions();
        const wrapperW = paperCanvasWrapper.clientWidth || 800;
        const wrapperH = paperCanvasWrapper.clientHeight || 600;
        const padding = 60; // total padding in px

        const availW = Math.max(100, wrapperW - padding);
        const availH = Math.max(100, wrapperH - padding);

        const scaleW = availW / dims.w;
        const scaleH = availH / dims.h;

        basePxPerMm = Math.min(scaleW, scaleH);
    }

    // Resize canvases to match container & paper dimensions with devicePixelRatio
    function resizeCanvases() {
        const dpr = window.devicePixelRatio || 1;
        const dims = getPaperDimensions();

        const canvasWidthCss = Math.round(mmToPixel(dims.w));
        const canvasHeightCss = Math.round(mmToPixel(dims.h));

        // Paper canvas
        paperCanvas.width = canvasWidthCss * dpr;
        paperCanvas.height = canvasHeightCss * dpr;
        paperCanvas.style.width = canvasWidthCss + 'px';
        paperCanvas.style.height = canvasHeightCss + 'px';
        paperCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Horizontal Ruler canvas
        const rHW = rulerHWrapper.clientWidth || 800;
        const rHH = rulerHWrapper.clientHeight || 25;
        rulerHCanvas.width = rHW * dpr;
        rulerHCanvas.height = rHH * dpr;
        rulerHCanvas.style.width = rHW + 'px';
        rulerHCanvas.style.height = rHH + 'px';
        rulerHCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Vertical Ruler canvas
        const rVW = rulerVWrapper.clientWidth || 25;
        const rVH = rulerVWrapper.clientHeight || 600;
        rulerVCanvas.width = rVW * dpr;
        rulerVCanvas.height = rVH * dpr;
        rulerVCanvas.style.width = rVW + 'px';
        rulerVCanvas.style.height = rVH + 'px';
        rulerVCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        updateLabels();
    }

    // Update status labels
    function updateLabels() {
        const dims = getPaperDimensions();
        const orientText = orientation === 'portrait' ? 'عمودی' : 'افقی';
        paperInfoLabel.textContent = `${dims.label} ${orientText} (${dims.w} × ${dims.h} میلی‌متر)`;
        zoomLevelText.textContent = `${Math.round(scale * 100)}%`;
    }

    // Main render function
    function render() {
        renderPaper();
        renderGrid();
        renderImages();
        renderSelection();
        renderGuidelines();
        renderRulers();
    }

    // Render Paper background
    function renderPaper() {
        const dims = getPaperDimensions();
        const w = mmToPixel(dims.w);
        const h = mmToPixel(dims.h);

        paperCtx.clearRect(0, 0, w, h);
        paperCtx.fillStyle = '#ffffff';
        paperCtx.fillRect(0, 0, w, h);
    }

    // Render Grid
    function renderGrid() {
        if (!showGrid) return;

        const dims = getPaperDimensions();
        const w = mmToPixel(dims.w);
        const h = mmToPixel(dims.h);

        paperCtx.save();
        paperCtx.lineWidth = 0.5;

        // Minor grid (every 5mm)
        paperCtx.strokeStyle = 'rgba(215, 225, 235, 0.7)';
        paperCtx.beginPath();
        for (let x = GRID_MINOR; x < dims.w; x += GRID_MINOR) {
            if (x % GRID_SIZE === 0) continue;
            const px = Math.round(mmToPixel(x)) + 0.5;
            paperCtx.moveTo(px, 0);
            paperCtx.lineTo(px, h);
        }
        for (let y = GRID_MINOR; y < dims.h; y += GRID_MINOR) {
            if (y % GRID_SIZE === 0) continue;
            const py = Math.round(mmToPixel(y)) + 0.5;
            paperCtx.moveTo(0, py);
            paperCtx.lineTo(w, py);
        }
        paperCtx.stroke();

        // Major grid (every 10mm / 1cm)
        paperCtx.strokeStyle = 'rgba(170, 195, 220, 0.85)';
        paperCtx.beginPath();
        for (let x = GRID_SIZE; x < dims.w; x += GRID_SIZE) {
            const px = Math.round(mmToPixel(x)) + 0.5;
            paperCtx.moveTo(px, 0);
            paperCtx.lineTo(px, h);
        }
        for (let y = GRID_SIZE; y < dims.h; y += GRID_SIZE) {
            const py = Math.round(mmToPixel(y)) + 0.5;
            paperCtx.moveTo(0, py);
            paperCtx.lineTo(w, py);
        }
        paperCtx.stroke();

        paperCtx.restore();
    }

    // Render Images
    function renderImages() {
        for (const item of images) {
            const px = mmToPixel(item.x);
            const py = mmToPixel(item.y);
            const pw = mmToPixel(item.width);
            const ph = mmToPixel(item.height);

            paperCtx.save();
            try {
                paperCtx.drawImage(item.img, px, py, pw, ph);
            } catch (err) {
                console.error('Error drawing image:', err);
            }

            // Light border around image
            paperCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            paperCtx.lineWidth = 1;
            paperCtx.strokeRect(px, py, pw, ph);
            paperCtx.restore();
        }
    }

    // Render Selection Frame and Resize Handles
    function renderSelection() {
        const selected = images.find(img => img.id === selectedImageId);
        if (!selected) return;

        const px = mmToPixel(selected.x);
        const py = mmToPixel(selected.y);
        const pw = mmToPixel(selected.width);
        const ph = mmToPixel(selected.height);

        paperCtx.save();

        // Selection border
        paperCtx.strokeStyle = '#0078d7';
        paperCtx.lineWidth = 1.5;
        paperCtx.setLineDash([4, 3]);
        paperCtx.strokeRect(px, py, pw, ph);
        paperCtx.setLineDash([]);

        // Corner handles
        const handles = getHandleCoordinates(px, py, pw, ph);
        paperCtx.fillStyle = '#ffffff';
        paperCtx.strokeStyle = '#0078d7';
        paperCtx.lineWidth = 2;

        const hs = HANDLE_SIZE;
        for (const key in handles) {
            const hCoord = handles[key];
            paperCtx.fillRect(hCoord.x - hs / 2, hCoord.y - hs / 2, hs, hs);
            paperCtx.strokeRect(hCoord.x - hs / 2, hCoord.y - hs / 2, hs, hs);
        }
        // Dimension badge attached to bottom of selection
        const cmW = (selected.width / 10).toFixed(1);
        const cmH = (selected.height / 10).toFixed(1);
        const tagText = `${cmW} × ${cmH} cm`;

        paperCtx.font = 'bold 11px Tahoma, sans-serif';
        const textMetrics = paperCtx.measureText(tagText);
        const tagW = textMetrics.width + 12;
        const tagH = 18;
        const tagX = px + (pw - tagW) / 2;
        const tagY = py + ph + 8;

        paperCtx.fillStyle = 'rgba(0, 120, 215, 0.95)';
        paperCtx.fillRect(tagX, tagY, tagW, tagH);
        paperCtx.fillStyle = '#ffffff';
        paperCtx.textAlign = 'center';
        paperCtx.textBaseline = 'middle';
        paperCtx.fillText(tagText, tagX + tagW / 2, tagY + tagH / 2);

        paperCtx.restore();
    }

    // Helper: Corner handles coordinates
    function getHandleCoordinates(px, py, pw, ph) {
        return {
            tl: { x: px, y: py },
            tr: { x: px + pw, y: py },
            br: { x: px + pw, y: py + ph },
            bl: { x: px, y: py + ph }
        };
    }

    // Render Guidelines
    function renderGuidelines() {
        if (!showGuidelines || guidelines.length === 0) return;

        const dims = getPaperDimensions();
        const maxW = mmToPixel(dims.w);
        const maxH = mmToPixel(dims.h);

        paperCtx.save();
        paperCtx.lineWidth = 1;
        paperCtx.setLineDash([4, 4]);

        for (const g of guidelines) {
            paperCtx.strokeStyle = g.color || '#0078d7';
            paperCtx.beginPath();
            if (g.type === 'v') {
                const px = Math.round(mmToPixel(g.pos)) + 0.5;
                paperCtx.moveTo(px, 0);
                paperCtx.lineTo(px, maxH);
            } else if (g.type === 'h') {
                const py = Math.round(mmToPixel(g.pos)) + 0.5;
                paperCtx.moveTo(0, py);
                paperCtx.lineTo(maxW, py);
            }
            paperCtx.stroke();
        }

        paperCtx.restore();
    }

    // Render Rulers (top horizontal and left vertical)
    function renderRulers() {
        const dims = getPaperDimensions();

        // Calculate offset of paper canvas relative to ruler wrappers
        const paperRect = paperCanvas.getBoundingClientRect();
        const rHRect = rulerHWrapper.getBoundingClientRect();
        const rVRect = rulerVWrapper.getBoundingClientRect();

        const paperOffsetLeft = paperRect.left - rHRect.left;
        const paperOffsetTop = paperRect.top - rVRect.top;

        // 1. Horizontal Ruler
        const rHW = rulerHCanvas.width / (window.devicePixelRatio || 1);
        const rHH = rulerHCanvas.height / (window.devicePixelRatio || 1);
        rulerHCtx.clearRect(0, 0, rHW, rHH);

        rulerHCtx.fillStyle = '#f5f5f5';
        rulerHCtx.fillRect(0, 0, rHW, rHH);

        rulerHCtx.fillStyle = '#333333';
        rulerHCtx.strokeStyle = '#888888';
        rulerHCtx.font = '9px Tahoma, sans-serif';
        rulerHCtx.textAlign = 'center';
        rulerHCtx.textBaseline = 'top';

        // Ruler ticks along paper width
        for (let mm = 0; mm <= dims.w; mm += 1) {
            const screenX = paperOffsetLeft + mmToPixel(mm);
            if (screenX < -20 || screenX > rHW + 20) continue;

            const isMajor = mm % 10 === 0;
            const isMedium = mm % 5 === 0;

            if (isMajor) {
                rulerHCtx.beginPath();
                rulerHCtx.moveTo(screenX, rHH - 12);
                rulerHCtx.lineTo(screenX, rHH);
                rulerHCtx.stroke();

                const cm = mm / 10;
                rulerHCtx.fillText(cm.toString(), screenX, 3);
            } else if (isMedium) {
                rulerHCtx.beginPath();
                rulerHCtx.moveTo(screenX, rHH - 7);
                rulerHCtx.lineTo(screenX, rHH);
                rulerHCtx.stroke();
            } else if (scale >= 1.2) {
                // Minor 1mm ticks if zoomed in
                rulerHCtx.beginPath();
                rulerHCtx.moveTo(screenX, rHH - 4);
                rulerHCtx.lineTo(screenX, rHH);
                rulerHCtx.stroke();
            }
        }

        // 2. Vertical Ruler
        const rVW = rulerVCanvas.width / (window.devicePixelRatio || 1);
        const rVH = rulerVCanvas.height / (window.devicePixelRatio || 1);
        rulerVCtx.clearRect(0, 0, rVW, rVH);

        rulerVCtx.fillStyle = '#f5f5f5';
        rulerVCtx.fillRect(0, 0, rVW, rVH);

        rulerVCtx.fillStyle = '#333333';
        rulerVCtx.strokeStyle = '#888888';
        rulerVCtx.font = '9px Tahoma, sans-serif';
        rulerVCtx.textAlign = 'right';
        rulerVCtx.textBaseline = 'middle';

        for (let mm = 0; mm <= dims.h; mm += 1) {
            const screenY = paperOffsetTop + mmToPixel(mm);
            if (screenY < -20 || screenY > rVH + 20) continue;

            const isMajor = mm % 10 === 0;
            const isMedium = mm % 5 === 0;

            if (isMajor) {
                rulerVCtx.beginPath();
                rulerVCtx.moveTo(rVW - 12, screenY);
                rulerVCtx.lineTo(rVW, screenY);
                rulerVCtx.stroke();

                const cm = mm / 10;
                rulerVCtx.fillText(cm.toString(), rVW - 13, screenY);
            } else if (isMedium) {
                rulerVCtx.beginPath();
                rulerVCtx.moveTo(rVW - 7, screenY);
                rulerVCtx.lineTo(rVW, screenY);
                rulerVCtx.stroke();
            } else if (scale >= 1.2) {
                // Minor 1mm ticks
                rulerVCtx.beginPath();
                rulerVCtx.moveTo(rVW - 4, screenY);
                rulerVCtx.lineTo(rVW, screenY);
                rulerVCtx.stroke();
            }
        }
    }

    // Image Management
    function addImage(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const dims = getPaperDimensions();
                const naturalW = img.naturalWidth || img.width;
                const naturalH = img.naturalHeight || img.height;
                const aspect = naturalW / naturalH;

                // Initial size: fit image to max 50% of paper width, maintaining aspect ratio
                let initW = (dims.w - MARGIN * 2) * 0.5;
                let initH = initW / aspect;

                // Check if height exceeds 50% of paper height
                const maxH = (dims.h - MARGIN * 2) * 0.5;
                if (initH > maxH) {
                    initH = maxH;
                    initW = initH * aspect;
                }

                // Initial position: center-ish or cascaded
                const offset = (images.length % 5) * 8;
                let initX = MARGIN + offset;
                let initY = MARGIN + offset;

                if (initX + initW > dims.w - MARGIN) initX = MARGIN;
                if (initY + initH > dims.h - MARGIN) initY = MARGIN;

                const imageItem = {
                    id: 'img_' + (nextImageId++),
                    img: img,
                    originalImg: img,
                    name: file.name || `تصویر ${images.length + 1}`,
                    x: Math.round(initX * 10) / 10,
                    y: Math.round(initY * 10) / 10,
                    width: Math.round(initW * 10) / 10,
                    height: Math.round(initH * 10) / 10,
                    naturalWidth: naturalW,
                    naturalHeight: naturalH
                };

                images.push(imageItem);
                selectedImageId = imageItem.id;

                updateImageList();
                render();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function removeImage(id) {
        images = images.filter(img => img.id !== id);
        if (selectedImageId === id) {
            selectedImageId = images.length > 0 ? images[images.length - 1].id : null;
        }
        updateImageList();
        render();
    }

    function updateImageList() {
        if (images.length === 0) {
            imageListEmpty.style.display = 'block';
            imageListContainer.innerHTML = '';
            imageListContainer.appendChild(imageListEmpty);
            return;
        }

        imageListEmpty.style.display = 'none';
        imageListContainer.innerHTML = '';

        images.forEach(item => {
            const row = document.createElement('div');
            row.className = `image-item ${item.id === selectedImageId ? 'active' : ''}`;
            row.dataset.id = item.id;

            const thumb = document.createElement('img');
            thumb.className = 'image-item-thumb';
            thumb.src = item.img.src;

            const info = document.createElement('div');
            info.className = 'image-item-info';

            const title = document.createElement('span');
            title.className = 'image-item-title';
            title.textContent = item.name;

            const dims = document.createElement('span');
            dims.className = 'image-item-dims';
            dims.textContent = `${(item.width / 10).toFixed(1)} × ${(item.height / 10).toFixed(1)} cm`;

            info.appendChild(title);
            info.appendChild(dims);

            const actions = document.createElement('div');
            actions.className = 'image-item-actions';

            const delBtn = document.createElement('button');
            delBtn.className = 'image-item-delete';
            delBtn.title = 'حذف تصویر';
            delBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeImage(item.id);
            });

            actions.appendChild(delBtn);

            row.appendChild(thumb);
            row.appendChild(info);
            row.appendChild(actions);

            row.addEventListener('click', () => {
                selectedImageId = item.id;
                updateImageList();
                render();
            });

            imageListContainer.appendChild(row);
        });
        updateSelectedImageInputs();
    }

    function updateSelectedImageInputs() {
        if (!selectedImageGroup) return;
        const selected = images.find(img => img.id === selectedImageId);
        if (!selected) {
            selectedImageGroup.style.display = 'none';
            return;
        }

        selectedImageGroup.style.display = 'block';
        if (imgWidthInput && document.activeElement !== imgWidthInput) {
            imgWidthInput.value = (selected.width / 10).toFixed(1);
        }
        if (imgHeightInput && document.activeElement !== imgHeightInput) {
            imgHeightInput.value = (selected.height / 10).toFixed(1);
        }
        if (imgPosXInput && document.activeElement !== imgPosXInput) {
            imgPosXInput.value = (selected.x / 10).toFixed(1);
        }
        if (imgPosYInput && document.activeElement !== imgPosYInput) {
            imgPosYInput.value = (selected.y / 10).toFixed(1);
        }
    }

    // Hit Testing and Interaction
    function getCanvasCoordinates(e) {
        const rect = paperCanvas.getBoundingClientRect();
        const clientX = e.clientX;
        const clientY = e.clientY;

        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;

        const mmX = pixelToMm(screenX);
        const mmY = pixelToMm(screenY);

        return { screenX, screenY, mmX, mmY };
    }

    function findImageAtPoint(mmX, mmY) {
        // Iterate backwards so top-most image is selected
        for (let i = images.length - 1; i >= 0; i--) {
            const item = images[i];
            if (
                mmX >= item.x &&
                mmX <= item.x + item.width &&
                mmY >= item.y &&
                mmY <= item.y + item.height
            ) {
                return item;
            }
        }
        return null;
    }

    function findResizeHandle(img, screenX, screenY) {
        if (!img) return null;

        const px = mmToPixel(img.x);
        const py = mmToPixel(img.y);
        const pw = mmToPixel(img.width);
        const ph = mmToPixel(img.height);

        const handles = getHandleCoordinates(px, py, pw, ph);
        const hitDistance = 10; // pixels

        for (const [key, coord] of Object.entries(handles)) {
            const dx = Math.abs(screenX - coord.x);
            const dy = Math.abs(screenY - coord.y);
            if (dx <= hitDistance && dy <= hitDistance) {
                return key;
            }
        }
        return null;
    }

    function detectAlignmentGuides(movingImg) {
        const guides = [];
        let snappedX = movingImg.x;
        let snappedY = movingImg.y;
        let snappedRight = movingImg.x + movingImg.width;
        let snappedBottom = movingImg.y + movingImg.height;

        const paperDims = getPaperDimensions();

        // Targets to align against: Paper Margins & Centers, and other images
        const verticalTargets = [
            MARGIN,
            paperDims.w / 2,
            paperDims.w - MARGIN
        ];

        const horizontalTargets = [
            MARGIN,
            paperDims.h / 2,
            paperDims.h - MARGIN
        ];

        images.forEach(other => {
            if (other.id === movingImg.id) return;
            verticalTargets.push(other.x);
            verticalTargets.push(other.x + other.width / 2);
            verticalTargets.push(other.x + other.width);

            horizontalTargets.push(other.y);
            horizontalTargets.push(other.y + other.height / 2);
            horizontalTargets.push(other.y + other.height);
        });

        const movingCenterX = movingImg.x + movingImg.width / 2;
        const movingRight = movingImg.x + movingImg.width;

        // Check vertical alignments (X coordinates)
        let vSnapped = false;
        for (const target of verticalTargets) {
            // Left edge
            if (Math.abs(movingImg.x - target) <= SNAP_THRESHOLD) {
                snappedX = target;
                guides.push({ type: 'v', pos: target, color: '#0078d7' });
                vSnapped = true;
                break;
            }
            // Right edge
            if (Math.abs(movingRight - target) <= SNAP_THRESHOLD) {
                snappedX = target - movingImg.width;
                guides.push({ type: 'v', pos: target, color: '#0078d7' });
                vSnapped = true;
                break;
            }
            // Center
            if (Math.abs(movingCenterX - target) <= SNAP_THRESHOLD) {
                snappedX = target - movingImg.width / 2;
                guides.push({ type: 'v', pos: target, color: '#e81123' });
                vSnapped = true;
                break;
            }
        }

        // Check horizontal alignments (Y coordinates)
        const movingCenterY = movingImg.y + movingImg.height / 2;
        const movingBottom = movingImg.y + movingImg.height;

        for (const target of horizontalTargets) {
            // Top edge
            if (Math.abs(movingImg.y - target) <= SNAP_THRESHOLD) {
                snappedY = target;
                guides.push({ type: 'h', pos: target, color: '#0078d7' });
                break;
            }
            // Bottom edge
            if (Math.abs(movingBottom - target) <= SNAP_THRESHOLD) {
                snappedY = target - movingImg.height;
                guides.push({ type: 'h', pos: target, color: '#0078d7' });
                break;
            }
            // Center
            if (Math.abs(movingCenterY - target) <= SNAP_THRESHOLD) {
                snappedY = target - movingImg.height / 2;
                guides.push({ type: 'h', pos: target, color: '#e81123' });
                break;
            }
        }

        return { guides, snappedX, snappedY };
    }

    // Show floating size/position badge
    function showBadge(text, screenX, screenY) {
        const wrapperRect = paperCanvasWrapper.getBoundingClientRect();
        const canvasRect = paperCanvas.getBoundingClientRect();

        const badgeX = canvasRect.left - wrapperRect.left + screenX;
        const badgeY = canvasRect.top - wrapperRect.top + screenY;

        sizeBadge.style.left = badgeX + 'px';
        sizeBadge.style.top = badgeY + 'px';
        sizeBadge.textContent = text;
        sizeBadge.style.display = 'block';
    }

    function hideBadge() {
        sizeBadge.style.display = 'none';
    }

    // Mouse Event Handlers
    function handleMouseDown(e) {
        if (e.button !== 0) return; // Only left button

        const coords = getCanvasCoordinates(e);
        const selected = images.find(img => img.id === selectedImageId);

        // Check handle click on currently selected image
        if (selected) {
            const handle = findResizeHandle(selected, coords.screenX, coords.screenY);
            if (handle) {
                isResizing = true;
                resizeHandle = handle;
                resizeStart = {
                    x: selected.x,
                    y: selected.y,
                    w: selected.width,
                    h: selected.height,
                    aspect: selected.naturalWidth / selected.naturalHeight,
                    mmX: coords.mmX,
                    mmY: coords.mmY
                };
                return;
            }
        }

        // Check clicking on an image
        const clickedImg = findImageAtPoint(coords.mmX, coords.mmY);
        if (clickedImg) {
            selectedImageId = clickedImg.id;
            // Bring clicked image to front
            images = images.filter(img => img.id !== clickedImg.id).concat([clickedImg]);

            isDragging = true;
            dragOffset = {
                x: coords.mmX - clickedImg.x,
                y: coords.mmY - clickedImg.y
            };

            updateImageList();
            render();
            return;
        }

        // Clicked on blank paper canvas: deselect
        selectedImageId = null;
        updateImageList();
        render();
    }

    function handleMouseMove(e) {
        const coords = getCanvasCoordinates(e);

        // Update cursor position display in toolbar (in cm)
        const cmX = (coords.mmX / 10).toFixed(1);
        const cmY = (coords.mmY / 10).toFixed(1);
        cursorPosLabel.textContent = `موقعیت: ${cmX}, ${cmY} سانتی‌متر`;

        const selected = images.find(img => img.id === selectedImageId);

        // If dragging an image
        if (isDragging && selected) {
            const paperDims = getPaperDimensions();
            let newX = coords.mmX - dragOffset.x;
            let newY = coords.mmY - dragOffset.y;

            // Grid snap if enabled
            if (showGrid) {
                newX = Math.round(newX / GRID_MINOR) * GRID_MINOR;
                newY = Math.round(newY / GRID_MINOR) * GRID_MINOR;
            }

            // Magnetic Alignment Guidelines snap if enabled
            if (showGuidelines) {
                const align = detectAlignmentGuides({
                    ...selected,
                    x: newX,
                    y: newY
                });
                guidelines = align.guides;
                newX = align.snappedX;
                newY = align.snappedY;
            } else {
                guidelines = [];
            }

            // Allow overhang past paper boundaries (keep at least 10mm on paper so it is not lost)
            const minVisible = 10; // mm
            newX = Math.max(-selected.width + minVisible, Math.min(paperDims.w - minVisible, newX));
            newY = Math.max(-selected.height + minVisible, Math.min(paperDims.h - minVisible, newY));

            selected.x = Math.round(newX * 10) / 10;
            selected.y = Math.round(newY * 10) / 10;
            updateSelectedImageInputs();

            showBadge(
                `X: ${(selected.x / 10).toFixed(1)} cm | Y: ${(selected.y / 10).toFixed(1)} cm`,
                mmToPixel(selected.x + selected.width / 2),
                mmToPixel(selected.y)
            );

            render();
            return;
        }

        // If resizing an image
        if (isResizing && selected) {
            const deltaX = coords.mmX - resizeStart.mmX;
            const deltaY = coords.mmY - resizeStart.mmY;
            const aspect = resizeStart.aspect;
            const keepAspect = !e.shiftKey; // Default keep aspect ratio unless Shift is pressed

            let newX = resizeStart.x;
            let newY = resizeStart.y;
            let newW = resizeStart.w;
            let newH = resizeStart.h;

            const minSize = 10; // 10mm minimum

            if (resizeHandle === 'br') {
                newW = Math.max(minSize, resizeStart.w + deltaX);
                newH = keepAspect ? newW / aspect : Math.max(minSize, resizeStart.h + deltaY);
            } else if (resizeHandle === 'bl') {
                newW = Math.max(minSize, resizeStart.w - deltaX);
                newX = resizeStart.x + (resizeStart.w - newW);
                newH = keepAspect ? newW / aspect : Math.max(minSize, resizeStart.h + deltaY);
            } else if (resizeHandle === 'tr') {
                newW = Math.max(minSize, resizeStart.w + deltaX);
                newH = keepAspect ? newW / aspect : Math.max(minSize, resizeStart.h - deltaY);
                newY = resizeStart.y + (resizeStart.h - newH);
            } else if (resizeHandle === 'tl') {
                newW = Math.max(minSize, resizeStart.w - deltaX);
                newX = resizeStart.x + (resizeStart.w - newW);
                newH = keepAspect ? newW / aspect : Math.max(minSize, resizeStart.h - deltaY);
                newY = resizeStart.y + (resizeStart.h - newH);
            }

            // Grid snap for width/height
            if (showGrid) {
                newW = Math.round(newW / GRID_MINOR) * GRID_MINOR;
                newH = Math.round(newH / GRID_MINOR) * GRID_MINOR;
            }

            selected.x = Math.round(newX * 10) / 10;
            selected.y = Math.round(newY * 10) / 10;
            selected.width = Math.round(newW * 10) / 10;
            selected.height = Math.round(newH * 10) / 10;

            showBadge(
                `${(selected.width / 10).toFixed(1)} × ${(selected.height / 10).toFixed(1)} cm`,
                mmToPixel(selected.x + selected.width / 2),
                mmToPixel(selected.y)
            );

            render();
            return;
        }

        // Cursor style update when hovering
        if (selected) {
            const handle = findResizeHandle(selected, coords.screenX, coords.screenY);
            if (handle) {
                if (handle === 'tl' || handle === 'br') paperCanvas.style.cursor = 'nwse-resize';
                else if (handle === 'tr' || handle === 'bl') paperCanvas.style.cursor = 'nesw-resize';
                return;
            }
        }

        const hoveredImg = findImageAtPoint(coords.mmX, coords.mmY);
        if (hoveredImg) {
            paperCanvas.style.cursor = 'move';
        } else {
            paperCanvas.style.cursor = 'default';
        }
    }

    function handleMouseUp() {
        if (isDragging || isResizing) {
            isDragging = false;
            isResizing = false;
            resizeHandle = null;
            guidelines = [];
            hideBadge();
            updateImageList();
            render();
        }
    }

    // Mouse wheel zoom
    function handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        const newScale = Math.min(3.0, Math.max(0.5, scale + delta));
        if (newScale !== scale) {
            scale = newScale;
            resizeCanvases();
            render();
        }
    }

    // Auto-Layout Algorithm
    function autoLayout() {
        if (images.length === 0) return;

        const dims = getPaperDimensions();
        const gap = 5; // 5mm gap between images
        const availWidth = dims.w - MARGIN * 2;
        const availHeight = dims.h - MARGIN * 2;

        // Sort images by natural height descending (tallest first)
        const sorted = [...images].sort((a, b) => b.naturalHeight - a.naturalHeight);

        // Check if images are too large to fit in rows; scale if needed
        let maxRowW = availWidth * 0.45;
        sorted.forEach(item => {
            const aspect = item.naturalWidth / item.naturalHeight;
            let targetW = Math.min(maxRowW, item.width);
            let targetH = targetW / aspect;
            item.width = Math.round(targetW * 10) / 10;
            item.height = Math.round(targetH * 10) / 10;
        });

        let curX = MARGIN;
        let curY = MARGIN;
        let rowHeight = 0;

        for (const item of sorted) {
            // If doesn't fit on current row horizontally, start a new row
            if (curX + item.width > dims.w - MARGIN && curX > MARGIN) {
                curX = MARGIN;
                curY += rowHeight + gap;
                rowHeight = 0;
            }

            // Check if it fits on page vertically
            if (curY + item.height > dims.h - MARGIN) {
                // Scale down slightly to fit on page
                const overflowFactor = (dims.h - MARGIN - curY) / item.height;
                if (overflowFactor > 0.4) {
                    const aspect = item.naturalWidth / item.naturalHeight;
                    item.height = Math.max(15, (dims.h - MARGIN - curY));
                    item.width = item.height * aspect;
                }
            }

            item.x = Math.round(curX * 10) / 10;
            item.y = Math.round(curY * 10) / 10;

            curX += item.width + gap;
            rowHeight = Math.max(rowHeight, item.height);
        }

        updateImageList();
        render();
    }

    // PDF Export
    async function exportPDF() {
        if (images.length === 0) {
            alert('لطفاً ابتدا حداقل یک تصویر به صفحه اضافه کنید.');
            return;
        }

        const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
        if (!jsPDF) {
            alert('کتابخانه ساخت PDF بارگذاری نشده است.');
            return;
        }

        exportPdfBtn.disabled = true;
        const originalText = exportPdfBtn.innerHTML;
        exportPdfBtn.innerHTML = 'در حال ساخت فایل...';

        try {
            const dims = getPaperDimensions();
            const doc = new jsPDF({
                orientation: orientation,
                unit: 'mm',
                format: [dims.w, dims.h]
            });

            for (const item of images) {
                // Calculate visible intersection with paper boundaries
                const visX = Math.max(0, item.x);
                const visY = Math.max(0, item.y);
                const visRight = Math.min(dims.w, item.x + item.width);
                const visBottom = Math.min(dims.h, item.y + item.height);
                const visW = visRight - visX;
                const visH = visBottom - visY;

                if (visW <= 0.1 || visH <= 0.1) continue; // Completely outside paper

                // If fully inside paper bounds
                if (item.x >= 0 && item.y >= 0 && item.x + item.width <= dims.w && item.y + item.height <= dims.h) {
                    let dataUrl;
                    if (item.img.src && item.img.src.startsWith('data:image/png')) {
                        dataUrl = item.img.src;
                    } else {
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = item.naturalWidth;
                        tempCanvas.height = item.naturalHeight;
                        const tempCtx = tempCanvas.getContext('2d');
                        tempCtx.drawImage(item.img, 0, 0);
                        dataUrl = tempCanvas.toDataURL('image/png');
                    }
                    const isPng = dataUrl.startsWith('data:image/png');
                    doc.addImage(
                        dataUrl,
                        isPng ? 'PNG' : 'JPEG',
                        item.x,
                        item.y,
                        item.width,
                        item.height,
                        undefined,
                        'FAST'
                    );
                } else {
                    // Partially outside paper: crop only the visible slice inside the paper
                    const scaleX = item.naturalWidth / item.width;
                    const scaleY = item.naturalHeight / item.height;

                    const sx = Math.max(0, Math.round((visX - item.x) * scaleX));
                    const sy = Math.max(0, Math.round((visY - item.y) * scaleY));
                    const sw = Math.min(item.naturalWidth - sx, Math.round(visW * scaleX));
                    const sh = Math.min(item.naturalHeight - sy, Math.round(visH * scaleY));

                    if (sw <= 0 || sh <= 0) continue;

                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = sw;
                    cropCanvas.height = sh;
                    const cropCtx = cropCanvas.getContext('2d');
                    cropCtx.drawImage(item.img, sx, sy, sw, sh, 0, 0, sw, sh);

                    const croppedDataUrl = cropCanvas.toDataURL('image/png');
                    doc.addImage(
                        croppedDataUrl,
                        'PNG',
                        visX,
                        visY,
                        visW,
                        visH,
                        undefined,
                        'FAST'
                    );
                }
            }

            const fileName = `layout_${paperSize}_${orientation}_${new Date().toISOString().slice(0, 10)}.pdf`;
            doc.save(fileName);
        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('خطایی در هنگام ایجاد فایل PDF رخ داد: ' + err.message);
        } finally {
            exportPdfBtn.disabled = false;
            exportPdfBtn.innerHTML = originalText;
        }
    }

    // Event Listeners
    paperSizeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            paperSize = e.target.value;
            updateBaseScale();
            resizeCanvases();
            render();
        });
    });

    orientationRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            orientation = e.target.value;
            updateBaseScale();
            resizeCanvases();
            render();
        });
    });

    toggleGridCheckbox.addEventListener('change', (e) => {
        showGrid = e.target.checked;
        render();
    });

    toggleGuidelinesCheckbox.addEventListener('change', (e) => {
        showGuidelines = e.target.checked;
        render();
    });

    // File Input
    addImageBtn.addEventListener('click', () => {
        imageFileInput.click();
    });

    imageFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => addImage(file));
        imageFileInput.value = '';
    });

    // Auto Layout and Export buttons
    autoLayoutBtn.addEventListener('click', autoLayout);
    exportPdfBtn.addEventListener('click', exportPDF);

    clearAllBtn.addEventListener('click', () => {
        if (images.length === 0) return;
        if (confirm('آیا از حذف تمام تصاویر مطمئن هستید؟')) {
            images = [];
            selectedImageId = null;
            updateImageList();
            render();
        }
    });

    // Zoom buttons
    zoomInBtn.addEventListener('click', () => {
        scale = Math.min(3.0, scale + 0.15);
        resizeCanvases();
        render();
    });

    zoomOutBtn.addEventListener('click', () => {
        scale = Math.max(0.5, scale - 0.15);
        resizeCanvases();
        render();
    });

    zoomFitBtn.addEventListener('click', () => {
        scale = 1.0;
        updateBaseScale();
        resizeCanvases();
        render();
    });

    // Canvas Events
    paperCanvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    paperCanvasWrapper.addEventListener('wheel', handleWheel, { passive: false });

    // Keyboard Shortcuts (Delete, Arrow Keys)
    window.addEventListener('keydown', (e) => {
        if (!selectedImageId) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Ignore if active element is an input
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
            e.preventDefault();
            removeImage(selectedImageId);
            return;
        }

        const selected = images.find(img => img.id === selectedImageId);
        if (!selected) return;

        const step = e.shiftKey ? 5 : 1; // 5mm with Shift, 1mm without
        const paperDims = getPaperDimensions();

        const minVisible = 10;
        if (e.key === 'ArrowLeft') {
            selected.x = Math.max(-selected.width + minVisible, selected.x - step);
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            selected.x = Math.min(paperDims.w - minVisible, selected.x + step);
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            selected.y = Math.max(-selected.height + minVisible, selected.y - step);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            selected.y = Math.min(paperDims.h - minVisible, selected.y + step);
            e.preventDefault();
        }

        selected.x = Math.round(selected.x * 10) / 10;
        selected.y = Math.round(selected.y * 10) / 10;
        updateSelectedImageInputs();
        render();
    });

    // Window resize observer to keep canvas centered and responsive
    window.addEventListener('resize', () => {
        updateBaseScale();
        resizeCanvases();
        render();
    });

    // --- Selected Image Controls Event Listeners ---
    if (imgWidthInput) {
        imgWidthInput.addEventListener('input', () => {
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected) return;
            const cm = parseFloat(imgWidthInput.value);
            if (isNaN(cm) || cm <= 0) return;
            const newW = cm * 10;
            const aspect = selected.naturalWidth / selected.naturalHeight;
            selected.width = Math.round(newW * 10) / 10;
            if (lockAspectRatioCheckbox && lockAspectRatioCheckbox.checked) {
                selected.height = Math.round((newW / aspect) * 10) / 10;
                if (imgHeightInput) imgHeightInput.value = (selected.height / 10).toFixed(1);
            }
            updateImageList();
            render();
        });
    }

    if (imgHeightInput) {
        imgHeightInput.addEventListener('input', () => {
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected) return;
            const cm = parseFloat(imgHeightInput.value);
            if (isNaN(cm) || cm <= 0) return;
            const newH = cm * 10;
            const aspect = selected.naturalWidth / selected.naturalHeight;
            selected.height = Math.round(newH * 10) / 10;
            if (lockAspectRatioCheckbox && lockAspectRatioCheckbox.checked) {
                selected.width = Math.round((newH * aspect) * 10) / 10;
                if (imgWidthInput) imgWidthInput.value = (selected.width / 10).toFixed(1);
            }
            updateImageList();
            render();
        });
    }

    if (matchHeightBtn) {
        matchHeightBtn.addEventListener('click', () => {
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected) return;
            const other = images.find(img => img.id !== selectedImageId);
            if (!other) {
                alert('تصویر دیگری برای برابر کردن اندازه وجود ندارد.');
                return;
            }
            const aspect = selected.naturalWidth / selected.naturalHeight;
            selected.height = other.height;
            if (lockAspectRatioCheckbox && lockAspectRatioCheckbox.checked) {
                selected.width = Math.round((selected.height * aspect) * 10) / 10;
            }
            updateSelectedImageInputs();
            updateImageList();
            render();
        });
    }

    if (matchWidthBtn) {
        matchWidthBtn.addEventListener('click', () => {
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected) return;
            const other = images.find(img => img.id !== selectedImageId);
            if (!other) {
                alert('تصویر دیگری برای برابر کردن اندازه وجود ندارد.');
                return;
            }
            const aspect = selected.naturalWidth / selected.naturalHeight;
            selected.width = other.width;
            if (lockAspectRatioCheckbox && lockAspectRatioCheckbox.checked) {
                selected.height = Math.round((selected.width / aspect) * 10) / 10;
            }
            updateSelectedImageInputs();
            updateImageList();
            render();
        });
    }

    if (rotateImageBtn) {
        rotateImageBtn.addEventListener('click', () => {
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected) return;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = selected.naturalHeight;
            tempCanvas.height = selected.naturalWidth;
            const ctx = tempCanvas.getContext('2d');
            ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
            ctx.rotate(90 * Math.PI / 180);
            ctx.drawImage(selected.img, -selected.naturalWidth / 2, -selected.naturalHeight / 2);

            const newImg = new Image();
            newImg.onload = () => {
                selected.img = newImg;
                selected.naturalWidth = tempCanvas.width;
                selected.naturalHeight = tempCanvas.height;
                const oldW = selected.width;
                selected.width = selected.height;
                selected.height = oldW;
                updateSelectedImageInputs();
                updateImageList();
                render();
            };
            newImg.src = tempCanvas.toDataURL('image/png');
        });
    }

    if (bringToFrontBtn) {
        bringToFrontBtn.addEventListener('click', () => {
            if (!selectedImageId) return;
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected) return;
            images = images.filter(img => img.id !== selectedImageId).concat([selected]);
            updateImageList();
            render();
        });
    }

    if (sendToBackBtn) {
        sendToBackBtn.addEventListener('click', () => {
            if (!selectedImageId) return;
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected) return;
            images = [selected].concat(images.filter(img => img.id !== selectedImageId));
            updateImageList();
            render();
        });
    }

    if (composerRemoveBgBtn) {
        let isRemovingBg = false;
        composerRemoveBgBtn.addEventListener('click', async () => {
            const selected = images.find(img => img.id === selectedImageId);
            if (!selected || isRemovingBg) return;

            if (composerToleranceContainer && composerToleranceContainer.style.display === 'none') {
                composerToleranceContainer.style.display = 'block';
            }

            if (!window.DocProcessor || !window.DocProcessor.removeBackground) {
                alert('الگوریتم حذف پس‌زمینه بارگذاری نشده است.');
                return;
            }

            const origText = composerRemoveBgBtn.innerHTML;
            composerRemoveBgBtn.innerHTML = '⏳ در حال حذف...';
            composerRemoveBgBtn.disabled = true;
            isRemovingBg = true;

            try {
                const tol = parseInt(composerBgTol ? composerBgTol.value : 30) || 30;
                const resCanvas = await window.DocProcessor.removeBackground(selected.img, tol, 3);
                const pngUrl = resCanvas.toDataURL('image/png');

                const newImg = new Image();
                newImg.onload = () => {
                    selected.img = newImg;
                    updateImageList();
                    render();
                };
                newImg.src = pngUrl;
            } catch (err) {
                console.error('BG removal error:', err);
                alert('خطا در حذف پس‌زمینه: ' + (err.message || err));
            } finally {
                isRemovingBg = false;
                composerRemoveBgBtn.innerHTML = origText;
                composerRemoveBgBtn.disabled = false;
            }
        });
    }

    if (composerBgTol) {
        composerBgTol.addEventListener('input', () => {
            if (composerBgTolVal) composerBgTolVal.textContent = composerBgTol.value;
        });
    }

    // --- Drag and Drop files onto canvas ---
    ['dragenter', 'dragover'].forEach(evt => {
        paperCanvasWrapper.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            paperCanvasWrapper.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        paperCanvasWrapper.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
            paperCanvasWrapper.classList.remove('drag-over');
        });
    });

    paperCanvasWrapper.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files) {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            files.forEach(f => addImage(f));
        }
    });

    // --- Check for imported images from main scanner ---
    function checkImportedImages() {
        try {
            const raw = localStorage.getItem('composer_import_image');
            if (raw) {
                localStorage.removeItem('composer_import_image');
                const parsed = JSON.parse(raw);
                if (parsed && parsed.dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        const dims = getPaperDimensions();
                        const naturalW = img.naturalWidth || img.width;
                        const naturalH = img.naturalHeight || img.height;
                        const aspect = naturalW / naturalH;
                        let initW = (dims.w - MARGIN * 2) * 0.5;
                        let initH = initW / aspect;

                        const item = {
                            id: 'img_' + (nextImageId++),
                            img: img,
                            name: parsed.name || 'تصویر اسکن شده',
                            x: MARGIN,
                            y: MARGIN,
                            width: Math.round(initW * 10) / 10,
                            height: Math.round(initH * 10) / 10,
                            naturalWidth: naturalW,
                            naturalHeight: naturalH
                        };
                        images.push(item);
                        selectedImageId = item.id;
                        updateImageList();
                        render();
                    };
                    img.src = parsed.dataUrl;
                }
            }
        } catch (e) {
            console.error('Import error:', e);
        }
    }

    // Initialize Layout
    updateBaseScale();
    resizeCanvases();
    render();
    checkImportedImages();
});
