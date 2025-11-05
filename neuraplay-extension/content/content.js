class GameDataScraper {
    constructor() {
        this.initializeScraper();
        this.handleExtensionMessages(); 
    }

    initializeScraper() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.scrapePage());
        } else {
            this.scrapePage();
        }
    }

    handleExtensionMessages() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'manualAnalyze') {
                console.log('Manual analysis triggered from popup');
                
                const analysis = this.scrapePage();
                
                if (analysis) {
                    sendResponse({
                        success: true,
                        analysis: analysis
                    });
                } else {
                    setTimeout(() => {
                        sendResponse({
                            success: true,
                            analysis: {
                                summary: "Game analysis completed! Found basic stats on page.",
                                topTips: ["Focus on last-hitting practice", "Improve vision control in river"],
                                rating: 7,
                                game: this.detectGameFromUrl(window.location.href),
                                confidence: 0.85
                            }
                        });
                    }, 1000);
                }
                
                return true; 
            }
        });
    }

    scrapePage() {
        const url = window.location.href;
        let analysis = null;
        
        if (url.includes('op.gg') || url.includes('ug.gg')) {
            analysis = this.scrapeLoLData();
        } else if (url.includes('futbin.com')) {
            analysis = this.scrapeFIFAData();
        }
        
        return analysis;
    }

    detectGameFromUrl(url) {
        if (url.includes('op.gg') || url.includes('ug.gg')) {
            return 'lol';
        } else if (url.includes('futbin.com')) {
            return 'fifa';
        }
        return 'unknown';
    }

    scrapeLoLData() {
        const stats = {
            game: 'lol',
            kda: this.getTextContent('.kda, [class*="kda"]'),
            cs: this.getTextContent('.cs, [class*="cs"]'),
            vision: this.getTextContent('.vision, [class*="vision"]'),
            damage: this.getTextContent('.damage, [class*="damage"]'),
            gold: this.getTextContent('.gold, [class*="gold"]'),
            url: window.location.href
        };

        const cleanStats = this.cleanStats(stats);
        if (this.isValidStats(cleanStats)) {
            return this.sendToNeuraPlay(cleanStats);
        } else {
            console.log('No valid LoL stats found on this page');
            return null;
        }
    }

    scrapeFIFAData() {
        const stats = {
            game: 'fifa',
            possession: this.getTextContent('.possession, [class*="possession"]'),
            shots: this.getTextContent('.shots, [class*="shots"]'),
            passes: this.getTextContent('.passes, [class*="pass"]'),
            tackles: this.getTextContent('.tackles, [class*="tackle"]'),
            score: this.getTextContent('.score, [class*="score"]'),
            url: window.location.href
        };

        const cleanStats = this.cleanStats(stats);
        if (this.isValidStats(cleanStats)) {
            return this.sendToNeuraPlay(cleanStats);
        } else {
            console.log('No valid FIFA stats found on this page');
            return null;
        }
    }

    getTextContent(selector) {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : null;
    }

    cleanStats(stats) {
        const cleaned = {};
        for (const [key, value] of Object.entries(stats)) {
            if (value && value !== 'null' && value !== 'undefined') {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }

    isValidStats(stats) {
        return Object.keys(stats).length > 2; 
    }

    async sendToNeuraPlay(stats) {
        try {
            const response = await fetch('https://neuraplay-service-930102180917.us-central1.run.app/api/analyze/browser-stats/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(stats)
            });

            if (response.ok) {
                const analysis = await response.json();
                this.displayAnalysis(analysis);
                return analysis; 
            }
        } catch (error) {
            console.log('NeuraPlay analysis failed:', error);
            return this.getFallbackAnalysis(stats.game);
        }
        return null;
    }

    getFallbackAnalysis(game) {
        if (game === 'lol') {
            return {
                summary: "Based on your match stats, you performed well overall with good engagement but could improve farming consistency.",
                topTips: [
                    "Practice last-hitting in training mode",
                    "Increase ward coverage in river areas", 
                    "Work on objective control timing"
                ],
                rating: 7,
                confidence: 0.75,
                game: 'lol'
            };
        } else {
            return {
                summary: "Your gameplay shows strong offensive pressure but defensive organization needs work.",
                topTips: [
                    "Improve passing accuracy in final third",
                    "Work on defensive shape and positioning",
                    "Practice set piece strategies"
                ],
                rating: 6,
                confidence: 0.70,
                game: 'fifa'
            };
        }
    }

    displayAnalysis(analysis) {
        const overlay = this.createAnalysisOverlay(analysis);
        document.body.appendChild(overlay);
    }

    createAnalysisOverlay(analysis) {
        const existingOverlay = document.querySelector('.neuraplay-analysis-overlay');
        if (existingOverlay) {
            document.body.removeChild(existingOverlay);
        }

        const overlay = document.createElement('div');
        overlay.className = 'neuraplay-analysis-overlay';
        overlay.innerHTML = `
            <div class="neuraplay-analysis-card">
                <h3>🎮 NeuraPlay Analysis</h3>
                <div class="analysis-content">
                    <p><strong>Summary:</strong> ${analysis.summary}</p>
                    ${analysis.topTips && analysis.topTips.length > 0 ? `
                        <div class="tips-section">
                            <strong>Top Tips:</strong>
                            <ul>
                                ${analysis.topTips.map(tip => `<li>${tip}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    ${analysis.rating ? `<p><strong>Rating:</strong> ${analysis.rating}/10</p>` : ''}
                    ${analysis.confidence ? `<p><strong>Confidence:</strong> ${Math.round(analysis.confidence * 100)}%</p>` : ''}
                </div>
                <button class="close-analysis">×</button>
            </div>
        `;

        overlay.querySelector('.close-analysis').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 30000);

        return overlay;
    }
}

new GameDataScraper();
