const zoomScale = 3.9;
// Using container dimensions instead of getBoundingClientRect
const container = { clientWidth: 500, clientHeight: 500 };
const canvasRect = { width: 1462.5, height: 1950 }; // scaled rect
const rectWidth = canvasRect.width / zoomScale; // 375
const rectHeight = canvasRect.height / zoomScale; // 500

const canvasOffsetX = (container.clientWidth - rectWidth) / 2;
const canvasOffsetY = (container.clientHeight - rectHeight) / 2;

const cw = 3000, ch = 4000;
const drawWidth = rectWidth;
const drawHeight = rectHeight;

function getPoint(imgX, imgY) {
    const svgX = canvasOffsetX + (imgX / cw) * drawWidth;
    const svgY = canvasOffsetY + (imgY / ch) * drawHeight;
    return {x: svgX, y: svgY};
}

console.log("Point 0,0:", getPoint(0,0));
console.log("Point 3000,4000:", getPoint(3000,4000));
console.log("Point 300,400 (10%):", getPoint(300, 400));
