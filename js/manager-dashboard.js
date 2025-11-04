// ============================================
// MANAGER DASHBOARD - JavaScript
// ============================================

// Global Variables
let currentManager = null;
let allUsers = [];
let allProjects = [];
let userActivityChart = null;
let projectDistributionChart = null;
let protocolUsageChart = null;
let teamPerformanceChart = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Manager Dashboard initializing...');
    
    // Check authentication
    await checkAuthentication();
    
    // Load manager data
    await loadManagerData();
    
    // Load dashboard data
    await loadDashboardData();
    
    // Initialize event listeners
    initializeEventListeners();

    // Clear autocomplete fields
    clearAutocompleteFields();  // ← ADD THIS LINE
    
    // Start auto-refresh
    startAutoRefresh();
});

// ============================================
// AUTHENTICATION
// ============================================

async function checkAuthentication() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            console.log('No authentication token found, redirecting to login...');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 100);
            return;
        }
        
        // Decode JWT to get role
        const payload = JSON.parse(atob(authToken.split('.')[1]));
        
        if (payload.role !== 'manager') {
            console.log('User is not a manager, redirecting to user dashboard...');
            setTimeout(() => {
                window.location.href = '/user-dashboard.html';
            }, 100);
            return;
        }
        
        console.log('Manager authenticated:', payload.email);
        
    } catch (error) {
        console.error('Authentication error:', error);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 100);
    }
}

// ============================================
// MANAGER DATA LOADING
// ============================================

async function loadManagerData() {
    try {
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch manager data');
        }
        
        const data = await response.json();
        currentManager = data.user;
        
        // Update UI with manager data
        updateManagerUI();
        
    } catch (error) {
        console.error('Error loading manager data:', error);
        
        // Fallback to JWT data
        const authToken = localStorage.getItem('authToken');
        if (authToken) {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            currentManager = {
                email: payload.email,
                role: payload.role,
                name: payload.email.split('@')[0]
            };
            updateManagerUI();
        }
    }
}

function updateManagerUI() {
    // Update manager name displays
    const managerNameElements = [
        document.getElementById('managerName'),
        document.getElementById('welcomeManagerName')
    ];
    
    const displayName = currentManager.name || currentManager.email.split('@')[0];
    
    managerNameElements.forEach(element => {
        if (element) {
            element.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        }
    });
    
    // Update manager avatar
    const managerAvatar = document.getElementById('managerAvatar');
    if (managerAvatar && currentManager.email) {
        managerAvatar.textContent = currentManager.email.charAt(0).toUpperCase();
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
        
        // Load users
        const usersResponse = await fetch('/api/manager/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!usersResponse.ok) {
            throw new Error('Failed to fetch users');
        }
        
        const usersData = await usersResponse.json();
        allUsers = usersData.success ? usersData.users : [];
        
        console.log('✅ Loaded', allUsers.length, 'users');
        
        // Load all projects
        const projectsResponse = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!projectsResponse.ok) {
            throw new Error('Failed to fetch projects');
        }
        
        const projectsData = await projectsResponse.json();
        allProjects = Array.isArray(projectsData) ? projectsData : (projectsData.projects || []);
        
        console.log('✅ Loaded', allProjects.length, 'projects');
        
        // Update dashboard components
        updateKPIs();
        updateUsersTable();
        updateCharts();
        
    } catch (error) {
        console.error('❌ Error loading dashboard data:', error);
        showToast('Failed to load dashboard data. Please refresh the page.', 'error');
    }
}

// ============================================
// KPI UPDATES
// ============================================

