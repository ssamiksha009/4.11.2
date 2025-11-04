// ============================================
// USER DASHBOARD - JavaScript
// ============================================

// Global Variables
let currentUser = null;
let allProjects = [];
let protocolChart = null;
let currentViewMode = localStorage.getItem('projectViewMode') || 'list';
let systemInfo = {
    current_timestamp: '',
    user_login: ''
};


// Protocol colors mapping
const PROTOCOL_COLORS = {
    'PCR': '#6366f1',
    'MF2': '#8b5cf6',
    'TBR': '#10b981',
    'Custom': '#f59e0b',
    'CDTire': '#ef4444'
};

// ============================================
// INITIALIZATION
// ============================================

// Modify the existing initialization code (around line 30) to include systemInfo loading:
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Dashboard initializing...');
    
    // Check authentication
    await checkAuthentication();
    
    // Load user data and system info
    await Promise.all([
        loadUserData(),
        loadSystemInfo(),
        loadDashboardData()
    ]);
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Start auto-refresh
    startAutoRefresh();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuthentication() {
    try {
        const userEmail = localStorage.getItem('userEmail');
        const authToken = localStorage.getItem('authToken');
        
        console.log('Checking auth - userEmail:', userEmail, 'token:', authToken ? 'exists' : 'missing');
        
        if (!userEmail || !authToken) {
            console.log('No user logged in, redirecting to login...');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 100);
            return;
        }
        
        console.log('User authenticated:', userEmail);
    } catch (error) {
        console.error('Authentication error:', error);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 100);
    }
}

// ============================================
// USER DATA LOADING
// ============================================

async function loadUserData() {
    try {
        const userEmail = localStorage.getItem('userEmail');
        
        // Fetch user data from API
        const response = await fetch(`/api/me`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user data');
        }
        
        const data = await response.json();
        currentUser = data.user;
        
        // Update UI with user data
        updateUserUI();
        
    } catch (error) {
        console.error('Error loading user data:', error);
        
        // Fallback to mock data
        currentUser = {
            name: 'User',
            email: localStorage.getItem('userEmail') || 'user@apollotyres.com',
            role: 'Engineer',
            created_at: new Date().toISOString(),
            last_login: new Date().toISOString()
        };
        
        updateUserUI();
    }
}

// Add this function after loadUserData() function
async function loadSystemInfo() {
    try {
        const response = await fetch('/api/system-info', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch system info');
        }

        const data = await response.json();
        if (data.success) {
            systemInfo = data.data;
        }
    } catch (error) {
        console.error('Error loading system info:', error);
        // Set fallback values
        systemInfo = {
            current_timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
            user_login: localStorage.getItem('userEmail')?.split('@')[0] || 'unknown'
        };
    }
}

function updateUserUI() {
    // Update all user name elements
    const userNameElements = [
        document.getElementById('userName'),
        document.getElementById('topBarUserName'),
        document.getElementById('welcomeUserName')
    ];
    
    userNameElements.forEach(element => {
        if (element) {
            element.textContent = currentUser.name || 'User';
        }
    });
    
    // Update user role
    const userRoleElement = document.getElementById('userRole');
    if (userRoleElement) {
        userRoleElement.textContent = currentUser.role || 'User';
    }
    
    // Update user statistics
    updateUserStatistics();
}

function updateUserStatistics() {
    // Last login
    const lastLoginElement = document.getElementById('userLastLogin');
    if (lastLoginElement && currentUser.last_login) {
        lastLoginElement.textContent = formatRelativeTime(currentUser.last_login);
    }
    
    // Join date
    const joinDateElement = document.getElementById('userJoinDate');
    if (joinDateElement && currentUser.created_at) {
        joinDateElement.textContent = formatDate(currentUser.created_at);
    }
}

// ============================================
// DASHBOARD DATA LOADING
// ============================================

async function loadDashboardData() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        
        const data = await response.json();
        allProjects = Array.isArray(data) ? data : (data.projects || []);
        
        console.log('✅ Loaded', allProjects.length, 'projects from database');

        // Process and display data
        updateStatistics();
        updateRecentProjects();

        
        // Load all visualizations
        await loadProtocolDistribution();
        await loadStatusTrend();           // ✅ Status Trend Chart
        await loadActivityStats();          // ✅ Activity Statistics
        
    } catch (error) {
        console.error('❌ Error loading dashboard data:', error);
        showToast('Failed to load dashboard data. Please refresh the page.', 'error');
        allProjects = [];
        updateStatistics();
    }
}

// ============================================
// PROTOCOL DISTRIBUTION CHART
// ============================================

let protocolDistributionChart = null;

async function loadProtocolDistribution() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch protocol distribution');
        }
        
        const data = await response.json();
        const projects = Array.isArray(data) ? data : (data.projects || []);
        
        // Count projects by protocol
        const protocolCounts = {
            'MF6.2': 0,
            'MF5.2': 0,
            'CDTire': 0,
            'FTire': 0,
            'Custom': 0
        };
        
        projects.forEach(project => {
            const protocol = project.protocol;
            
            // Map protocol names to match your database
            if (protocol === 'MF2' || protocol === 'MF62') {
                protocolCounts['MF6.2']++;
            } else if (protocol === 'MF52') {
                protocolCounts['MF5.2']++;
            } else if (protocol === 'CDTire') {
                protocolCounts['CDTire']++;
            } else if (protocol === 'Fire' || protocol === 'FTire') {
                protocolCounts['FTire']++;
            } else if (protocol === 'Custom') {
                protocolCounts['Custom']++;
            }
        });
        
        // Create chart
        createProtocolDistributionChart(protocolCounts);
        
        // Update legend
        updateProtocolLegend(protocolCounts);
        
    } catch (error) {
        console.error('❌ Error loading protocol distribution:', error);
        
        const chartCanvas = document.getElementById('protocolDistributionChart');
        if (chartCanvas) {
            const ctx = chartCanvas.getContext('2d');
            ctx.font = '14px Arial';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.fillText('Failed to load chart', chartCanvas.width / 2, chartCanvas.height / 2);
        }
    }
}

