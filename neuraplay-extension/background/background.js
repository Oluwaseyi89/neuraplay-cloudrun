chrome.runtime.onInstalled.addListener(() => {
    console.log('NeuraPlay extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeGameStats') {
        fetch('https://neuraplay-service-930102180917.us-central1.run.app/api/analyze/browser-stats/', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(request.data)
        })
        .then(response => response.json())
        .then(analysis => sendResponse({success: true, analysis}))
        .catch(error => sendResponse({success: false, error: error.message}));
        
        return true; 
    }
});