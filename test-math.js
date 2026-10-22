const zoomScale = 3.9;
const rect = { left: -481.25, top: -725, width: 1462.5, height: 1950 };
const svgRect = { left: -725, top: -725, width: 1950, height: 1950 };
const cw = 3000, ch = 4000;
const rectWidth = rect.width / zoomScale;
const rectHeight = rect.height / zoomScale;
const canvasRatio = cw / ch;
const rectRatio = rectWidth / rectHeight;
let drawWidth, drawHeight, offsetX, offsetY;
if (canvasRatio > rectRatio) {
    drawWidth = rectWidth;
    drawHeight = rectWidth / canvasRatio;
    offsetX = 0;
    offsetY = (rectHeight - drawHeight) / 2;
} else {
    drawHeight = rectHeight;
    drawWidth = rectHeight * canvasRatio;
    offsetX = (rectWidth - drawWidth) / 2;
    offsetY = 0;
}
const canvasOffsetX = (rect.left - svgRect.left) / zoomScale;
const canvasOffsetY = (rect.top - svgRect.top) / zoomScale;

function getPoint(imgX, imgY) {
    const svgX = canvasOffsetX + offsetX + (imgX / cw) * drawWidth;
    const svgY = canvasOffsetY + offsetY + (imgY / ch) * drawHeight;
    return {x: svgX, y: svgY};
}

console.log("Point 0,0:", getPoint(0,0));
console.log("Point 3000,4000:", getPoint(3000,4000));
console.log("Point 300,400 (10%):", getPoint(300, 400));
