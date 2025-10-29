// popup/popup.js
class NeuraPlayPopup {
    constructor() {
        this.initializePopup();
        this.checkCurrentPage();
    }

    initializePopup() {
        // Add event listeners
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeCurrentPage());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        
        // Load recent analysis from storage
        this.loadRecentAnalysis();
    }

    async checkCurrentPage() {
        const statusElement = document.getElementById('status');
        
        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (this.isSupportedSite(tab.url)) {
                const game = this.detectGameFromUrl(tab.url);
                statusElement.innerHTML = `
                    <p>✅ Ready to analyze <strong>${game.toUpperCase()}</strong> data</p>
                    <p class="game-info">
                        <span class="game-icon">🎮</span>
                        Currently on: ${new URL(tab.url).hostname}
                    </p>
                `;
                statusElement.className = 'status success';
            } else {
                statusElement.innerHTML = `
                    <p>🌐 Visit a supported gaming site:</p>
                    <ul style="margin: 8px 0; padding-left: 16px; font-size: 12px;">
                        <li>OP.GG (League of Legends)</li>
                        <li>U.GG (League of Legends)</li>
                        <li>Futbin (FIFA)</li>
                    </ul>
                `;
                statusElement.className = 'status';
                document.getElementById('analyzeBtn').disabled = true;
            }
        } catch (error) {
            statusElement.innerHTML = `<p>❌ Error checking page: ${error.message}</p>`;
            statusElement.className = 'status error';
        }
    }

    isSupportedSite(url) {
        const supportedDomains = [
            'op.gg',
            'www.ug.gg',
            'futbin.com',
            'www.futbin.com'
        ];
        
        try {
            const domain = new URL(url).hostname;
            return supportedDomains.some(supported => domain.includes(supported));
        } catch {
            return false;
        }
    }

    detectGameFromUrl(url) {
        if (url.includes('op.gg') || url.includes('ug.gg')) {
            return 'lol';
        } else if (url.includes('futbin.com')) {
            return 'fifa';
        }
        return 'unknown';
    }

    async analyzeCurrentPage() {
        const analyzeBtn = document.getElementById('analyzeBtn');
        const statusElement = document.getElementById('status');
        
        // Show loading state
        analyzeBtn.innerHTML = '<span class="loading"></span>Analyzing...';
        analyzeBtn.disabled = true;
        statusElement.innerHTML = '<p>🔍 Scanning page for game data...</p>';
        statusElement.className = 'status scanning';

        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Send message to content script to trigger analysis
            const response = await chrome.tabs.sendMessage(tab.id, { 
                action: 'manualAnalyze' 
            });

            if (response && response.success) {
                statusElement.innerHTML = `
                    <p>✅ Analysis complete!</p>
                    <p style="font-size: 12px; opacity: 0.8;">Check the overlay on the page for detailed results.</p>
                `;
                statusElement.className = 'status success';
                
                // Save to recent analysis
                this.saveRecentAnalysis(response.analysis);
                
                // Auto-close popup after successful analysis (better UX)
                setTimeout(() => {
                    window.close();
                }, 1500);
                
            } else {
                throw new Error('No game data found on this page');
            }

        } catch (error) {
            console.error('Analysis error:', error);
            
            // More specific error messages
            let errorMessage = error.message;
            if (error.message.includes('Could not establish connection')) {
                errorMessage = 'Content script not loaded. Please refresh the page and try again.';
            } else if (error.message.includes('No game data found')) {
                errorMessage = 'No game stats detected on this page. Try a match history page.';
            }
            
            statusElement.innerHTML = `
                <p>❌ Analysis failed</p>
                <p style="font-size: 12px; opacity: 0.8;">${errorMessage}</p>
            `;
            statusElement.className = 'status error';
        } finally {
            // Reset button
            analyzeBtn.innerHTML = 'Analyze Current Page';
            analyzeBtn.disabled = false;
        }
    }

    saveRecentAnalysis(analysis) {
        const analysisData = {
            summary: analysis.summary,
            topTips: analysis.topTips,
            rating: analysis.rating,
            confidence: analysis.confidence,
            timestamp: new Date().toISOString(),
            game: analysis.game || 'unknown'
        };

        // Save to chrome storage
        chrome.storage.local.set({ 
            recentAnalysis: analysisData 
        }, () => {
            this.loadRecentAnalysis();
        });
    }

    loadRecentAnalysis() {
        chrome.storage.local.get(['recentAnalysis'], (result) => {
            const recentAnalysis = result.recentAnalysis;
            const container = document.getElementById('recentAnalysis');
            const resultElement = document.getElementById('analysisResult');

            if (recentAnalysis) {
                container.style.display = 'block';
                
                const timeAgo = this.getTimeAgo(new Date(recentAnalysis.timestamp));
                const gameIcon = recentAnalysis.game === 'lol' ? '⚔️' : '⚽';
                const gameName = recentAnalysis.game === 'lol' ? 'League of Legends' : 'FIFA';
                
                resultElement.innerHTML = `
                    <div class="analysis-preview">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 16px; margin-right: 8px;">${gameIcon}</span>
                            <span style="font-size: 11px; opacity: 0.7;">${gameName}</span>
                        </div>
                        <div class="summary" style="margin-bottom: 8px; font-size: 13px; line-height: 1.4;">
                            ${recentAnalysis.summary}
                        </div>
                        ${recentAnalysis.rating ? `
                            <div class="rating" style="color: #f59e0b; font-weight: 600; margin-bottom: 8px;">
                                Performance Rating: ${recentAnalysis.rating}/10
                            </div>
                        ` : ''}
                        ${recentAnalysis.topTips && recentAnalysis.topTips.length > 0 ? `
                            <div class="tips" style="border-top: 1px solid #374151; padding-top: 8px;">
                                <strong style="font-size: 12px;">Key Recommendations:</strong>
                                <ul style="margin: 4px 0; padding-left: 16px; font-size: 11px;">
                                    ${recentAnalysis.topTips.slice(0, 2).map(tip => 
                                        `<li style="margin: 2px 0;">${tip}</li>`
                                    ).join('')}
                                </ul>
                            </div>
                        ` : ''}
                        <div style="font-size: 10px; opacity: 0.5; margin-top: 8px; border-top: 1px solid #374151; padding-top: 6px;">
                            Analyzed ${timeAgo}
                        </div>
                    </div>
                `;
            } else {
                container.style.display = 'none';
            }
        });
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    openSettings() {
        // Open options page
        chrome.runtime.openOptionsPage();
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NeuraPlayPopup();
});















