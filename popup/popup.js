// DOM Elements
const domainInput = document.getElementById('domain');
const clearHistoryBtn = document.getElementById('clearHistory');
const toggleThemeBtn = document.getElementById('toggleTheme');
const autoCleanToggle = document.getElementById('autoClean');
const cleanupIntervalSelect = document.getElementById('cleanupInterval');
const historyList = document.getElementById('historyList');
const totalVisitsElement = document.getElementById('totalVisits');
const lastVisitElement = document.getElementById('lastVisit');
const subscriptionBadge = document.getElementById('subscriptionBadge');
const upgradeBtn = document.getElementById('upgradeBtn');
const subscribePro = document.getElementById('subscribePro');

// Stripe Configuration
const stripe = Stripe('your_publishable_key'); // Replace with your Stripe publishable key

// Premium Status
let isPremium = false;

// Tab Management
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Check premium access for certain tabs
            if ((tabName === 'backup' || tabName === 'tags') && !isPremium) {
                showPremiumPrompt();
                return;
            }

            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active', 'border-blue-500'));
            tabContents.forEach(content => content.classList.add('hidden'));
            
            button.classList.add('active', 'border-blue-500');
            document.getElementById(`${tabName}Tab`).classList.remove('hidden');
        });
    });
}

// Theme Management
function initializeTheme() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    document.documentElement.classList.toggle('dark', isDark);
}

toggleThemeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', isDark);
});

// History Management
async function clearDomainHistory() {
    const domain = domainInput.value.trim();
    if (!domain) {
        showNotification('Please enter a domain', 'error');
        return;
    }

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

        showNotification(`Cleared ${domainItems.length} items from history`, 'success');
        updateStatistics(domain);
        updateHistoryList(domain);
    } catch (error) {
        showNotification('Error clearing history: ' + error.message, 'error');
    }
}

// Backup Management
async function createBackup() {
    if (!isPremium) {
        showPremiumPrompt();
        return;
    }

    const backupName = document.getElementById('backupName').value.trim();
    if (!backupName) {
        showNotification('Please enter a backup name', 'error');
        return;
    }

    try {
        const historyItems = await chrome.history.search({
            text: '',
            startTime: 0,
            maxResults: 10000
        });

        const backup = {
            name: backupName,
            date: new Date().toISOString(),
            items: historyItems
        };

        // Store backup in chrome.storage
        const backups = await chrome.storage.local.get('backups') || { backups: [] };
        backups.backups.push(backup);
        await chrome.storage.local.set(backups);

        updateBackupsList();
        showNotification('Backup created successfully', 'success');
    } catch (error) {
        showNotification('Error creating backup: ' + error.message, 'error');
    }
}

async function restoreBackup(backupId) {
    try {
        const { backups } = await chrome.storage.local.get('backups');
        const backup = backups.find(b => b.date === backupId);

        if (!backup) {
            showNotification('Backup not found', 'error');
            return;
        }

        // Clear current history first
        await chrome.history.deleteAll();

        // Restore backed up items
        for (const item of backup.items) {
            await chrome.history.addUrl({
                url: item.url,
                title: item.title,
                visitTime: item.lastVisitTime
            });
        }

        showNotification('Backup restored successfully', 'success');
        updateHistoryList();
    } catch (error) {
        showNotification('Error restoring backup: ' + error.message, 'error');
    }
}

// Tag Management
async function addTag() {
    if (!isPremium) {
        showPremiumPrompt();
        return;
    }

    const tagInput = document.getElementById('newTag');
    const tagName = tagInput.value.trim();

    if (!tagName) {
        showNotification('Please enter a tag name', 'error');
        return;
    }

    try {
        const { tags = [] } = await chrome.storage.sync.get('tags');
        if (!tags.includes(tagName)) {
            tags.push(tagName);
            await chrome.storage.sync.set({ tags });
            updateTagsList();
            tagInput.value = '';
            showNotification('Tag added successfully', 'success');
        }
    } catch (error) {
        showNotification('Error adding tag: ' + error.message, 'error');
    }
}

