// Background service worker for extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('NeuraPlay extension installed');
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeGameStats') {
        // Handle analysis requests
        fetch('http://localhost:8000/api/analyze/browser-stats/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(request.data)
        })
        .then(response => response.json())
        .then(analysis => sendResponse({success: true, analysis}))
        .catch(error => sendResponse({success: false, error: error.message}));
        
        return true; // Keep message channel open for async response
    }
});