// // popup/popup.js
// class NeuraPlayPopup {
//     constructor() {
//         this.initializePopup();
//         this.checkCurrentPage();
//     }

//     initializePopup() {
//         // Add event listeners
//         document.getElementById('analyzeBtn').addEventListener('click', () => this.analyzeCurrentPage());
//         document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        
//         // Load recent analysis from storage
//         this.loadRecentAnalysis();
//     }

//     async checkCurrentPage() {
//         const statusElement = document.getElementById('status');
        
//         try {
//             // Get current active tab
//             const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
//             if (this.isSupportedSite(tab.url)) {
//                 const game = this.detectGameFromUrl(tab.url);
//                 statusElement.innerHTML = `
//                     <p>✅ Ready to analyze <strong>${game.toUpperCase()}</strong> data</p>
//                     <p class="game-info">
//                         <span class="game-icon">🎮</span>
//                         Currently on: ${new URL(tab.url).hostname}
//                     </p>
//                 `;
//                 statusElement.className = 'status success';
//             } else {
//                 statusElement.innerHTML = `
//                     <p>🌐 Visit a supported gaming site:</p>
//                     <ul style="margin: 8px 0; padding-left: 16px; font-size: 12px;">
//                         <li>OP.GG (League of Legends)</li>
//                         <li>U.GG (League of Legends)</li>
//                         <li>Futbin (FIFA)</li>
//                     </ul>
//                 `;
//                 statusElement.className = 'status';
//                 document.getElementById('analyzeBtn').disabled = true;
//             }
//         } catch (error) {
//             statusElement.innerHTML = `<p>❌ Error checking page: ${error.message}</p>`;
//             statusElement.className = 'status error';
//         }
//     }

//     isSupportedSite(url) {
//         const supportedDomains = [
//             'op.gg',
//             'www.ug.gg',
//             'futbin.com',
//             'www.futbin.com'
//         ];
        
//         try {
//             const domain = new URL(url).hostname;
//             return supportedDomains.some(supported => domain.includes(supported));
//         } catch {
//             return false;
//         }
//     }

//     detectGameFromUrl(url) {
//         if (url.includes('op.gg') || url.includes('ug.gg')) {
//             return 'lol';
//         } else if (url.includes('futbin.com')) {
//             return 'fifa';
//         }
//         return 'unknown';
//     }