async function tagHistoryItem(url, tag) {
    try {
        const { taggedItems = {} } = await chrome.storage.sync.get('taggedItems');
        if (!taggedItems[url]) {
            taggedItems[url] = [];
        }
        if (!taggedItems[url].includes(tag)) {
            taggedItems[url].push(tag);
            await chrome.storage.sync.set({ taggedItems });
            updateTaggedHistory();
            showNotification('Item tagged successfully', 'success');
        }
    } catch (error) {
        showNotification('Error tagging item: ' + error.message, 'error');
    }
}

// Premium Features
function showPremiumPrompt() {
    const premiumTab = document.querySelector('[data-tab="premium"]');
    premiumTab.click();
}

async function handleSubscription() {
    try {
        // Create checkout session
        const response = await fetch('your-backend-url/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const session = await response.json();
        
        // Redirect to Stripe Checkout
        const result = await stripe.redirectToCheckout({
            sessionId: session.id
        });

        if (result.error) {
            showNotification(result.error.message, 'error');
        }
    } catch (error) {
        showNotification('Error processing subscription: ' + error.message, 'error');
    }
}

// UI Updates
async function updateStatistics(domain) {
    try {
        const items = await chrome.history.search({
            text: domain,
            startTime: 0,
            maxResults: 1
        });

        const totalVisits = items.length;
        const lastVisit = items[0] ? new Date(items[0].lastVisitTime).toLocaleDateString() : 'Never';

        totalVisitsElement.textContent = totalVisits;
        lastVisitElement.textContent = lastVisit;
    } catch (error) {
        console.error('Error updating statistics:', error);
    }
}

async function updateHistoryList(domain = '') {
    try {
        const items = await chrome.history.search({
            text: domain,
            maxResults: 10
        });

        historyList.innerHTML = items.map(item => `
            <div class="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                <div class="flex-1 truncate">
                    <a href="${item.url}" class="text-sm hover:text-blue-500" target="_blank">
                        ${item.title || item.url}
                    </a>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        ${new Date(item.lastVisitTime).toLocaleString()}
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    ${isPremium ? `
                        <button class="tag-item p-1 text-blue-500 hover:text-blue-600" data-url="${item.url}">
                            <i class="fas fa-tag"></i>
                        </button>
                    ` : ''}
                    <button class="delete-url p-1 text-red-500 hover:text-red-600" data-url="${item.url}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('') || '<p class="text-gray-500 text-center">No history found</p>';

        // Add event listeners
        document.querySelectorAll('.delete-url').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const url = e.currentTarget.dataset.url;
                await chrome.history.deleteUrl({ url });
                updateHistoryList(domain);
                updateStatistics(domain);
            });
        });

        if (isPremium) {
            document.querySelectorAll('.tag-item').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const url = e.currentTarget.dataset.url;
                    showTagSelector(url);
                });
            });
        }
    } catch (error) {
        console.error('Error updating history list:', error);
    }
}

// Notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg ${
        type === 'error' ? 'bg-red-500' : 'bg-green-500'
    } text-white`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Event Listeners
clearHistoryBtn.addEventListener('click', clearDomainHistory);
domainInput.addEventListener('input', (e) => updateHistoryList(e.target.value));
autoCleanToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ autoClean: autoCleanToggle.checked });
});
cleanupIntervalSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ cleanupInterval: cleanupIntervalSelect.value });
});
subscribePro.addEventListener('click', handleSubscription);
document.getElementById('createBackup')?.addEventListener('click', createBackup);
document.getElementById('addTag')?.addEventListener('click', addTag);

