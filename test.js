const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const appCode = fs.readFileSync('app.js', 'utf8');
try {
    dom.window.eval(appCode);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    console.log("No syntax or immediate runtime errors.");
} catch (e) {
    console.error(e);
}