//     async analyzeCurrentPage() {
//         const analyzeBtn = document.getElementById('analyzeBtn');
//         const statusElement = document.getElementById('status');
        
//         // Show loading state
//         analyzeBtn.innerHTML = '<span class="loading"></span>Analyzing...';
//         analyzeBtn.disabled = true;
//         statusElement.innerHTML = '<p>🔍 Scanning page for game data...</p>';
//         statusElement.className = 'status scanning';

//         try {
//             // Get current active tab
//             const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
//             // Inject content script if not already injected
//             await chrome.scripting.executeScript({
//                 target: { tabId: tab.id },
//                 files: ['content/content.js']
//             });

//             // Send message to content script to trigger analysis
//             const response = await chrome.tabs.sendMessage(tab.id, { 
//                 action: 'manualAnalyze' 
//             });

//             if (response && response.success) {
//                 statusElement.innerHTML = `
//                     <p>✅ Analysis complete!</p>
//                     <p style="font-size: 12px; opacity: 0.8;">Check the overlay on the page for detailed results.</p>
//                 `;
//                 statusElement.className = 'status success';
                
//                 // Save to recent analysis
//                 this.saveRecentAnalysis(response.analysis);
//             } else {
//                 throw new Error('No game data found on this page');
//             }

//         } catch (error) {
//             console.error('Analysis error:', error);
//             statusElement.innerHTML = `
//                 <p>❌ Analysis failed</p>
//                 <p style="font-size: 12px; opacity: 0.8;">${error.message}</p>
//             `;
//             statusElement.className = 'status error';
//         } finally {
//             // Reset button
//             analyzeBtn.innerHTML = 'Analyze Current Page';
//             analyzeBtn.disabled = false;
//         }
//     }

//     saveRecentAnalysis(analysis) {
//         const analysisData = {
//             summary: analysis.summary,
//             topTips: analysis.topTips,
//             rating: analysis.rating,
//             confidence: analysis.confidence,
//             timestamp: new Date().toISOString(),
//             game: analysis.game || 'unknown'
//         };

//         // Save to chrome storage
//         chrome.storage.local.set({ 
//             recentAnalysis: analysisData 
//         }, () => {
//             this.loadRecentAnalysis();
//         });
//     }

//     loadRecentAnalysis() {
//         chrome.storage.local.get(['recentAnalysis'], (result) => {
//             const recentAnalysis = result.recentAnalysis;
//             const container = document.getElementById('recentAnalysis');
//             const resultElement = document.getElementById('analysisResult');

//             if (recentAnalysis) {
//                 container.style.display = 'block';
                
//                 const timeAgo = this.getTimeAgo(new Date(recentAnalysis.timestamp));
//                 const gameIcon = recentAnalysis.game === 'lol' ? '⚔️' : '⚽';
                
//                 resultElement.innerHTML = `
//                     <div class="analysis-preview">
//                         <div class="summary">${recentAnalysis.summary}</div>
//                         ${recentAnalysis.rating ? `
//                             <div class="rating">Rating: ${recentAnalysis.rating}/10</div>
//                         ` : ''}
//                         ${recentAnalysis.topTips && recentAnalysis.topTips.length > 0 ? `
//                             <div class="tips">
//                                 <strong>Key Tips:</strong>
//                                 <ul>
//                                     ${recentAnalysis.topTips.slice(0, 2).map(tip => 
//                                         `<li>${tip}</li>`
//                                     ).join('')}
//                                 </ul>
//                             </div>
//                         ` : ''}
//                         <div style="font-size: 11px; opacity: 0.6; margin-top: 8px;">
//                             ${gameIcon} ${timeAgo}
//                         </div>
//                     </div>
//                 `;
//             } else {
//                 container.style.display = 'none';
//             }
//         });
//     }

//     getTimeAgo(date) {
//         const seconds = Math.floor((new Date() - date) / 1000);
        
//         if (seconds < 60) return 'Just now';
//         if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
//         if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
//         return `${Math.floor(seconds / 86400)} days ago`;
//     }

//     openSettings() {
//         // Open options page or show settings in popup
//         chrome.runtime.openOptionsPage();
//     }
// }

// // Initialize the popup when DOM is loaded
// document.addEventListener('DOMContentLoaded', () => {
//     new NeuraPlayPopup();
// });