function updateKPIs() {
    // Total Engineers
    const totalEngineers = allUsers.length;
    document.getElementById('totalEngineers').textContent = totalEngineers;
// Removed totalUsersNav badge update
    
    // Total Projects
    const totalProjects = allProjects.length;
    document.getElementById('totalProjects').textContent = totalProjects;
    document.getElementById('totalProjectsNav').textContent = totalProjects;
    
    // Active Users (last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const activeUsers = allUsers.filter(user => {
        if (!user.last_login) return false;
        const lastLogin = new Date(user.last_login);
        return lastLogin >= sevenDaysAgo;
    }).length;
    
    document.getElementById('activeEngineers').textContent = activeUsers;
    
    // Completion Rate
    const completedProjects = allProjects.filter(p => p.status === 'Completed').length;
    const completionRate = totalProjects > 0 
        ? Math.round((completedProjects / totalProjects) * 100) 
        : 0;
    
    document.getElementById('completionRate').textContent = completionRate + '%';
    
    // Update change indicators (comparing with last month)
    updateKPIChanges();
}

function updateKPIChanges() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
    
    // Projects this month vs last month
    const currentMonthProjects = allProjects.filter(p => {
        const createdDate = new Date(p.created_at);
        return createdDate >= currentMonthStart;
    }).length;
    
    const lastMonthProjects = allProjects.filter(p => {
        const createdDate = new Date(p.created_at);
        return createdDate >= lastMonthStart && createdDate < currentMonthStart;
    }).length;
    
    const projectChange = lastMonthProjects > 0 
        ? Math.round(((currentMonthProjects - lastMonthProjects) / lastMonthProjects) * 100)
        : (currentMonthProjects > 0 ? 100 : 0);
    
    updateKPIChange('totalProjectsChange', projectChange, 'projects this month');
    
    // Users this month vs last month
    const currentMonthUsers = allUsers.filter(u => {
        const createdDate = new Date(u.created_at);
        return createdDate >= currentMonthStart;
    }).length;
    
    const lastMonthUsers = allUsers.filter(u => {
        const createdDate = new Date(u.created_at);
        return createdDate >= lastMonthStart && createdDate < currentMonthStart;
    }).length;
    
    const userChange = lastMonthUsers > 0 
        ? Math.round(((currentMonthUsers - lastMonthUsers) / lastMonthUsers) * 100)
        : (currentMonthUsers > 0 ? 100 : 0);
    
    updateKPIChange('totalEngineersChange', userChange, 'engineers this month');
}

function updateKPIChange(elementId, percentageChange, label) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.classList.remove('positive', 'negative');
    
    let icon = 'fa-minus';
    let changeClass = '';
    let displayText = `No change`;
    
    if (percentageChange > 0) {
        icon = 'fa-arrow-up';
        changeClass = 'positive';
        displayText = `+${percentageChange}% ${label}`;
    } else if (percentageChange < 0) {
        icon = 'fa-arrow-down';
        changeClass = 'negative';
        displayText = `${percentageChange}% ${label}`;
    } else {
        displayText = `No ${label}`;
    }
    
    if (changeClass) {
        element.classList.add(changeClass);
    }
    
    element.innerHTML = `<i class="fas ${icon}"></i> ${displayText}`;
}

// ============================================
// USERS TABLE
// ============================================