function createProtocolDistributionChart(protocolCounts) {
    const ctx = document.getElementById('protocolDistributionChart');
    
    if (!ctx) return;
    
    if (protocolDistributionChart) {
        protocolDistributionChart.destroy();
    }
    
    const labels = Object.keys(protocolCounts);
    const data = Object.values(protocolCounts);
    
    const colors = [
        '#6366f1', // MF6.2 - Indigo
        '#8b5cf6', // MF5.2 - Purple
        '#ef4444', // CDTire - Red
        '#10b981', // FTire - Green
        '#f59e0b'  // Custom - Orange
    ];
    
    protocolDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBorderWidth: 4,
                hoverBorderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 10,
                    titleFont: {
                        size: 12,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 11
                    },
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateProtocolLegend(protocolCounts) {
    const container = document.getElementById('protocolLegendList');
    
    if (!container) return;
    
    const colors = {
        'MF6.2': '#6366f1',
        'MF5.2': '#8b5cf6',
        'CDTire': '#ef4444',
        'FTire': '#10b981',
        'Custom': '#f59e0b'
    };
    
    container.innerHTML = Object.entries(protocolCounts).map(([protocol, count]) => {
        return `
            <div class="protocol-legend-item">
                <div class="protocol-legend-left">
                    <div class="protocol-color-dot" style="background-color: ${colors[protocol]}"></div>
                    <span class="protocol-name">${protocol}</span>
                </div>
                <span class="protocol-count">${count}</span>
            </div>
        `;
    }).join('');
}

async function refreshProtocolDistribution() {
    console.log('🔄 Refreshing protocol distribution...');
    await loadProtocolDistribution();
}

// ============================================
// DEPARTMENT DISTRIBUTION CHART (PCR & TBR)
// ============================================

let statusTrendChart = null;

async function loadStatusTrend() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects for department trend');
        }
        
        const data = await response.json();
        const projects = Array.isArray(data) ? data : (data.projects || []);
        
        // Group projects by department (only PCR and TBR)
        const departmentCounts = {
            'PCR': 0,
            'TBR': 0
        };
        
        projects.forEach(project => {
            const department = (project.department || '').toUpperCase();
            
            if (department === 'PCR') {
                departmentCounts['PCR']++;
            } else if (department === 'TBR') {
                departmentCounts['TBR']++;
            }
        });
        
        // Update department stats summary
        document.getElementById('trendPCR').textContent = departmentCounts['PCR'];
        document.getElementById('trendTBR').textContent = departmentCounts['TBR'];
        
        // Create bar chart
        createDepartmentTrendChart(departmentCounts);
        
    } catch (error) {
        console.error('❌ Error loading department trend:', error);
    }
}