// Backup List Management
async function updateBackupsList() {
    const backupsList = document.getElementById('backupsList');
    try {
        const { backups = [] } = await chrome.storage.local.get('backups');
        
        backupsList.innerHTML = backups.map(backup => `
            <div class="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded-lg">
                <div>
                    <h3 class="font-medium">${backup.name}</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        ${new Date(backup.date).toLocaleString()}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button class="restore-backup px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                        data-backup-id="${backup.date}">
                        Restore
                    </button>
                    <button class="delete-backup px-2 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                        data-backup-id="${backup.date}">
                        Delete
                    </button>
                </div>
            </div>
        `).join('') || '<p class="text-center text-gray-500">No backups found</p>';

        // Add event listeners
        document.querySelectorAll('.restore-backup').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const backupId = e.currentTarget.dataset.backupId;
                if (confirm('Are you sure you want to restore this backup? Current history will be replaced.')) {
                    restoreBackup(backupId);
                }
            });
        });

        document.querySelectorAll('.delete-backup').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const backupId = e.currentTarget.dataset.backupId;
                if (confirm('Are you sure you want to delete this backup?')) {
                    await deleteBackup(backupId);
                }
            });
        });
    } catch (error) {
        console.error('Error updating backups list:', error);
        backupsList.innerHTML = '<p class="text-center text-red-500">Error loading backups</p>';
    }
}

