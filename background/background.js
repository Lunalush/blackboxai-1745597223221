// Premium status check
async function checkPremiumStatus() {
    try {
        const response = await fetch('your-backend-url/check-premium-status', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${await chrome.storage.sync.get('authToken')}`
            }
        });
        const data = await response.json();
        await chrome.storage.sync.set({ isPremium: data.isPremium });
        return data.isPremium;
    } catch (error) {
        console.error('Error checking premium status:', error);
        return false;
    }
}

// Automatic cleaning setup
async function setupAutoClean() {
    const { autoClean, cleanupInterval, domains = [] } = await chrome.storage.sync.get([
        'autoClean',
        'cleanupInterval',
        'domains'
    ]);

    // Clear existing alarm
    await chrome.alarms.clear('autoClean');

    if (!autoClean || domains.length === 0) {
        return;
    }

    // Set up new alarm based on interval
    let periodInMinutes;
    switch (cleanupInterval) {
        case 'hourly':
            periodInMinutes = 60;
            break;
        case 'daily':
            periodInMinutes = 60 * 24;
            break;
        case 'weekly':
            periodInMinutes = 60 * 24 * 7;
            break;
        default:
            periodInMinutes = 60 * 24; // Default to daily
    }

    chrome.alarms.create('autoClean', {
        periodInMinutes: periodInMinutes
    });
}

// Handle automatic cleaning
async function performAutoClean() {
    const { domains = [] } = await chrome.storage.sync.get('domains');
    
    for (const domain of domains) {
        try {
            const items = await chrome.history.search({
                text: domain,
                startTime: 0,
                maxResults: 1000
            });

            const domainItems = items.filter(item => {
                try {
                    const url = new URL(item.url);
                    return url.hostname.includes(domain);
                } catch (e) {
                    return false;
                }
            });

            for (const item of domainItems) {
                await chrome.history.deleteUrl({ url: item.url });
            }
        } catch (error) {
            console.error(`Error cleaning history for domain ${domain}:`, error);
        }
    }
}

// Backup rotation (keep last 10 backups for free users)
async function manageBackups() {
    const { isPremium } = await chrome.storage.sync.get('isPremium');
    if (!isPremium) {
        const { backups = [] } = await chrome.storage.local.get('backups');
        if (backups.length > 10) {
            const sortedBackups = backups.sort((a, b) => new Date(b.date) - new Date(a.date));
            const updatedBackups = sortedBackups.slice(0, 10);
            await chrome.storage.local.set({ backups: updatedBackups });
        }
    }
}

// Event Listeners
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        // Set default settings
        await chrome.storage.sync.set({
            autoClean: false,
            cleanupInterval: 'daily',
            domains: [],
            isPremium: false
        });
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'autoClean') {
        await performAutoClean();
    }
});

// Listen for settings changes
chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'sync') {
        if (changes.autoClean || changes.cleanupInterval || changes.domains) {
            await setupAutoClean();
        }
    } else if (area === 'local') {
        if (changes.backups) {
            await manageBackups();
        }
    }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'checkPremium':
            checkPremiumStatus().then(sendResponse);
            return true;
            
        case 'setupAutoClean':
            setupAutoClean().then(() => sendResponse({ success: true }));
            return true;
    }
});

// Initial setup
setupAutoClean();