function createDepartmentTrendChart(departmentCounts) {
    const ctx = document.getElementById('statusTrendChart');
    
    if (!ctx) return;
    
    // Destroy existing chart
    if (statusTrendChart) {
        statusTrendChart.destroy();
    }
    
    const data = {
        labels: ['PCR', 'TBR'],
        datasets: [{
            label: 'Projects',
            data: [
                departmentCounts['PCR'],
                departmentCounts['TBR']
            ],
            backgroundColor: [
                'rgba(99, 102, 241, 0.8)',   // PCR - Indigo
                'rgba(16, 185, 129, 0.8)'    // TBR - Green
            ],
            borderColor: [
                'rgba(99, 102, 241, 1)',
                'rgba(16, 185, 129, 1)'
            ],
            borderWidth: 2
        }]
    };
    
    statusTrendChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y', // Horizontal bars
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 10,
                    titleFont: {
                        size: 12,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 11
                    },
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.x + ' projects';
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 10
                        },
                        stepSize: 1
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                y: {
                    ticks: {
                        font: {
                            size: 11,
                            weight: '600'
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

async function refreshDepartmentTrend() {
    console.log('🔄 Refreshing department trend...');
    await loadStatusTrend();
}

// Make function globally accessible
window.refreshDepartmentTrend = refreshDepartmentTrend;
window.refreshStatusTrend = refreshDepartmentTrend;

// ============================================
// ACTIVITY STATISTICS BARS (NEW FEATURE #3)
// ============================================

// ============================================
// ADVANCED ACTIVITY STATISTICS
// ============================================

async function loadActivityStats() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects for stats');
        }
        
        const data = await response.json();
        const projects = Array.isArray(data) ? data : (data.projects || []);
        
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        // 1. Projects in last 7 days
        const last7DaysProjects = projects.filter(p => {
            const createdDate = new Date(p.created_at);
            return createdDate >= sevenDaysAgo;
        });
        
        // 2. Completed this week
        const weekCompletedProjects = projects.filter(p => {
            if (!p.completed_at) return false;
            const completedDate = new Date(p.completed_at);
            return completedDate >= weekStart;
        });
        
        // 3. Last activity time
        let lastActivityDate = null;
        projects.forEach(project => {
            const activityDate = project.completed_at ? new Date(project.completed_at) : new Date(project.created_at);
            if (!lastActivityDate || activityDate > lastActivityDate) {
                lastActivityDate = activityDate;
            }
        });
        
        // 4. Average completion time (in days)
        const completedProjects = projects.filter(p => p.status === 'Completed' && p.completed_at);
        let avgCompletionDays = 0;
        
        if (completedProjects.length > 0) {
            const totalDays = completedProjects.reduce((sum, p) => {
                const start = new Date(p.created_at);
                const end = new Date(p.completed_at);
                const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24));
                return sum + diffDays;
            }, 0);
            avgCompletionDays = Math.round(totalDays / completedProjects.length);
        }
        
        // 5. Fastest project this month
        const monthCompletedProjects = completedProjects.filter(p => {
            const completedDate = new Date(p.completed_at);
            return completedDate >= monthStart;
        });
        
        let fastestDays = 0;
        if (monthCompletedProjects.length > 0) {
            fastestDays = Math.min(...monthCompletedProjects.map(p => {
                const start = new Date(p.created_at);
                const end = new Date(p.completed_at);
                return Math.floor((end - start) / (1000 * 60 * 60 * 24));
            }));
        }
        
        // 6. Slowest project this month
        let slowestDays = 0;
        if (monthCompletedProjects.length > 0) {
            slowestDays = Math.max(...monthCompletedProjects.map(p => {
                const start = new Date(p.created_at);
                const end = new Date(p.completed_at);
                return Math.floor((end - start) / (1000 * 60 * 60 * 24));
            }));
        }
        
        // 7. Most used protocol
        const protocolCounts = {};
        projects.forEach(p => {
            const protocol = p.protocol || 'Unknown';
            protocolCounts[protocol] = (protocolCounts[protocol] || 0) + 1;
        });
        
        let mostUsedProtocol = '-';
        let maxCount = 0;
        Object.entries(protocolCounts).forEach(([protocol, count]) => {
            if (count > maxCount) {
                maxCount = count;
                mostUsedProtocol = protocol;
            }
        });
        
        // 8. Protocol success rate (completion rate)
        const totalProjects = projects.length;
        const completedCount = projects.filter(p => p.status === 'Completed').length;
        const successRate = totalProjects > 0 ? Math.round((completedCount / totalProjects) * 100) : 0;
        
        // Update UI
        document.getElementById('last7DaysCount').textContent = last7DaysProjects.length;
        document.getElementById('weekCompletedCount').textContent = weekCompletedProjects.length;
        
        if (lastActivityDate) {
            document.getElementById('lastActivityTime').textContent = formatRelativeTime(lastActivityDate);
        }
        
        document.getElementById('avgCompletionTime').textContent = avgCompletionDays;
        document.getElementById('fastestProject').textContent = fastestDays + 'd';
        document.getElementById('slowestProject').textContent = slowestDays + 'd';
        document.getElementById('mostUsedProtocol').textContent = mostUsedProtocol;
        document.getElementById('protocolSuccessRate').textContent = successRate + '%';
        
    } catch (error) {
        console.error('❌ Error loading activity stats:', error);
    }
}

async function refreshActivityStats() {
    console.log('🔄 Refreshing activity stats...');
    await loadActivityStats();
}

function updateBar(barId, countId, value, maxValue) {
    const percentage = Math.round((value / maxValue) * 100);
    
    const barElement = document.getElementById(barId);
    const countElement = document.getElementById(countId);
    
    if (barElement) {
        setTimeout(() => {
            barElement.style.width = percentage + '%';
        }, 100);
    }
    
    if (countElement) {
        countElement.textContent = value;
    }
}

async function refreshActivityStats() {
    console.log('🔄 Refreshing activity stats...');
    await loadActivityStats();
}

// ============================================
// RECENT PROJECT ACTIVITIES (Timeline Format)
// ============================================

// ============================================
// RECENT ACTIVITIES TIMELINE (First 5 Activities)
// ============================================

async function loadRecentActivities() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        // First, try to fetch from activity log API
        let activities = [];
        
        try {
            const activityResponse = await fetch('/api/activity-log', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (activityResponse.ok) {
                const activityData = await activityResponse.json();
                activities = Array.isArray(activityData) ? activityData : (activityData.activities || []);
            }
        } catch (error) {
            console.log('Activity log API not available, using projects data');
        }
        
        // If no activities from API, generate from projects
        if (activities.length === 0) {
            const projectsResponse = await fetch('/api/projects', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!projectsResponse.ok) {
                throw new Error('Failed to fetch projects');
            }
            
            const projectsData = await projectsResponse.json();
            const projects = Array.isArray(projectsData) ? projectsData : (projectsData.projects || []);
            
            // Generate activities from projects
            activities = generateActivitiesFromProjects(projects);
        }
        
        // Get first 5 most recent activities
        // ✅ FILTER OUT "Projects Loaded" activities
const filteredActivities = activities.filter(activity => {
    const action = (activity.action || '').toLowerCase();
    const description = (activity.description || '').toLowerCase();
    
    return !action.includes('projects loaded') && 
           !action.includes('project loaded') &&
           !description.includes('projects loaded') &&
           !description.includes('project loaded');
});

// Get first 5 most recent activities
const recentActivities = filteredActivities
    .sort((a, b) => {
        const dateA = new Date(a.timestamp || a.created_at);
        const dateB = new Date(b.timestamp || b.created_at);
        return dateB - dateA;
    })
    .slice(0, 5);

// Display activities timeline
displayRecentActivitiesTimeline(recentActivities);
        
    } catch (error) {
        console.error('❌ Error loading recent activities:', error);
        displayNoActivities();
    }
}