function updateUsersTable(filteredUsers = null) {
    const tbody = document.getElementById('usersTableBody');
    const users = filteredUsers || allUsers;
    
    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-spinner">
                    <i class="fas fa-inbox"></i>
                    <p>No engineers found</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = users.map(user => {
        const isActive = isUserActive(user.last_login);
        const statusBadge = isActive 
            ? '<span class="user-badge badge-engineer">Active</span>' 
            : '<span class="user-badge" style="background: rgba(149, 165, 166, 0.1); color: #7f8c8d;">Inactive</span>';
        
        const userName = user.name || 'Not Set';
        
        return `
            <tr>
                <td>
                    <span class="user-id-display">${user.id}</span>
                </td>
                <td>
                    <span style="font-weight: 600; color: var(--text-primary);">${userName}</span>
                </td>
                <td>
                    <span style="color: var(--text-secondary); font-size: 12px;">${user.email}</span>
                </td>
                <td>
                    <span class="user-badge ${user.role === 'manager' ? 'badge-manager' : 'badge-engineer'}">
                        ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                </td>
                <td style="text-align: center;">
                    <span style="font-weight: 700; color: var(--manager-accent); font-size: 14px;">
                        ${user.project_count || 0}
                    </span>
                </td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

function isUserActive(lastLogin) {
    if (!lastLogin) return false;
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const loginDate = new Date(lastLogin);
    
    return loginDate >= sevenDaysAgo;
}

// ============================================
// CHARTS
// ============================================

function updateCharts() {
    createUserActivityChart();
    createProjectDistributionChart();
    createProtocolUsageChart();
    createTeamPerformanceChart();
}

// User Activity Chart (Line Chart)
function createUserActivityChart() {
    const ctx = document.getElementById('userActivityChart');
    if (!ctx) return;
    
    if (userActivityChart) {
        userActivityChart.destroy();
    }
    
    // Get last 7 days of activity
    const labels = [];
    const loginData = [];
    const projectData = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        const dayStart = new Date(date.setHours(0, 0, 0, 0));
        const dayEnd = new Date(date.setHours(23, 59, 59, 999));
        
        // Count logins for this day
        const loginsCount = allUsers.filter(u => {
            if (!u.last_login) return false;
            const loginDate = new Date(u.last_login);
            return loginDate >= dayStart && loginDate <= dayEnd;
        }).length;
        
        loginData.push(loginsCount);
        
        // Count projects created this day
        const projectsCount = allProjects.filter(p => {
            const createdDate = new Date(p.created_at);
            return createdDate >= dayStart && createdDate <= dayEnd;
        }).length;
        
        projectData.push(projectsCount);
    }
    
    userActivityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'User Logins',
                    data: loginData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Projects Created',
                    data: projectData,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Project Distribution Chart (Doughnut)
function createProjectDistributionChart() {
    const ctx = document.getElementById('projectDistributionChart');
    if (!ctx) return;
    
    if (projectDistributionChart) {
        projectDistributionChart.destroy();
    }
    
    const statusCounts = {
        'Completed': 0,
        'In Progress': 0,
        'Not Started': 0
    };
    
    allProjects.forEach(project => {
        const status = project.status || 'Not Started';
        if (statusCounts.hasOwnProperty(status)) {
            statusCounts[status]++;
        }
    });
    
    projectDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: [
                    '#27ae60',
                    '#f39c12',
                    '#3498db'
                ],
                borderWidth: 3,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                }
            }
        }
    });
}

// Protocol Usage Chart (Bar)
function createProtocolUsageChart() {
    const ctx = document.getElementById('protocolUsageChart');
    if (!ctx) return;
    
    if (protocolUsageChart) {
        protocolUsageChart.destroy();
    }
    
    const protocolCounts = {};
    
    allProjects.forEach(project => {
        const protocol = project.protocol || 'Unknown';
        protocolCounts[protocol] = (protocolCounts[protocol] || 0) + 1;
    });
    
    protocolUsageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(protocolCounts),
            datasets: [{
                label: 'Projects',
                data: Object.values(protocolCounts),
                backgroundColor: [
                    '#3498db',
                    '#e74c3c',
                    '#f39c12',
                    '#27ae60',
                    '#9b59b6'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Team Performance Chart (Line)
function createTeamPerformanceChart() {
    const ctx = document.getElementById('teamPerformanceChart');
    if (!ctx) return;
    
    if (teamPerformanceChart) {
        teamPerformanceChart.destroy();
    }
    
    // Get top 5 engineers by project count
    const userProjectCounts = allUsers.map(user => ({
        email: user.email,
        count: user.project_count || 0
    })).sort((a, b) => b.count - a.count).slice(0, 5);
    
    teamPerformanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: userProjectCounts.map(u => u.email.split('@')[0]),
            datasets: [{
                label: 'Projects',
                data: userProjectCounts.map(u => u.count),
                backgroundColor: '#e74c3c',
                borderColor: '#c0392b',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}


// ============================================
// ADD ENGINEER FUNCTIONALITY
// ============================================

function initializeEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshDashboardBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshDashboard);
    }
    
    // Add engineer button
    const addEngineerBtn = document.getElementById('addEngineerBtn');
    if (addEngineerBtn) {
        addEngineerBtn.addEventListener('click', handleAddEngineer);
    }
    
    // Search users
    const searchInput = document.getElementById('searchUsers');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearchUsers);
    }
    
    // Enter key on add engineer form
    // Enter key on add engineer form
const nameInput = document.getElementById('newEngineerName');
const emailInput = document.getElementById('newEngineerEmail');
const passwordInput = document.getElementById('newEngineerPassword');

if (nameInput && emailInput && passwordInput) {
    [nameInput, emailInput, passwordInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleAddEngineer();
                }
            });
        });
    }
}

function initializeEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshDashboardBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshDashboard);
    }
    
    // Add engineer button
    const addEngineerBtn = document.getElementById('addEngineerBtn');
    if (addEngineerBtn) {
        addEngineerBtn.addEventListener('click', handleAddEngineer);
    }
    
    // Search users
    const searchInput = document.getElementById('searchUsers');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearchUsers);
    }
    
    // Enter key on add engineer form
    const nameInput = document.getElementById('newEngineerName');
    const emailInput = document.getElementById('newEngineerEmail');
    const passwordInput = document.getElementById('newEngineerPassword');
    
    if (nameInput && emailInput && passwordInput) {
        [nameInput, emailInput, passwordInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleAddEngineer();
                }
            });
        });
    }
    
    // Initialize global search
    initializeGlobalSearch(); // ← ADD THIS LINE
}

async function handleAddEngineer() {
    const nameInput = document.getElementById('newEngineerName');
    const emailInput = document.getElementById('newEngineerEmail');
    const passwordInput = document.getElementById('newEngineerPassword');
    const messageDiv = document.getElementById('addUserMessage');
    const addBtn = document.getElementById('addEngineerBtn');
    
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Validation
    // Validation
if (!name || !email || !password) {
    showFormMessage('Please enter name, email, and password', 'error');
    return;
}

if (name.length < 2) {
    showFormMessage('Name must be at least 2 characters', 'error');
    return;
}

if (!isValidEmail(email)) {
    showFormMessage('Please enter a valid email address', 'error');
    return;
}
    
    if (password.length < 6) {
        showFormMessage('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        addBtn.disabled = true;
        addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/manager/add-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
    name: name,
    email: email,
    password: password,
    role: 'engineer'
})
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showFormMessage('Engineer added successfully!', 'success');
nameInput.value = '';
emailInput.value = '';
passwordInput.value = '';
            
            // Reload dashboard data
            await loadDashboardData();
        } else {
            showFormMessage(data.message || 'Failed to add engineer', 'error');
        }
        
    } catch (error) {
        console.error('Error adding engineer:', error);
        showFormMessage('An error occurred while adding engineer', 'error');
    } finally {
        addBtn.disabled = false;
        addBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Engineer';
    }
}

function showFormMessage(message, type) {
    const messageDiv = document.getElementById('addUserMessage');
    if (!messageDiv) return;
    
    messageDiv.textContent = message;
    messageDiv.className = 'form-message ' + type;
    messageDiv.style.display = 'block';
    messageDiv.style.padding = '12px';
    messageDiv.style.borderRadius = '8px';
    messageDiv.style.marginBottom = '15px';
    messageDiv.style.fontWeight = '600';
    
    if (type === 'success') {
        messageDiv.style.background = 'rgba(39, 174, 96, 0.1)';
        messageDiv.style.color = '#27ae60';
        messageDiv.style.border = '1px solid rgba(39, 174, 96, 0.3)';
    } else if (type === 'error') {
        messageDiv.style.background = 'rgba(231, 76, 60, 0.1)';
        messageDiv.style.color = '#e74c3c';
        messageDiv.style.border = '1px solid rgba(231, 76, 60, 0.3)';
    }
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

function handleSearchUsers(event) {
    const query = event.target.value.toLowerCase();
    
    if (!query) {
        updateUsersTable();
        return;
    }
    
    const filteredUsers = allUsers.filter(user => 
        user.email.toLowerCase().includes(query)
    );
    
    updateUsersTable(filteredUsers);
}

// ============================================
// GLOBAL SEARCH FUNCTIONALITY
// ============================================

function initializeGlobalSearch() {
    const globalSearchInput = document.getElementById('globalSearchInput');
    
    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', handleGlobalSearch);
    }
}

function handleGlobalSearch(event) {
    const query = event.target.value.toLowerCase().trim();
    
    if (!query) {
        // Reset all views
        updateUsersTable();
        return;
    }
    
    // Search users
    const filteredUsers = allUsers.filter(user => 
        user.email.toLowerCase().includes(query) ||
        (user.name && user.name.toLowerCase().includes(query)) ||
        user.id.toLowerCase().includes(query)
    );
    
    updateUsersTable(filteredUsers);
    
    // Visual feedback
    if (filteredUsers.length === 0) {
        showToast(`No results found for "${query}"`, 'info');
    }
}

// ============================================
// CLEAR AUTOCOMPLETE ON PAGE LOAD
// ============================================

function clearAutocompleteFields() {
    // Clear autocomplete multiple times to ensure it works
    const clearInputs = () => {
        const nameInput = document.getElementById('newEngineerName');
        const emailInput = document.getElementById('newEngineerEmail');
        const passwordInput = document.getElementById('newEngineerPassword');
        const searchInput = document.getElementById('searchUsers');
        
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (nameInput) nameInput.value = '';
        if (searchInput) searchInput.value = '';
    };
    
    // Clear immediately
    clearInputs();
    
    // Clear after 100ms
    setTimeout(clearInputs, 100);
    
    // Clear after 500ms (for persistent autocomplete)
    setTimeout(clearInputs, 500);
    
    // Clear after 1 second (final check)
    setTimeout(clearInputs, 1000);
}
// ============================================
// REFRESH FUNCTIONALITY
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
        
        await loadDashboardData();
        
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

// Individual chart refresh functions
window.refreshUserActivityChart = function() {
    createUserActivityChart();
    showToast('User activity chart refreshed', 'success');
};

window.refreshProjectDistributionChart = function() {
    createProjectDistributionChart();
    showToast('Project distribution chart refreshed', 'success');
};

window.refreshProtocolUsageChart = function() {
    createProtocolUsageChart();
    showToast('Protocol usage chart refreshed', 'success');
};

window.refreshTeamPerformanceChart = function() {
    createTeamPerformanceChart();
    showToast('Team performance chart refreshed', 'success');
};

// ============================================
// AUTO-REFRESH
// ============================================

function startAutoRefresh() {
    // Refresh every 5 minutes
    setInterval(() => {
        console.log('Auto-refreshing dashboard data...');
        loadDashboardData();
    }, 5 * 60 * 1000);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('userEmail');
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

window.scrollToSection = scrollToSection;

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
    
    if (diffInSeconds < 60) return 'Just now';
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return `${diffInWeeks}w ago`;
    
    return formatDate(dateString);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
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

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        transition: opacity 0.3s;
    `;
    
    // Set background color based on type
    const colors = {
        'success': '#27ae60',
        'error': '#e74c3c',
        'warning': '#f39c12',
        'info': '#3498db'
    };
    
    toast.style.background = colors[type] || colors['info'];
    
    // Set icon
    const icons = {
        'success': 'fa-check-circle',
        'error': 'fa-exclamation-circle',
        'warning': 'fa-exclamation-triangle',
        'info': 'fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="fas ${icons[type] || icons['info']}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================

console.log('%c Manager Dashboard Loaded! ', 'background: #e74c3c; color: white; font-size: 16px; font-weight: bold; padding: 10px;');
console.log('%c Monitor your team and system performance ', 'font-size: 14px; color: #2c3e50;');

// ============================================
// END OF MANAGER DASHBOARD JAVASCRIPT
// ============================================