// Tag List Management
async function updateTagsList() {
    const tagsList = document.getElementById('tagsList');
    try {
        const { tags = [] } = await chrome.storage.sync.get('tags');
        
        tagsList.innerHTML = tags.map(tag => `
            <span class="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 
                rounded-full text-sm flex items-center gap-1">
                ${tag}
                <button class="delete-tag ml-1 text-blue-600 dark:text-blue-300 hover:text-blue-800"
                    data-tag="${tag}">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('') || '<p class="text-gray-500">No tags created</p>';

        // Add event listeners for tag deletion
        document.querySelectorAll('.delete-tag').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const tagToDelete = e.currentTarget.dataset.tag;
                await deleteTag(tagToDelete);
            });
        });
    } catch (error) {
        console.error('Error updating tags list:', error);
        tagsList.innerHTML = '<p class="text-center text-red-500">Error loading tags</p>';
    }
}

async function updateTaggedHistory() {
    const taggedHistory = document.getElementById('taggedHistory');
    try {
        const { taggedItems = {} } = await chrome.storage.sync.get('taggedItems');
        const { tags = [] } = await chrome.storage.sync.get('tags');
        
        const entries = Object.entries(taggedItems);
        if (entries.length === 0) {
            taggedHistory.innerHTML = '<p class="text-center text-gray-500">No tagged items</p>';
            return;
        }

        taggedHistory.innerHTML = entries.map(([url, itemTags]) => `
            <div class="p-2 bg-white dark:bg-gray-700 rounded-lg">
                <a href="${url}" class="text-sm hover:text-blue-500" target="_blank">${url}</a>
                <div class="flex flex-wrap gap-1 mt-1">
                    ${itemTags.map(tag => `
                        <span class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 
                            dark:text-blue-200 rounded-full text-xs">
                            ${tag}
                        </span>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error updating tagged history:', error);
        taggedHistory.innerHTML = '<p class="text-center text-red-500">Error loading tagged history</p>';
    }
}

async function deleteTag(tag) {
    try {
        const { tags = [] } = await chrome.storage.sync.get('tags');
        const { taggedItems = {} } = await chrome.storage.sync.get('taggedItems');

        // Remove tag from tags list
        const updatedTags = tags.filter(t => t !== tag);
        await chrome.storage.sync.set({ tags: updatedTags });

        // Remove tag from all items
        for (const url in taggedItems) {
            taggedItems[url] = taggedItems[url].filter(t => t !== tag);
            if (taggedItems[url].length === 0) {
                delete taggedItems[url];
            }
        }
        await chrome.storage.sync.set({ taggedItems });

        // Update UI
        updateTagsList();
        updateTaggedHistory();
        showNotification('Tag deleted successfully', 'success');
    } catch (error) {
        showNotification('Error deleting tag: ' + error.message, 'error');
    }
}

async function deleteBackup(backupId) {
    try {
        const { backups = [] } = await chrome.storage.local.get('backups');
        const updatedBackups = backups.filter(b => b.date !== backupId);
        await chrome.storage.local.set({ backups: updatedBackups });
        updateBackupsList();
        showNotification('Backup deleted successfully', 'success');
    } catch (error) {
        showNotification('Error deleting backup: ' + error.message, 'error');
    }
}

function showTagSelector(url) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center';
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg max-w-sm w-full mx-4">
            <h3 class="text-lg font-semibold mb-4">Add Tags</h3>
            <div class="space-y-2" id="tagCheckboxes">
                <!-- Tag checkboxes will be populated here -->
            </div>
            <div class="mt-4 flex justify-end gap-2">
                <button id="cancelTagging" class="px-4 py-2 text-gray-600 hover:text-gray-800">
                    Cancel
                </button>
                <button id="saveTagging" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Save
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Load tags and current item's tags
    chrome.storage.sync.get(['tags', 'taggedItems'], ({ tags = [], taggedItems = {} }) => {
        const currentTags = taggedItems[url] || [];
        const checkboxesContainer = modal.querySelector('#tagCheckboxes');
        
        checkboxesContainer.innerHTML = tags.map(tag => `
            <label class="flex items-center gap-2">
                <input type="checkbox" value="${tag}" 
                    ${currentTags.includes(tag) ? 'checked' : ''}>
                <span>${tag}</span>
            </label>
        `).join('');
    });

    // Handle save
    modal.querySelector('#saveTagging').addEventListener('click', async () => {
        const selectedTags = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        await tagHistoryItem(url, selectedTags);
        modal.remove();
    });

    // Handle cancel
    modal.querySelector('#cancelTagging').addEventListener('click', () => {
        modal.remove();
    });
}

// Analytics Functions
let timeSpentChart, peakHoursChart, categoryChart;

async function initializeAnalytics() {
    if (!isPremium) {
        showPremiumPrompt();
        return;
    }

    const analyticsData = await collectAnalyticsData();
    renderCharts(analyticsData);
    updateSummaryStatistics(analyticsData);
}

async function collectAnalyticsData() {
    try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const items = await chrome.history.search({
            text: '',
            startTime: oneWeekAgo.getTime(),
            maxResults: 10000
        });

        // Process domain data
        const domainStats = {};
        const hourlyStats = new Array(24).fill(0);
        const categories = {};

        items.forEach(item => {
            try {
                const url = new URL(item.url);
                const domain = url.hostname;
                
                // Update domain stats
                if (!domainStats[domain]) {
                    domainStats[domain] = {
                        visits: 0,
                        timeSpent: 0
                    };
                }
                domainStats[domain].visits++;

                // Update hourly stats
                const hour = new Date(item.lastVisitTime).getHours();
                hourlyStats[hour]++;

                // Categorize domains (simple categorization)
                const category = categorizeDomain(domain);
                categories[category] = (categories[category] || 0) + 1;
            } catch (e) {
                console.error('Error processing URL:', e);
            }
        });

        return {
            domainStats,
            hourlyStats,
            categories,
            totalVisits: items.length
        };
    } catch (error) {
        console.error('Error collecting analytics:', error);
        return null;
    }
}

function categorizeDomain(domain) {
    const categories = {
        'social': ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com'],
        'productivity': ['github.com', 'gitlab.com', 'notion.so', 'slack.com'],
        'entertainment': ['youtube.com', 'netflix.com', 'spotify.com'],
        'shopping': ['amazon.com', 'ebay.com', 'etsy.com'],
        'news': ['cnn.com', 'bbc.com', 'reuters.com']
    };

    for (const [category, domains] of Object.entries(categories)) {
        if (domains.some(d => domain.includes(d))) {
            return category;
        }
    }
    return 'other';
}

function renderCharts(data) {
    if (!data) return;

    // Time Spent Chart
    const timeSpentCtx = document.getElementById('timeSpentChart').getContext('2d');
    if (timeSpentChart) timeSpentChart.destroy();
    timeSpentChart = new Chart(timeSpentCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(data.domainStats).slice(0, 10),
            datasets: [{
                label: 'Visits',
                data: Object.values(data.domainStats).map(d => d.visits).slice(0, 10),
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // Peak Hours Chart
    const peakHoursCtx = document.getElementById('peakHoursChart').getContext('2d');
    if (peakHoursChart) peakHoursChart.destroy();
    peakHoursChart = new Chart(peakHoursCtx, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => `${i}:00`),
            datasets: [{
                label: 'Visits',
                data: data.hourlyStats,
                borderColor: 'rgb(147, 51, 234)',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(147, 51, 234, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    // Category Chart
    const categoryCtx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(categoryCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data.categories),
            datasets: [{
                data: Object.values(data.categories),
                backgroundColor: [
                    'rgba(59, 130, 246, 0.5)',
                    'rgba(147, 51, 234, 0.5)',
                    'rgba(16, 185, 129, 0.5)',
                    'rgba(245, 158, 11, 0.5)',
                    'rgba(239, 68, 68, 0.5)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function updateSummaryStatistics(data) {
    if (!data) return;

    // Most visited domain
    const mostVisited = Object.entries(data.domainStats)
        .sort((a, b) => b[1].visits - a[1].visits)[0];
    document.getElementById('mostVisitedDomain').textContent = mostVisited ? mostVisited[0] : '-';

    // Peak activity time
    const peakHour = data.hourlyStats.indexOf(Math.max(...data.hourlyStats));
    document.getElementById('peakActivityTime').textContent = `${peakHour}:00`;

    // Total domains
    document.getElementById('totalDomains').textContent = Object.keys(data.domainStats).length;

    // Total visits
    document.getElementById('totalBrowsingTime').textContent = data.totalVisits;
}

// Export Functions
async function exportToPDF() {
    if (!isPremium) {
        showPremiumPrompt();
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('Browsing Analytics Report', 20, 20);
    
    // Add charts as images
    const charts = [timeSpentChart, peakHoursChart, categoryChart];
    let yOffset = 40;
    
    for (const chart of charts) {
        const chartImage = chart.toBase64Image();
        doc.addImage(chartImage, 'PNG', 20, yOffset, 170, 60);
        yOffset += 70;
    }
    
    // Save the PDF
    doc.save('browsing-analytics.pdf');
}

async function exportToCSV() {
    if (!isPremium) {
        showPremiumPrompt();
        return;
    }

    const data = await collectAnalyticsData();
    if (!data) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    
    // Domain stats
    csvContent += 'Domain Statistics\n';
    csvContent += 'Domain,Visits\n';
    Object.entries(data.domainStats).forEach(([domain, stats]) => {
        csvContent += `${domain},${stats.visits}\n`;
    });
    
    // Hourly stats
    csvContent += '\nHourly Statistics\n';
    csvContent += 'Hour,Visits\n';
    data.hourlyStats.forEach((visits, hour) => {
        csvContent += `${hour}:00,${visits}\n`;
    });
    
    // Category stats
    csvContent += '\nCategory Statistics\n';
    csvContent += 'Category,Visits\n';
    Object.entries(data.categories).forEach(([category, visits]) => {
        csvContent += `${category},${visits}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'browsing-analytics.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initializeTheme();
    initializeTabs();
    
    // Load settings
    const settings = await chrome.storage.sync.get(['autoClean', 'cleanupInterval', 'isPremium']);
    autoCleanToggle.checked = settings.autoClean || false;
    cleanupIntervalSelect.value = settings.cleanupInterval || 'daily';
    isPremium = settings.isPremium || false;
    
    // Update UI based on premium status
    subscriptionBadge.textContent = isPremium ? 'Pro' : 'Free Plan';
    subscriptionBadge.classList.toggle('bg-purple-500', isPremium);
    upgradeBtn.style.display = isPremium ? 'none' : 'block';
    
    // Initial updates
    updateHistoryList();
    if (isPremium) {
        updateBackupsList();
        updateTagsList();
        initializeAnalytics();
    }

    // Add export event listeners
    document.getElementById('exportPDF')?.addEventListener('click', exportToPDF);
    document.getElementById('exportCSV')?.addEventListener('click', exportToCSV);
});
