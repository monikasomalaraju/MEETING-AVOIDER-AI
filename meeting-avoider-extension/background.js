// Minimal Manifest V3 service worker.
// Currently only used to open the web app once on first install, so new
// users land somewhere useful instead of a blank popup with no context.

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: "http://127.0.0.1:8000/login.html" });
    }
});