function generateActivitiesFromProjects(projects) {
    const activities = [];
    
    projects.forEach(project => {
        // Activity 1: Project Created
        activities.push({
            action: 'Created',
            description: `Created project ${project.project_name}`,
            timestamp: project.created_at,
            created_at: project.created_at,
            user_email: project.user_email,
            project_name: project.project_name,
            project_id: project.id
        });
        
        // Activity 2: Project Completed (if status is completed)
        if (project.status === 'Completed' && project.completed_at) {
            activities.push({
                action: 'Completed',
                description: `Completed project ${project.project_name}`,
                timestamp: project.completed_at,
                created_at: project.completed_at,
                user_email: project.user_email,
                project_name: project.project_name,
                project_id: project.id
            });
        }
        
        // Activity 3: Project In Progress (if status is in progress)
        if (project.status === 'In Progress') {
            activities.push({
                action: 'Updated',
                description: `Project ${project.project_name} in progress`,
                timestamp: project.updated_at || project.created_at,
                created_at: project.updated_at || project.created_at,
                user_email: project.user_email,
                project_name: project.project_name,
                project_id: project.id
            });
        }
    });
    
    return activities;
}

function displayRecentActivitiesTimeline(activities) {
    const container = document.getElementById('activitiesContainer');
    
    if (!container) return;
    
    if (!activities || activities.length === 0) {
        displayNoActivities();
        return;
    }
    
    container.innerHTML = activities.map((activity, index) => {
        const activityIcon = getActivityIcon(activity.action);
        const activityColor = getActivityColor(activity.action);
        const activityLabel = getActivityLabel(activity.action);
        const timestamp = activity.timestamp || activity.created_at;
        
        return `
            <div class="activity-timeline-event">
                <div class="activity-marker" style="background: ${activityColor}">
                    <i class="fas fa-${activityIcon}"></i>
                </div>
                <div class="activity-card">
                    <div class="activity-header">
                        <div class="activity-type-badge" style="background: ${activityColor}20; color: ${activityColor}">
                            ${activityLabel}
                        </div>
                        <div class="activity-time">${formatRelativeTime(timestamp)}</div>
                    </div>
                    <div class="activity-description">
                        ${escapeHtml(activity.description || activity.action)}
                    </div>
                    <div class="activity-meta">
                        ${activity.user_email ? `
                            <span class="activity-meta-item">
                                <i class="fas fa-user"></i>
                                ${extractUserName(activity.user_email)}
                            </span>
                        ` : ''}
                        ${activity.project_name ? `
                            <span class="activity-meta-item">
                                <i class="fas fa-folder"></i>
                                ${escapeHtml(activity.project_name)}
                            </span>
                        ` : ''}
                        ${activity.ip_address ? `
                            <span class="activity-meta-item">
                                <i class="fas fa-globe"></i>
                                ${activity.ip_address}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getActivityIcon(action) {
    const actionLower = (action || '').toLowerCase();
    
    const icons = {
        'create': 'plus-circle',
        'created': 'plus-circle',
        'update': 'edit',
        'updated': 'edit',
        'delete': 'trash',
        'deleted': 'trash',
        'complete': 'check-circle',
        'completed': 'check-circle',
        'view': 'eye',
        'viewed': 'eye',
        'download': 'download',
        'downloaded': 'download',
        'upload': 'upload',
        'uploaded': 'upload',
        'login': 'sign-in-alt',
        'logout': 'sign-out-alt',
        'export': 'file-export',
        'import': 'file-import'
    };
    
    return icons[actionLower] || 'circle-dot';
}

function getActivityColor(action) {
    const actionLower = (action || '').toLowerCase();
    
    const colors = {
        'create': '#3b82f6',     // Blue
        'created': '#3b82f6',
        'update': '#8b5cf6',     // Purple
        'updated': '#8b5cf6',
        'delete': '#ef4444',     // Red
        'deleted': '#ef4444',
        'complete': '#10b981',   // Green
        'completed': '#10b981',
        'view': '#64748b',       // Gray
        'viewed': '#64748b',
        'login': '#10b981',      // Green
        'logout': '#f59e0b',     // Orange
        'download': '#6366f1',   // Indigo
        'upload': '#8b5cf6'      // Purple
    };
    
    return colors[actionLower] || '#64748b';
}

function getActivityLabel(action) {
    const actionLower = (action || '').toLowerCase();
    
    const labels = {
        'create': 'Created',
        'created': 'Created',
        'update': 'Updated',
        'updated': 'Updated',
        'delete': 'Deleted',
        'deleted': 'Deleted',
        'complete': 'Completed',
        'completed': 'Completed',
        'view': 'Viewed',
        'viewed': 'Viewed',
        'download': 'Downloaded',
        'downloaded': 'Downloaded',
        'upload': 'Uploaded',
        'uploaded': 'Uploaded',
        'login': 'Login',
        'logout': 'Logout',
        'export': 'Exported',
        'import': 'Imported'
    };
    
    return labels[actionLower] || action;
}

function extractUserName(email) {
    if (!email) return 'Unknown User';
    
    const name = email.split('@')[0];
    
    return name
        .replace(/[._]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function displayNoActivities() {
    const container = document.getElementById('activitiesContainer');
    
    if (!container) return;
    
    container.innerHTML = `
        <div class="timeline-empty">
            <i class="fas fa-inbox"></i>
            <p>No recent activities found</p>
        </div>
    `;
}

async function refreshRecentActivities() {
    console.log('🔄 Refreshing recent activities...');
    await loadRecentActivities();
}

// Make function globally accessible
window.refreshRecentActivities = refreshRecentActivities;
// ============================================
// STATISTICS UPDATE
// ============================================

function updateStatistics() {
    const stats = {
        total: allProjects.length,
        completed: allProjects.filter(p => p.status === 'Completed').length,
        inProgress: allProjects.filter(p => p.status === 'In Progress').length,
        notStarted: allProjects.filter(p => p.status === 'Not Started').length
    };
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const previousMonthStart = new Date(currentYear, currentMonth - 1, 1);
    
    const currentMonthProjects = allProjects.filter(p => {
        const createdDate = new Date(p.created_at);
        return createdDate >= currentMonthStart;
    });
    
    const previousMonthProjects = allProjects.filter(p => {
        const createdDate = new Date(p.created_at);
        return createdDate >= previousMonthStart && createdDate < currentMonthStart;
    });
    
    const currentStats = {
        total: currentMonthProjects.length,
        completed: currentMonthProjects.filter(p => p.status === 'Completed').length,
        inProgress: currentMonthProjects.filter(p => p.status === 'In Progress').length,
        notStarted: currentMonthProjects.filter(p => p.status === 'Not Started').length
    };
    
    const prevStats = {
        total: previousMonthProjects.length,
        completed: previousMonthProjects.filter(p => p.status === 'Completed').length,
        inProgress: previousMonthProjects.filter(p => p.status === 'In Progress').length,
        notStarted: previousMonthProjects.filter(p => p.status === 'Not Started').length
    };
    
    const changes = {
        total: calculatePercentageChange(prevStats.total, currentStats.total),
        completed: calculatePercentageChange(prevStats.completed, currentStats.completed),
        inProgress: calculatePercentageChange(prevStats.inProgress, currentStats.inProgress),
        notStarted: calculatePercentageChange(prevStats.notStarted, currentStats.notStarted)
    };
    
    document.getElementById('totalProjects').textContent = stats.total;
    document.getElementById('completedProjects').textContent = stats.completed;
    document.getElementById('inProgressProjects').textContent = stats.inProgress;
    document.getElementById('notStartedProjects').textContent = stats.notStarted;
    
    updateStatChange('totalProjects', changes.total, currentStats.total, prevStats.total);
    updateStatChange('completedProjects', changes.completed, currentStats.completed, prevStats.completed);
    updateStatChange('inProgressProjects', changes.inProgress, currentStats.inProgress, prevStats.inProgress);
    updateStatChange('notStartedProjects', changes.notStarted, currentStats.notStarted, prevStats.notStarted);
    
    document.getElementById('userTotalProjects').textContent = stats.total;
    
    const completionRate = stats.total > 0 
        ? Math.round((stats.completed / stats.total) * 100) 
        : 0;
    document.getElementById('userCompletionRate').textContent = completionRate + '%';
}

function calculatePercentageChange(oldValue, newValue) {
    if (oldValue === 0 && newValue === 0) return 0;
    if (oldValue === 0 && newValue > 0) return 100;
    if (oldValue > 0 && newValue === 0) return -100;
    
    const change = ((newValue - oldValue) / oldValue) * 100;
    return Math.round(change);
}

function updateStatChange(statId, percentageChange, currentCount, previousCount) {
    const statCard = document.getElementById(statId).closest('.stat-card');
    if (!statCard) return;
    
    const statChangeEl = statCard.querySelector('.stat-change');
    if (!statChangeEl) return;
    
    statChangeEl.classList.remove('positive', 'negative', 'neutral');
    
    if (previousCount === 0 && currentCount === 0) {
        statChangeEl.classList.add('neutral');
        statChangeEl.innerHTML = `<i class="fas fa-minus"></i> No projects this month`;
        return;
    }
    
    if (previousCount === 0 && currentCount > 0) {
        statChangeEl.classList.add('positive');
        statChangeEl.innerHTML = `<i class="fas fa-arrow-up"></i> ${currentCount} new this month`;
        return;
    }
    
    let icon = 'fa-minus';
    let changeClass = 'neutral';
    let displayText = 'No change from last month';
    
    if (percentageChange > 0) {
        icon = 'fa-arrow-up';
        changeClass = 'positive';
        const diff = currentCount - previousCount;
        displayText = `+${diff} (${percentageChange}%) from last month`;
    } else if (percentageChange < 0) {
        icon = 'fa-arrow-down';
        changeClass = 'negative';
        const diff = previousCount - currentCount;
        displayText = `-${diff} (${Math.abs(percentageChange)}%) from last month`;
    } else if (currentCount > 0) {
        displayText = `Same as last month (${currentCount})`;
    }
    
    statChangeEl.classList.add(changeClass);
    statChangeEl.innerHTML = `<i class="fas ${icon}"></i> ${displayText}`;
}

// ============================================
// RECENT PROJECTS
// ============================================

function updateRecentProjects() {
    const container = document.getElementById('recentProjectsList');
    
    const recentProjects = [...allProjects]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
    
    if (recentProjects.length === 0) {
        container.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-folder-open"></i>
                <p>No projects found</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = recentProjects.map(project => {
        const statusClass = getStatusClass(project.status);
        const status = project.status.toLowerCase();
        
        return `
            <div class="project-item">
                <div class="project-header">
                    <div class="project-header-left">
                        <div class="project-title">${escapeHtml(project.project_name)}</div>
                        <div class="project-id">${formatProjectId(project.id, project.created_at)}</div>
                    </div>
                    <div class="project-header-right">
                        <span class="project-status ${statusClass}">${project.status}</span>
                        ${status === 'completed' ? `
                            <button class="action-btn btn-view" onclick="event.stopPropagation(); viewProject(${project.id})" title="View Project">
                                <i class="fas fa-eye"></i>
                            </button>
                        ` : `
                            <button class="action-btn btn-edit" onclick="event.stopPropagation(); editProject(${project.id})" title="Edit Project">
                                <i class="fas fa-edit"></i>
                            </button>
                        `}
                    </div>
                </div>
                
                <div class="project-meta" onclick="viewProjectDetails(${project.id})">
                    <div class="project-meta-item">
                        <i class="fas fa-layer-group"></i>
                        <span>${project.protocol}</span>
                    </div>
                    <div class="project-meta-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${project.region}</span>
                    </div>
                    <div class="project-meta-item">
                        <i class="fas fa-building"></i>
                        <span>${project.department}</span>
                    </div>
                    <div class="project-meta-item">
                        <i class="fas fa-calendar"></i>
                        <span>${formatRelativeTime(project.created_at)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Helper function for formatting project ID
function formatProjectId(id, createdAt) {
    if (!id) return 'N/A';
    return `#${id}`;
}

// Function to view project details
function viewProjectDetails(projectId) {
    window.location.href = `my-projects.html?id=${projectId}`;
}

// Function to view completed project
function viewProject(projectId) {
    window.location.href = `my-projects.html?id=${projectId}&view=readonly`;
}

// Function to edit project
function editProject(projectId) {
    window.location.href = `my-projects.html?id=${projectId}&edit=true`;
}

// Helper function for status icons
function getStatusIcon(status) {
    switch (status.toLowerCase()) {
        case 'completed':
            return 'fa-check-circle';
        case 'in progress':
            return 'fa-spinner fa-spin';
        case 'not started':
            return 'fa-clock';
        case 'archived':
            return 'fa-archive';
        default:
            return 'fa-question-circle';
    }
}

// Helper function for progress labels
function getProgressLabel(status) {
    switch (status.toLowerCase()) {
        case 'completed':
            return 'Completed';
        case 'in progress':
            return 'In Progress';
        case 'not started':
            return 'Not Started';
        case 'archived':
            return 'Archived';
        default:
            return 'Status Unknown';
    }
}

// Add this helper function to show current date/time and user
function addProjectMeta(project) {
    const currentDate = new Date().toISOString();
    const userLogin = 'ts3363'; // You can get this from your auth system
    
    return {
        ...project,
        meta: {
            last_updated: currentDate,
            updated_by: userLogin
        }
    };
}


// Add this helper function
function calculateCompletionPercentage(project) {
    switch (project.status.toLowerCase()) {
        case 'completed':
            return 100;
        case 'in progress':
            return 50;
        case 'not started':
            return 0;
        default:
            return 0;
    }
}

// Add this refresh function
async function refreshRecentProjects() {
    try {
        await loadDashboardData();
        showToast('Recent projects refreshed', 'success');
    } catch (error) {
        console.error('Error refreshing recent projects:', error);
        showToast('Failed to refresh recent projects', 'error');
    }
}

function getStatusClass(status) {
    const statusMap = {
        'Completed': 'status-completed',
        'In Progress': 'status-in-progress',
        'Not Started': 'status-not-started'
    };
    return statusMap[status] || 'status-not-started';
}

function viewProject(projectId) {
    // View always goes to select.html for completed projects
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    // Store context
    sessionStorage.setItem('currentProject', project.project_name);
    sessionStorage.setItem('currentProjectId', String(projectId));
    localStorage.setItem('currentProjectName', project.project_name);

    // For completed projects, always go to select.html
    window.location.href = `/select.html?projectId=${projectId}`;
}

function editProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) {
        showToast('Project not found', 'error');
        return;
    }

    console.log('📝 Editing project:', {
        id: projectId,
        name: project.project_name,
        status: project.status,
        protocol: project.protocol
    });

    // Store project context
    sessionStorage.setItem('currentProject', project.project_name);
    sessionStorage.setItem('currentProjectId', String(projectId));
    localStorage.setItem('currentProjectName', project.project_name);

    const status = (project.status || '').trim().toLowerCase();
    const protocol = (project.protocol || '').trim();

    // Route based on status
    if (status === 'completed') {
        // Completed projects -> view only mode
        window.location.href = `/select.html?projectId=${projectId}`;
        return;
    }

    // Not Started or In Progress -> go to protocol input page
    switch (protocol) {
        case 'MF62':
        case 'MF6.2':
            window.location.href = `/mf.html?projectId=${projectId}`;
            break;
        case 'MF52':
        case 'MF5.2':
            window.location.href = `/mf52.html?projectId=${projectId}`;
            break;
        case 'FTire':
            window.location.href = `/ftire.html?projectId=${projectId}`;
            break;
        case 'CDTire':
            window.location.href = `/cdtire.html?projectId=${projectId}`;
            break;
        case 'Custom':
            window.location.href = `/custom.html?projectId=${projectId}`;
            break;
        default:
            // Unknown protocol fallback
            window.location.href = `/select.html?projectId=${projectId}`;
            console.warn('⚠️ Unknown protocol:', protocol);
    }

    // Log project edit activity
    try {
        fetch('/api/activity-log', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                activity_type: 'Project',
                action: 'Project Opened for Edit',
                description: `Opened project "${project.project_name}" for editing (Status: ${status})`,
                status: 'success',
                metadata: {
                    project_id: projectId,
                    project_name: project.project_name,
                    status: status,
                    protocol: protocol
                }
            })
        });
    } catch (logError) {
        console.warn('Failed to log activity:', logError);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }

    const refreshBtn = document.getElementById('refreshDashboardBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshDashboard);
    }

    const hamburgerMenuBtn = document.getElementById('hamburgerMenuBtn');
    if (hamburgerMenuBtn) {
        hamburgerMenuBtn.addEventListener('click', toggleUserDetailsPanel);
    }

    const closePanelBtn = document.getElementById('closePanelBtn');
    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', closeUserDetailsPanel);
    }

    const panelOverlay = document.createElement('div');
    panelOverlay.className = 'panel-overlay';
    panelOverlay.id = 'panelOverlay';
    document.body.appendChild(panelOverlay);

    panelOverlay.addEventListener('click', closeUserDetailsPanel);
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    if (viewToggleBtn) {
        viewToggleBtn.addEventListener('click', toggleProjectView);
        // Set initial icon
        viewToggleBtn.innerHTML = `<i class="fas fa-${currentViewMode === 'grid' ? 'list' : 'grid-2'}"></i>`;
        viewToggleBtn.title = `Switch to ${currentViewMode === 'grid' ? 'list' : 'grid'} view`;
        viewToggleBtn.classList.toggle('grid-active', currentViewMode === 'grid')
    }
}

// Add these new functions
function toggleProjectView() {
    const projectsList = document.getElementById('recentProjectsList');
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    
    if (!projectsList || !viewToggleBtn) return;
    
    // Toggle view mode
    currentViewMode = currentViewMode === 'grid' ? 'list' : 'grid';
    
    // Update localStorage
    localStorage.setItem('projectViewMode', currentViewMode);
    
    // Update button icon and title
    viewToggleBtn.innerHTML = `<i class="fas fa-${currentViewMode === 'grid' ? 'list' : 'grid-2'}"></i>`;
    viewToggleBtn.title = `Switch to ${currentViewMode === 'grid' ? 'list' : 'grid'} view`;
    viewToggleBtn.classList.toggle('grid-active', currentViewMode === 'grid');
    
    // Update view classes
    projectsList.classList.remove('grid-view', 'list-view');
    projectsList.classList.add(`${currentViewMode}-view`);
    
    // Show toast notification
    showToast(`Switched to ${currentViewMode} view`, 'info');
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('userEmail');
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

function handleSearch(event) {
    const query = event.target.value.toLowerCase();
    
    if (!query) {
        updateRecentProjects();
        return;
    }
    
    const filteredProjects = allProjects.filter(project => 
        project.project_name.toLowerCase().includes(query) ||
        project.protocol.toLowerCase().includes(query) ||
        project.region.toLowerCase().includes(query) ||
        project.department.toLowerCase().includes(query)
    );
    
    const container = document.getElementById('recentProjectsList');
    
    if (filteredProjects.length === 0) {
        container.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-search"></i>
                <p>No projects found matching "${escapeHtml(query)}"</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredProjects.slice(0, 7).map(project => {
        const statusClass = getStatusClass(project.status);
        
        return `
            <div class="project-item" onclick="viewProject(${project.id})">
                <div class="project-header">
                    <div>
                        <div class="project-title">${escapeHtml(project.project_name)}</div>
                        <div class="project-id">#${project.id}</div>
                    </div>
                    <span class="project-status ${statusClass}">${project.status}</span>
                </div>
                <div class="project-meta">
                    <div class="project-meta-item">
                        <i class="fas fa-layer-group"></i>
                        <span>${project.protocol}</span>
                    </div>
                    <div class="project-meta-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${project.region}</span>
                    </div>
                    <div class="project-meta-item">
                        <i class="fas fa-building"></i>
                        <span>${project.department}</span>
                    </div>
                    <div class="project-meta-item">
                        <i class="fas fa-calendar"></i>
                        <span>${formatRelativeTime(project.created_at)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// REFRESH DASHBOARD
// ============================================

async function refreshDashboard() {
    const refreshBtn = document.getElementById('refreshDashboardBtn');
    
    try {
        if (refreshBtn) {
            refreshBtn.classList.add('spinning');
            refreshBtn.disabled = true;
        }
        
        console.log('🔄 Refreshing dashboard data...');
        showToast('Refreshing dashboard...', 'info');
        
        await Promise.all([
            loadUserData(),
            loadDashboardData()
        ]);
        
        console.log('✅ Dashboard refreshed successfully');
        showToast('Dashboard refreshed successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Error refreshing dashboard:', error);
        showToast('Failed to refresh dashboard', 'error');
    } finally {
        setTimeout(() => {
            if (refreshBtn) {
                refreshBtn.classList.remove('spinning');
                refreshBtn.disabled = false;
            }
        }, 1000);
    }
}

window.refreshDashboard = refreshDashboard;

// ============================================
// AUTO-REFRESH
// ============================================

function startAutoRefresh() {
    setInterval(() => {
        console.log('Auto-refreshing dashboard data...');
        loadDashboardData();
    }, 5 * 60 * 1000);
}

// ============================================
// USER DETAILS PANEL
// ============================================

async function toggleUserDetailsPanel() {
    const panel = document.getElementById('userDetailsPanel');
    const overlay = document.getElementById('panelOverlay');
    
    if (panel.classList.contains('active')) {
        closeUserDetailsPanel();
    } else {
        panel.classList.add('active');
        overlay.classList.add('active');
        await loadUserDetails();
    }
}

function closeUserDetailsPanel() {
    const panel = document.getElementById('userDetailsPanel');
    const overlay = document.getElementById('panelOverlay');
    
    panel.classList.remove('active');
    overlay.classList.remove('active');
}

async function loadUserDetails() {
    const userDetailsBody = document.getElementById('userDetailsBody');
    
    try {
        userDetailsBody.innerHTML = `
            <div class="loader">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <p style="text-align: center; color: var(--text-secondary);">Loading user details...</p>
        `;
        
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user details');
        }
        
        const data = await response.json();
        const user = data.user;
        
        if (!user) {
            throw new Error('No user data returned');
        }
        
        userDetailsBody.innerHTML = `
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-id-badge"></i> User ID
                </div>
                <div class="user-detail-value">#${user.id || 'N/A'}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-user"></i> Name
                </div>
                <div class="user-detail-value">${user.name || 'Not set'}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-envelope"></i> Email
                </div>
                <div class="user-detail-value">${user.email || 'N/A'}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-shield-alt"></i> Role
                </div>
                <div class="user-detail-value role-badge ${(user.role || 'engineer').toLowerCase()}">
                    ${user.role || 'Engineer'}
                </div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-calendar-plus"></i> Account Created
                </div>
                <div class="user-detail-value">${formatDate(user.created_at)}</div>
            </div>
            
            <div class="user-detail-item">
                <div class="user-detail-label">
                    <i class="fas fa-clock"></i> Last Login
                </div>
                <div class="user-detail-value">${formatRelativeTime(user.last_login)}</div>
            </div>
            
            <div class="user-stats-grid">
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-folder"></i>
                    </div>
                    <div class="stat-value">${allProjects.length}</div>
                    <div class="stat-label">Total Projects</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="stat-value">${allProjects.filter(p => p.status === 'Completed').length}</div>
                    <div class="stat-label">Completed</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-spinner"></i>
                    </div>
                    <div class="stat-value">${allProjects.filter(p => p.status === 'In Progress').length}</div>
                    <div class="stat-label">In Progress</div>
                </div>
                
                <div class="user-stat-card">
                    <div class="stat-icon">
                        <i class="fas fa-calendar"></i>
                    </div>
                    <div class="stat-value">${calculateDaysSinceJoined(user.created_at)}</div>
                    <div class="stat-label">Days Active</div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading user details:', error);
        userDetailsBody.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <div class="empty-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <h3>Failed to Load User Details</h3>
                <p>${error.message}</p>
                <button class="btn btn-primary" onclick="loadUserDetails()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>
        `;
    }
}

function calculateDaysSinceJoined(createdAt) {
    if (!createdAt) return 0;
    
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

window.toggleUserDetailsPanel = toggleUserDetailsPanel;
window.closeUserDetailsPanel = closeUserDetailsPanel;
window.loadUserDetails = loadUserDetails;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatRelativeTime(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'Just now';
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
        return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    }
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
        return `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
    }
    
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
        return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
    }
    
    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Format Project ID (PID-YYYY-XXXX)
function formatProjectId(id, createdDate) {
    if (!id) return 'PID-0000-0000';
    
    // Extract year from created_at date
    let year = new Date().getFullYear();
    if (createdDate) {
        const dateObj = new Date(createdDate);
        if (!isNaN(dateObj.getTime())) {
            year = dateObj.getFullYear();
        }
    }
    
    // Format: PID-YYYY-XXXX (e.g., PID-2025-0001)
    const paddedId = String(id).padStart(4, '0');
    return `PID-${year}-${paddedId}`;
}

// ============================================
// NOTIFICATION SYSTEM
// ============================================

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${getToastIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

function getToastIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// ============================================
// ERROR HANDLING
// ============================================

window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showToast('An error occurred. Please refresh the page.', 'error');
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('An error occurred while loading data.', 'error');
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', function(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        document.getElementById('searchInput').focus();
    }
    
    if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault();
        window.location.href = 'index.html';
    }
});

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================

console.log('%c Welcome to Apollo Tyres Dashboard! ', 'background: #6366f1; color: white; font-size: 16px; font-weight: bold; padding: 10px;');
console.log('%c Keyboard shortcuts: ', 'font-weight: bold; font-size: 14px;');
console.log('  Ctrl/Cmd + K: Focus search');
console.log('  Ctrl/Cmd + N: New project');

// ============================================
// END OF USER DASHBOARD JAVASCRIPT
// ============================================