// ============================================
// ALL PROJECTS - JavaScript
// ============================================

// Global Variables
let currentManager = null;
let allProjects = [];
let filteredProjects = [];
let currentPage = 1;
let itemsPerPage = 25;
let totalPages = 1;

// Chart instances
let departmentChart = null;
let engineerChart = null;
let timelineChart = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('All Projects page initializing...');
    
    // Check authentication
    await checkAuthentication();
    
    // Load manager data
    await loadManagerData();
    
    // Load all data
    await loadAllData();
    
    // Initialize event listeners
    initializeEventListeners();
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
    const managerName = document.getElementById('managerName');
    const managerAvatar = document.getElementById('managerAvatar');
    
    const displayName = currentManager.name || currentManager.email.split('@')[0];
    
    if (managerName) {
        managerName.textContent = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
    
    if (managerAvatar && currentManager.email) {
        managerAvatar.textContent = currentManager.email.charAt(0).toUpperCase();
    }
}

// ============================================
// LOAD ALL DATA
// ============================================

async function loadAllData() {
    try {
        // Load My Projects first
        await loadMyProjects();
        
        // Load All Projects
        await loadAllProjects();
        
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// ============================================
// LOAD MANAGER'S OWN PROJECTS
// ============================================

async function loadMyProjects() {
    try {
        const authToken = localStorage.getItem('authToken');
        const managerEmail = currentManager.email;
        
        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        
        const allProjectsData = await response.json();
        
        // Filter only manager's own projects
        const myProjects = allProjectsData.filter(p => p.user_email === managerEmail);
        
        console.log('Manager projects loaded:', myProjects.length);
        
        displayMyProjects(myProjects);
        
    } catch (error) {
        console.error('Error loading manager projects:', error);
        const gridView = document.getElementById('myProjectsGrid');
        if (gridView) {
            gridView.innerHTML = `
                <div class="my-projects-empty">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Failed to Load Projects</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

function displayMyProjects(projects) {
    const gridView = document.getElementById('myProjectsGrid');
    const listView = document.getElementById('myProjectsList');
    const tableBody = document.getElementById('myProjectsTableBody');
    
    if (!gridView || !tableBody) return;
    
    if (projects.length === 0) {
        gridView.innerHTML = `
            <div class="my-projects-empty">
                <i class="fas fa-folder-open"></i>
                <h3>No Projects Yet</h3>
                <p>You haven't created any projects as a manager.</p>
            </div>
        `;
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    No projects found
                </td>
            </tr>
        `;
        return;
    }
    
    // Grid View
    gridView.innerHTML = projects.map(project => {
        const isCompleted = project.status === 'Completed';
        const isNotStarted = project.status === 'Not Started';
        const isInProgress = project.status === 'In Progress';
        
        // Determine button configuration based on status
        let actionButtons = '';
        
        if (isCompleted) {
            // Completed: View + Delete
            actionButtons = `
                <button class="btn-view" onclick="event.stopPropagation(); viewCompletedProject(${project.id})">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteMyProject(${project.id})" style="background: #e74c3c;">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        } else if (isNotStarted) {
            // Not Started: Edit + Delete
            actionButtons = `
                <button class="btn-edit" onclick="event.stopPropagation(); editNotStartedProject(${project.id}, '${project.protocol}')" style="background: #f39c12;">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteMyProject(${project.id})" style="background: #e74c3c;">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        } else if (isInProgress) {
            // In Progress: Edit + Delete
            actionButtons = `
                <button class="btn-edit" onclick="event.stopPropagation(); editInProgressProject(${project.id})" style="background: #f39c12;">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteMyProject(${project.id})" style="background: #e74c3c;">
                    <i class="fas fa-trash"></i> Delete
                </button>
            `;
        }
        
        return `
            <div class="my-project-card">
                <div class="my-project-card-header">
                    <span class="my-project-id">#${project.id}</span>
                    <span class="my-project-status status-${(project.status || 'not-started').toLowerCase().replace(/\s+/g, '-')}">
                        ${project.status || 'Not Started'}
                    </span>
                </div>
                <div class="my-project-name">${escapeHtml(project.project_name)}</div>
                <div class="my-project-meta">
                    <div><i class="fas fa-layer-group"></i> ${project.protocol}</div>
                    <div><i class="fas fa-building"></i> ${project.department}</div>
                    <div><i class="fas fa-globe"></i> ${project.region}</div>
                    <div><i class="fas fa-calendar"></i> ${formatDate(project.created_at)}</div>
                </div>
                <div class="my-project-actions">
                    ${actionButtons}
                </div>
                <div class="my-project-menu">
                    <button class="menu-btn" onclick="event.stopPropagation(); toggleProjectMenu(${project.id})">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="menu-dropdown" id="menu-${project.id}">
                        <button onclick="event.stopPropagation(); renameProject(${project.id}, '${escapeHtml(project.project_name).replace(/'/g, "\\'")}')">
                            <i class="fas fa-edit"></i> Rename
                        </button>
                        <button onclick="event.stopPropagation(); markAsCompleted(${project.id})">
                            <i class="fas fa-check-circle"></i> Mark as Completed
                        </button>
                        <button onclick="event.stopPropagation(); archiveMyProject(${project.id})">
                            <i class="fas fa-archive"></i> Archive
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // List View
    tableBody.innerHTML = projects.map(project => {
        const isCompleted = project.status === 'Completed';
        const isNotStarted = project.status === 'Not Started';
        const isInProgress = project.status === 'In Progress';
        
        let actionButtons = '';
        
        if (isCompleted) {
            actionButtons = `
                <button class="btn-view-details" onclick="event.stopPropagation(); viewCompletedProject(${project.id})">
                    <i class="fas fa-eye"></i> View
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteMyProject(${project.id})" style="background: #e74c3c; margin-left: 5px;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else if (isNotStarted) {
            actionButtons = `
                <button class="btn-edit" onclick="event.stopPropagation(); editNotStartedProject(${project.id}, '${project.protocol}')" style="background: #f39c12;">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteMyProject(${project.id})" style="background: #e74c3c; margin-left: 5px;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else if (isInProgress) {
            actionButtons = `
                <button class="btn-edit" onclick="event.stopPropagation(); editInProgressProject(${project.id})" style="background: #f39c12;">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-delete" onclick="event.stopPropagation(); deleteMyProject(${project.id})" style="background: #e74c3c; margin-left: 5px;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        }
        
        return `
            <tr>
                <td class="project-id">#${project.id}</td>
                <td class="project-name">${escapeHtml(project.project_name)}</td>
                <td>
                    <span class="protocol-badge protocol-${project.protocol.toLowerCase()}">
                        ${project.protocol}
                    </span>
                </td>
                <td>
                    <span class="status-badge status-${(project.status || 'not-started').toLowerCase().replace(/\s+/g, '-')}">
                        ${project.status || 'Not Started'}
                    </span>
                </td>
                <td>${project.department}</td>
                <td>${project.region}</td>
                <td>${formatDate(project.created_at)}</td>
                <td>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        ${actionButtons}
                        <button class="menu-btn" onclick="event.stopPropagation(); toggleProjectMenu(${project.id})" style="padding: 8px; background: #95a5a6;">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="menu-dropdown" id="menu-${project.id}" style="position: absolute; right: 20px;">
                            <button onclick="event.stopPropagation(); renameProject(${project.id}, '${escapeHtml(project.project_name).replace(/'/g, "\\'")}')">
                                <i class="fas fa-edit"></i> Rename
                            </button>
                            <button onclick="event.stopPropagation(); markAsCompleted(${project.id})">
                                <i class="fas fa-check-circle"></i> Mark as Completed
                            </button>
                            <button onclick="event.stopPropagation(); archiveMyProject(${project.id})">
                                <i class="fas fa-archive"></i> Archive
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// MY PROJECTS - ACTION FUNCTIONS
// ============================================

// Global variables for modal state
let currentProjectIdForAction = null;
let currentProjectNameForAction = null;

// Toggle dropdown menu for project actions
function toggleProjectMenu(projectId) {
    const menu = document.getElementById(`menu-${projectId}`);
    if (!menu) return;
    
    // Close all other menus first
    document.querySelectorAll('.menu-dropdown').forEach(m => {
        if (m.id !== `menu-${projectId}`) {
            m.classList.remove('active');
        }
    });
    
    menu.classList.toggle('active');
}

// Close menus when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.my-project-menu')) {
        document.querySelectorAll('.menu-dropdown').forEach(menu => {
            menu.classList.remove('active');
        });
    }
});

// ============================================
// RENAME PROJECT MODAL
// ============================================

function renameProject(projectId, currentName) {
    currentProjectIdForAction = projectId;
    currentProjectNameForAction = currentName;
    
    // Set current name in input
    const input = document.getElementById('newProjectName');
    if (input) {
        input.value = currentName;
        
        // Open modal
        const modal = document.getElementById('renameModal');
        const overlay = document.getElementById('renameModalOverlay');
        
        if (modal && overlay) {
            modal.classList.add('active');
            overlay.classList.add('active');
            
            // Focus input after animation
            setTimeout(() => {
                input.focus();
                input.select();
            }, 300);
        }
    }
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    const overlay = document.getElementById('renameModalOverlay');
    
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    
    currentProjectIdForAction = null;
    currentProjectNameForAction = null;
}

async function confirmRename() {
    const input = document.getElementById('newProjectName');
    const newName = input ? input.value.trim() : '';
    
    if (!newName || newName.length < 3) {
        showToast('⚠️ Project name must be at least 3 characters long', 'warning');
        return;
    }
    
    if (newName === currentProjectNameForAction) {
        closeRenameModal();
        showToast('ℹ️ Project name unchanged', 'info');
        return;
    }
    
    // Disable button during request
    const confirmBtn = document.querySelector('#renameModal .btn-confirm');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Renaming...';
    }
    
    try {
        console.log(`Attempting to rename project ${currentProjectIdForAction} to "${newName}"`);
        
        const response = await fetch(`/api/projects/${currentProjectIdForAction}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_name: newName
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to rename project');
        }
        
        console.log('✅ Project renamed successfully:', data);
        
        closeRenameModal();
        showToast('✅ Project renamed successfully', 'success');
        
        // Reload data to reflect changes
        await loadAllData();
        
    } catch (error) {
        console.error('❌ Error renaming project:', error);
        showToast(`❌ ${error.message}`, 'error');
    } finally {
        // Re-enable button
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Rename';
        }
    }
}

// Allow Enter key to submit rename
document.addEventListener('DOMContentLoaded', function() {
    const input = document.getElementById('newProjectName');
    if (input) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                confirmRename();
            }
        });
    }
});

// ============================================
// MARK AS COMPLETED MODAL
// ============================================

function markAsCompleted(projectId) {
    currentProjectIdForAction = projectId;
    
    // Open modal
    const modal = document.getElementById('completedModal');
    const overlay = document.getElementById('completedModalOverlay');
    
    if (modal && overlay) {
        modal.classList.add('active');
        overlay.classList.add('active');
    }
}

function closeCompletedModal() {
    const modal = document.getElementById('completedModal');
    const overlay = document.getElementById('completedModalOverlay');
    
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    
    currentProjectIdForAction = null;
}

async function confirmMarkCompleted() {
    if (!currentProjectIdForAction) return;
    
    // Disable button during request
    const confirmBtn = document.querySelector('#completedModal .btn-confirm');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    }
    
    try {
        console.log(`Marking project ${currentProjectIdForAction} as completed`);
        
        const response = await fetch(`/api/projects/${currentProjectIdForAction}/status`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'Completed'
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to update project status');
        }
        
        console.log('✅ Project marked as completed:', data);
        
        closeCompletedModal();
        showToast('✅ Project marked as completed', 'success');
        
        await loadAllData();
        
    } catch (error) {
        console.error('❌ Error updating project status:', error);
        showToast(`❌ ${error.message}`, 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Yes, Mark as Completed';
        }
    }
}

// ============================================
// ARCHIVE PROJECT MODAL
// ============================================

function archiveMyProject(projectId) {
    currentProjectIdForAction = projectId;
    
    // Open modal
    const modal = document.getElementById('archiveModal');
    const overlay = document.getElementById('archiveModalOverlay');
    
    if (modal && overlay) {
        modal.classList.add('active');
        overlay.classList.add('active');
    }
}

function closeArchiveModal() {
    const modal = document.getElementById('archiveModal');
    const overlay = document.getElementById('archiveModalOverlay');
    
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    
    currentProjectIdForAction = null;
}

async function confirmArchive() {
    if (!currentProjectIdForAction) return;
    
    // Disable button during request
    const confirmBtn = document.querySelector('#archiveModal .btn-confirm');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Archiving...';
    }
    
    try {
        console.log(`Archiving project ${currentProjectIdForAction}`);
        
        const response = await fetch(`/api/projects/${currentProjectIdForAction}/status`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'Archived'
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || data.details || 'Failed to archive project');
        }
        
        console.log('✅ Project archived:', data);
        
        closeArchiveModal();
        showToast('✅ Project archived successfully', 'success');
        
        await loadAllData();
        
    } catch (error) {
        console.error('❌ Error archiving project:', error);
        showToast(`❌ ${error.message}`, 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-archive"></i> Yes, Archive';
        }
    }
}

// ============================================
// DELETE PROJECT MODAL
// ============================================

function deleteMyProject(projectId) {
    currentProjectIdForAction = projectId;
    
    // Open modal
    const modal = document.getElementById('deleteModal');
    const overlay = document.getElementById('deleteModalOverlay');
    
    if (modal && overlay) {
        modal.classList.add('active');
        overlay.classList.add('active');
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    const overlay = document.getElementById('deleteModalOverlay');
    
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    
    currentProjectIdForAction = null;
}

async function confirmDelete() {
    if (!currentProjectIdForAction) return;
    
    try {
        const response = await fetch(`/api/projects/${currentProjectIdForAction}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete project');
        }
        
        closeDeleteModal();
        showToast('✅ Project deleted successfully', 'success');
        await loadAllData();
        
    } catch (error) {
        console.error('Error deleting project:', error);
        showToast('❌ Failed to delete project', 'error');
    }
}

// Close modals on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeRenameModal();
        closeCompletedModal();
        closeArchiveModal();
        closeDeleteModal();
    }
});

// Close modals when clicking on overlay
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('custom-modal-overlay')) {
        closeRenameModal();
        closeCompletedModal();
        closeArchiveModal();
        closeDeleteModal();
    }
});

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

// View Completed Project - Opens select.html
function viewCompletedProject(projectId) {
    localStorage.setItem('currentProjectId', projectId);
    window.location.href = `/select.html?projectId=${projectId}&mode=view`;
}

// Edit Not Started Project - Opens respective protocol input page
function editNotStartedProject(projectId, protocol) {
    localStorage.setItem('currentProjectId', projectId);
    
    let protocolPage = '';
    
    switch(protocol) {
        case 'MF62':
            protocolPage = 'mf62.html';
            break;
        case 'MF52':
            protocolPage = 'mf52.html';
            break;
        case 'FTire':
            protocolPage = 'ftire.html';
            break;
        case 'CDTire':
            protocolPage = 'cdtire.html';
            break;
        case 'Custom':
            protocolPage = 'custom.html';
            break;
        default:
            showToast('❌ Unknown protocol type', 'error');
            return;
    }
    
    window.location.href = `/${protocolPage}?projectId=${projectId}&mode=edit`;
}

// Edit In Progress Project - Opens select.html with run buttons enabled
function editInProgressProject(projectId) {
    localStorage.setItem('currentProjectId', projectId);
    window.location.href = `/select.html?projectId=${projectId}&mode=edit`;
}


// Toggle between grid and list view for My Projects
function toggleMyProjectsView(view) {
    const gridView = document.getElementById('myProjectsGrid');
    const listView = document.getElementById('myProjectsList');
    const gridBtn = document.getElementById('myProjectsGridBtn');
    const listBtn = document.getElementById('myProjectsListBtn');
    
    if (!gridView || !listView || !gridBtn || !listBtn) return;
    
    if (view === 'grid') {
        gridView.style.display = 'grid';
        listView.style.display = 'none';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
    } else {
        gridView.style.display = 'none';
        listView.style.display = 'block';
        gridBtn.classList.remove('active');
        listBtn.classList.add('active');
    }
}

// ============================================
// LOAD ALL PROJECTS
// ============================================

async function loadAllProjects() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token');
        }
        
        // Show loading state
        showLoadingState();
        
        // Fetch all projects (managers see all projects)
        const response = await fetch('/api/projects', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        
        const data = await response.json();
        allProjects = Array.isArray(data) ? data : [];
        filteredProjects = [...allProjects];
        
        console.log('✅ Loaded', allProjects.length, 'projects');
        
        // Update all components
        updateKPIs();
        populateFilters();
        updateCharts();
        updateProjectsTable();
        updateLastUpdated();
        
    } catch (error) {
        console.error('❌ Error loading projects:', error);
        showToast('Failed to load projects. Please refresh the page.', 'error');
    }
}

// ============================================
// UPDATE KPIs
// ============================================

function updateKPIs() {
    // Total Projects
    const totalProjects = allProjects.length;
    const totalProjectsEl = document.getElementById('totalProjects');
    if (totalProjectsEl) totalProjectsEl.textContent = totalProjects;
    
    // Pending Projects (Not Started)
    const pendingProjects = allProjects.filter(p => 
        p.status === 'Not Started'
    ).length;
    const pendingProjectsEl = document.getElementById('pendingProjects');
    if (pendingProjectsEl) pendingProjectsEl.textContent = pendingProjects;
    
    // Active Projects (In Progress)
    const activeProjects = allProjects.filter(p => 
        p.status === 'In Progress'
    ).length;
    const activeProjectsEl = document.getElementById('activeProjects');
    if (activeProjectsEl) activeProjectsEl.textContent = activeProjects;
    
    // Completed Projects
    const completedProjects = allProjects.filter(p => 
        p.status === 'Completed'
    ).length;
    const completedProjectsEl = document.getElementById('completedProjects');
    if (completedProjectsEl) completedProjectsEl.textContent = completedProjects;
    
    // Completion Rate
    const completionRate = totalProjects > 0 
        ? ((completedProjects / totalProjects) * 100).toFixed(1) 
        : '0.0';
    const completionRateEl = document.getElementById('completionRate');
    if (completionRateEl) completionRateEl.textContent = `${completionRate}%`;
}

// ============================================
// POPULATE FILTERS
// ============================================

function populateFilters() {
    // Engineer Filter
    const engineerFilter = document.getElementById('engineerFilter');
    if (engineerFilter) {
        const uniqueEngineers = [...new Set(allProjects.map(p => p.user_email))].sort();
        
        engineerFilter.innerHTML = '<option value="all">All Engineers</option>';
        uniqueEngineers.forEach(email => {
            const option = document.createElement('option');
            option.value = email;
            option.textContent = email;
            engineerFilter.appendChild(option);
        });
    }
    
    // Department Filter
    const departmentFilter = document.getElementById('departmentFilter');
    if (departmentFilter) {
        const uniqueDepartments = [...new Set(allProjects.map(p => p.department))].filter(d => d).sort();
        
        departmentFilter.innerHTML = '<option value="all">All Departments</option>';
        uniqueDepartments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            departmentFilter.appendChild(option);
        });
    }
}

// ============================================
// UPDATE CHARTS
// ============================================

async function updateCharts() {
    createDepartmentChart();
    await createEngineerChart();
    createTimelineChart();
}

// Projects by Department (Vertical Bar Chart)
function createDepartmentChart() {
    const ctx = document.getElementById('departmentChart');
    if (!ctx) return;
    
    if (departmentChart) {
        departmentChart.destroy();
    }
    
    // Count projects by department
    const deptCounts = {};
    allProjects.forEach(project => {
        const dept = project.department || 'Unknown';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    
    const labels = Object.keys(deptCounts);
    const data = Object.values(deptCounts);
    
    departmentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Projects',
                data: data,
                backgroundColor: '#3498db',
                borderColor: '#2980b9',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Projects: ${context.parsed.y}`;
                        }
                    }
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

// Projects by Engineer (Horizontal Bar Chart)
async function createEngineerChart() {
    const ctx = document.getElementById('engineerChart');
    if (!ctx) return;
    
    if (engineerChart) {
        engineerChart.destroy();
    }
    
    // Count projects by engineer
    const engineerCounts = {};
    allProjects.forEach(project => {
        const engineer = project.user_email || 'Unknown';
        engineerCounts[engineer] = (engineerCounts[engineer] || 0) + 1;
    });
    
    // Fetch engineer names from database
    const engineerNames = {};
    try {
        const uniqueEmails = Object.keys(engineerCounts);
        const response = await fetch('/api/manager/users', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const users = data.users || [];
            
            users.forEach(user => {
                if (uniqueEmails.includes(user.email)) {
                    engineerNames[user.email] = user.name || user.email.split('@')[0];
                }
            });
        }
    } catch (error) {
        console.error('Error fetching engineer names:', error);
    }
    
    // Sort by count and take top 10
    const sorted = Object.entries(engineerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    // Use engineer names instead of emails
    const labels = sorted.map(e => engineerNames[e[0]] || e[0].split('@')[0]);
    const data = sorted.map(e => e[1]);
    
    engineerChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Projects',
                data: data,
                backgroundColor: '#27ae60',
                borderColor: '#229954',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Projects: ${context.parsed.x}`;
                        }
                    }
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

// Projects Timeline (Line Chart - Last 6 Months)
function createTimelineChart() {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;
    
    if (timelineChart) {
        timelineChart.destroy();
    }
    
    // Get last 6 months
    const labels = [];
    const data = [];
    
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        labels.push(monthYear);
        
        // Count projects created in this month
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const count = allProjects.filter(p => {
            const createdDate = new Date(p.created_at);
            return createdDate >= monthStart && createdDate <= monthEnd;
        }).length;
        
        data.push(count);
    }
    
    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Projects Created',
                data: data,
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#e74c3c',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
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

window.refreshCharts = function() {
    updateCharts();
    showToast('Charts refreshed successfully', 'success');
};

// ============================================
// FILTERS
// ============================================

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const protocolFilter = document.getElementById('protocolFilter');
    const engineerFilter = document.getElementById('engineerFilter');
    const departmentFilter = document.getElementById('departmentFilter');
    
    const searchValue = searchInput ? searchInput.value.toLowerCase() : '';
    const statusValue = statusFilter ? statusFilter.value : 'all';
    const protocolValue = protocolFilter ? protocolFilter.value : 'all';
    const engineerValue = engineerFilter ? engineerFilter.value : 'all';
    const departmentValue = departmentFilter ? departmentFilter.value : 'all';
    
    console.log('Applying filters:', { searchValue, statusValue, protocolValue, engineerValue, departmentValue });
    
    // Start with all projects
    filteredProjects = [...allProjects];
    
    // Apply search filter
    if (searchValue) {
        filteredProjects = filteredProjects.filter(project => {
            const searchFields = [
                project.project_name || '',
                project.user_email || '',
                project.protocol || '',
                project.region || '',
                project.department || '',
                project.tyre_size || ''
            ].map(field => String(field).toLowerCase());
            
            return searchFields.some(field => field.includes(searchValue));
        });
    }
    
    // Apply status filter
    if (statusValue !== 'all') {
        filteredProjects = filteredProjects.filter(p => 
            p.status === statusValue
        );
    }
    
    // Apply protocol filter
    if (protocolValue !== 'all') {
        filteredProjects = filteredProjects.filter(p => 
            p.protocol === protocolValue
        );
    }
    
    // Apply engineer filter
    if (engineerValue !== 'all') {
        filteredProjects = filteredProjects.filter(p => 
            p.user_email === engineerValue
        );
    }
    
    // Apply department filter
    if (departmentValue !== 'all') {
        filteredProjects = filteredProjects.filter(p => 
            p.department === departmentValue
        );
    }
    
    console.log(`Filtered ${filteredProjects.length} projects from ${allProjects.length} total`);
    
    // Reset to first page
    currentPage = 1;
    
    // Update table
    updateProjectsTable();
    
    showToast(`Filters applied. Showing ${filteredProjects.length} projects.`, 'success');
}

function clearFilters() {
    // Reset all filter inputs
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const protocolFilter = document.getElementById('protocolFilter');
    const engineerFilter = document.getElementById('engineerFilter');
    const departmentFilter = document.getElementById('departmentFilter');
    
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = 'all';
    if (protocolFilter) protocolFilter.value = 'all';
    if (engineerFilter) engineerFilter.value = 'all';
    if (departmentFilter) departmentFilter.value = 'all';
    
    // Reset filtered projects
    filteredProjects = [...allProjects];
    
    // Reset to first page
    currentPage = 1;
    
    // Update table
    updateProjectsTable();
    
    showToast('Filters cleared', 'info');
}

// ============================================
// PROJECTS TABLE
// ============================================

function updateProjectsTable() {
    const tbody = document.getElementById('projectsTableBody');
    const tableInfo = document.getElementById('tableInfo');
    
    if (!tbody) return;
    
    // Calculate pagination
    totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageProjects = filteredProjects.slice(startIndex, endIndex);
    
    // Update table info
    if (tableInfo) {
        const showing = pageProjects.length;
        const total = filteredProjects.length;
        tableInfo.textContent = `Showing ${showing} of ${total} projects`;
    }
    
    // Check if no projects
    if (pageProjects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="loading-spinner">
                    <i class="fas fa-inbox"></i>
                    <p>No projects found</p>
                </td>
            </tr>
        `;
        updatePagination();
        return;
    }
    
    // Generate table rows
    tbody.innerHTML = pageProjects.map(project => {
        const statusClass = getStatusClass(project.status);
        const protocolClass = getProtocolClass(project.protocol);
        const createdDate = formatDate(project.created_at);
        const completedDate = project.completed_at ? formatDate(project.completed_at) : '-';
        
        return `
            <tr onclick="viewProjectDetails(${project.id})">
                <td>
                    <span class="project-id">#${project.id}</span>
                </td>
                <td>
                    <span class="project-name">${escapeHtml(project.project_name)}</span>
                </td>
                <td>
                    <span class="engineer-name">${escapeHtml(project.user_name || project.user_email.split('@')[0])}</span>
                </td>
                <td>
                    <span class="protocol-badge ${protocolClass}">${escapeHtml(project.protocol)}</span>
                </td>
                <td>
                    <span class="status-badge ${statusClass}">${escapeHtml(project.status)}</span>
                </td>
                <td>${escapeHtml(project.department || '-')}</td>
                <td>${escapeHtml(project.region || '-')}</td>
                <td>${escapeHtml(project.tyre_size || '-')}</td>
                <td>${createdDate}</td>
                <td>${completedDate}</td>
                <td>
                    <button class="btn-view-details" onclick="event.stopPropagation(); viewProjectDetails(${project.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Update pagination controls
    updatePagination();
}

// Helper function to get status class
function getStatusClass(status) {
    const statusMap = {
        'Not Started': 'status-not-started',
        'In Progress': 'status-in-progress',
        'Completed': 'status-completed',
        'Archived': 'status-archived'
    };
    return statusMap[status] || 'status-not-started';
}

// Helper function to get protocol class
function getProtocolClass(protocol) {
    const protocolMap = {
        'MF62': 'protocol-mf62',
        'MF52': 'protocol-mf52',
        'FTire': 'protocol-ftire',
        'CDTire': 'protocol-cdtire',
        'Custom': 'protocol-custom'
    };
    return protocolMap[protocol] || '';
}

// ============================================
// PAGINATION
// ============================================

function updatePagination() {
    const paginationInfo = document.getElementById('paginationInfo');
    const pageNumbers = document.getElementById('pageNumbers');
    const firstPageBtn = document.getElementById('firstPageBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const lastPageBtn = document.getElementById('lastPageBtn');
    
    // Update pagination info
    if (paginationInfo) {
        paginationInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    }
    
    // Update button states
    if (firstPageBtn) firstPageBtn.disabled = currentPage === 1;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    if (lastPageBtn) lastPageBtn.disabled = currentPage === totalPages || totalPages === 0;
    
    // Generate page numbers
    if (pageNumbers) {
        pageNumbers.innerHTML = '';
        
        const maxPageButtons = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
        
        if (endPage - startPage < maxPageButtons - 1) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('div');
            pageBtn.className = 'page-number' + (i === currentPage ? ' active' : '');
            pageBtn.textContent = i;
            pageBtn.onclick = () => goToPage(i);
            pageNumbers.appendChild(pageBtn);
        }
    }
}

function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    updateProjectsTable();
}

function goToFirstPage() {
    goToPage(1);
}

function goToPreviousPage() {
    goToPage(currentPage - 1);
}

function goToNextPage() {
    goToPage(currentPage + 1);
}

function goToLastPage() {
    goToPage(totalPages);
}

function changeItemsPerPage() {
    const select = document.getElementById('itemsPerPage');
    if (select) {
        itemsPerPage = parseInt(select.value);
        currentPage = 1;
        updateProjectsTable();
    }
}

// ============================================
// PROJECT DETAILS SIDEBAR
// ============================================

async function viewProjectDetails(projectId) {
    const sidebar = document.getElementById('projectDetailsSidebar');
    const overlay = document.getElementById('projectDetailsOverlay');
    const sidebarBody = document.getElementById('projectDetailsContent');
    
    if (!sidebar || !overlay || !sidebarBody) return;
    
    // Show sidebar with loading state
    sidebar.classList.add('active');
    overlay.classList.add('active');
    
    sidebarBody.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading project details...</p>
        </div>
    `;
    
    try {
        // Find project in local data first
        const project = allProjects.find(p => p.id === projectId);
        
        if (!project) {
            throw new Error('Project not found');
        }
        
        // Format dates
        const createdDate = formatFullDateTime(project.created_at);
        const completedDate = project.completed_at ? formatFullDateTime(project.completed_at) : 'Not completed yet';
        
        // Calculate duration if completed
        let duration = '-';
        if (project.completed_at && project.created_at) {
            const start = new Date(project.created_at);
            const end = new Date(project.completed_at);
            const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
            duration = `${days} day${days !== 1 ? 's' : ''}`;
        }
        
        // Generate detailed view
        sidebarBody.innerHTML = `
            <div class="detail-section">
                <h4><i class="fas fa-info-circle"></i> Basic Information</h4>
                <div class="detail-item">
                    <span class="detail-label">Project ID:</span>
                    <span class="detail-value">#${project.id}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Project Name:</span>
                    <span class="detail-value">${escapeHtml(project.project_name)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Protocol:</span>
                    <span class="detail-value protocol-badge ${getProtocolClass(project.protocol)}">${escapeHtml(project.protocol)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value status-badge ${getStatusClass(project.status)}">${escapeHtml(project.status)}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4><i class="fas fa-user"></i> Engineer Information</h4>
                <div class="detail-item">
                    <span class="detail-label">Engineer Email:</span>
                    <span class="detail-value">${escapeHtml(project.user_email)}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4><i class="fas fa-building"></i> Organization</h4>
                <div class="detail-item">
                    <span class="detail-label">Department:</span>
                    <span class="detail-value">${escapeHtml(project.department || 'Not specified')}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Region:</span>
                    <span class="detail-value">${escapeHtml(project.region || 'Not specified')}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4><i class="fas fa-cog"></i> Tyre Specifications</h4>
                <div class="detail-item">
                    <span class="detail-label">Tyre Size:</span>
                    <span class="detail-value">${escapeHtml(project.tyre_size || 'Not specified')}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4><i class="fas fa-calendar"></i> Timeline</h4>
                <div class="detail-item">
                    <span class="detail-label">Created:</span>
                    <span class="detail-value">${createdDate}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Completed:</span>
                    <span class="detail-value">${completedDate}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Duration:</span>
                    <span class="detail-value">${duration}</span>
                </div>
            </div>
            
            <div class="detail-section">
                <h4><i class="fas fa-tools"></i> Actions</h4>
                <button class="btn-apply-filters" onclick="exportProject(${project.id})" style="background: #3498db; margin-bottom: 10px;">
                    <i class="fas fa-download"></i> Export Details
                </button>
                <button class="btn-apply-filters" onclick="deleteProject(${project.id})" style="background: #e74c3c;">
                    <i class="fas fa-trash"></i> Delete Project
                </button>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading project details:', error);
        sidebarBody.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--danger-color);">
                <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Failed to load project details</p>
                <small style="font-size: 13px;">${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

function closeProjectDetails() {
    const sidebar = document.getElementById('projectDetailsSidebar');
    const overlay = document.getElementById('projectDetailsOverlay');
    
    if (sidebar) {
        sidebar.classList.remove('active');
    }
    
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ============================================
// PROJECT ACTIONS
// ============================================

async function deleteProject(projectId) {
    if (!confirm('Are you sure you want to DELETE this project? This action cannot be undone!')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete project');
        }
        
        showToast('Project deleted successfully', 'success');
        closeProjectDetails();
        await loadAllData();
        
    } catch (error) {
        console.error('Error deleting project:', error);
        showToast('Failed to delete project', 'error');
    }
}

function exportProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    
    if (!project) {
        showToast('Project not found', 'error');
        return;
    }
    
    // Create CSV content
    const csvContent = `Project ID,Project Name,Engineer,Protocol,Status,Department,Region,Tyre Size,Created,Completed
${project.id},"${project.project_name}","${project.user_email}","${project.protocol}","${project.status}","${project.department || ''}","${project.region || ''}","${project.tyre_size || ''}","${project.created_at}","${project.completed_at || ''}"`;
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project_${project.id}_${project.project_name}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Project exported successfully', 'success');
}

// ============================================
// EXPORT ALL PROJECTS
// ============================================

function exportAllProjects() {
    if (filteredProjects.length === 0) {
        showToast('No projects to export', 'warning');
        return;
    }
    
    // Create CSV header
    let csvContent = 'Project ID,Project Name,Engineer,Protocol,Status,Department,Region,Tyre Size,Created,Completed\n';
    
    // Add data rows
    filteredProjects.forEach(project => {
        csvContent += `${project.id},"${project.project_name}","${project.user_email}","${project.protocol}","${project.status}","${project.department || ''}","${project.region || ''}","${project.tyre_size || ''}","${project.created_at}","${project.completed_at || ''}"\n`;
    });
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const timestamp = new Date().toISOString().split('T')[0];
    a.download = `all_projects_${timestamp}.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast(`Exported ${filteredProjects.length} projects successfully`, 'success');
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefresh);
    }
    
    // User menu button
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', openUserInfoSidebar);
    }
    
    // Apply filters button
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }
    
    // Clear filters button
    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
    }
    
    // Search input (real-time search with debounce)
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 500);
        });
    }
    
    // Pagination buttons
    const firstPageBtn = document.getElementById('firstPageBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const lastPageBtn = document.getElementById('lastPageBtn');
    
    if (firstPageBtn) firstPageBtn.addEventListener('click', goToFirstPage);
    if (prevPageBtn) prevPageBtn.addEventListener('click', goToPreviousPage);
    if (nextPageBtn) nextPageBtn.addEventListener('click', goToNextPage);
    if (lastPageBtn) lastPageBtn.addEventListener('click', goToLastPage);
    
    // Items per page
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', changeItemsPerPage);
    }
    
    // My Projects view toggle
    const myProjectsGridBtn = document.getElementById('myProjectsGridBtn');
    const myProjectsListBtn = document.getElementById('myProjectsListBtn');
    
    if (myProjectsGridBtn) {
        myProjectsGridBtn.addEventListener('click', () => toggleMyProjectsView('grid'));
    }
    
    if (myProjectsListBtn) {
        myProjectsListBtn.addEventListener('click', () => toggleMyProjectsView('list'));
    }
    
    // ESC key to close sidebars
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeProjectDetails();
            closeUserInfoSidebar();
        }
    });
}

async function handleRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    
    try {
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }
        
        await loadAllData();
        
        showToast('Data refreshed successfully!', 'success');
        
    } catch (error) {
        console.error('Error refreshing:', error);
        showToast('Failed to refresh data', 'error');
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('userEmail');
        localStorage.removeItem('authToken');
        window.location.href = '/login.html';
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showLoadingState() {
    const tbody = document.getElementById('projectsTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading projects...</p>
                </td>
            </tr>
        `;
    }
}

function updateLastUpdated() {
    const lastUpdated = document.getElementById('lastUpdated');
    if (lastUpdated) {
        const now = new Date();
        lastUpdated.textContent = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatFullDateTime(dateString) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
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
        max-width: 400px;
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
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// ============================================
// USER INFORMATION SIDEBAR
// ============================================

async function openUserInfoSidebar() {
    const sidebar = document.getElementById('userInfoSidebar');
    const overlay = document.getElementById('userInfoOverlay');
    const sidebarBody = document.getElementById('userInfoContent');
    
    if (!sidebar || !overlay || !sidebarBody) return;
    
    // Show sidebar with loading state
    sidebar.classList.add('active');
    overlay.classList.add('active');
    
    sidebarBody.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading user information...</p>
        </div>
    `;
    
    try {
        const authToken = localStorage.getItem('authToken');
        
        if (!authToken) {
            throw new Error('No authentication token found');
        }
        
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user information');
        }
        
        const data = await response.json();
        const user = data.user || data;

        if (!user || !user.email) {
            throw new Error('User data not found');
        }

        const accountCreated = user.created_at ? formatFullDateTime(user.created_at) : 'Not available';
        const lastLogin = user.last_login ? formatFullDateTime(user.last_login) : 'Never logged in';
        const userName = user.name || user.email.split('@')[0];
        
        sidebarBody.innerHTML = `
            <div class="user-info-header">
                <div class="user-info-name">${escapeHtml(userName)}</div>
                <div class="user-info-subtitle">Manager Account</div>
            </div>
            
            <div class="user-info-grid">
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-id-card"></i>
                        User ID
                    </div>
                    <div class="user-info-value user-id">${escapeHtml(user.id)}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-user"></i>
                        Full Name
                    </div>
                    <div class="user-info-value">${escapeHtml(userName)}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-envelope"></i>
                        Email Address
                    </div>
                    <div class="user-info-value user-email">${escapeHtml(user.email)}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-user-shield"></i>
                        Account Role
                    </div>
                    <div class="user-info-value user-role role-${user.role}">
                        ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-calendar-plus"></i>
                        Account Created
                    </div>
                    <div class="user-info-value">${accountCreated}</div>
                </div>
                
                <div class="user-info-item">
                    <div class="user-info-label">
                        <i class="fas fa-clock"></i>
                        Last Login
                    </div>
                    <div class="user-info-value">${lastLogin}</div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading user information:', error);
        sidebarBody.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--danger-color);">
                <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Failed to load user information</p>
                <small style="font-size: 13px;">${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

function closeUserInfoSidebar() {
    const sidebar = document.getElementById('userInfoSidebar');
    const overlay = document.getElementById('userInfoOverlay');
    
    if (sidebar) {
        sidebar.classList.remove('active');
    }
    
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ============================================
// GLOBAL WINDOW FUNCTIONS
// ============================================

window.viewProjectDetails = viewProjectDetails;
window.closeProjectDetails = closeProjectDetails;
window.deleteProject = deleteProject;
window.exportProject = exportProject;
window.exportAllProjects = exportAllProjects;
window.openUserInfoSidebar = openUserInfoSidebar;
window.closeUserInfoSidebar = closeUserInfoSidebar;

// Add to existing global window functions
window.toggleProjectMenu = toggleProjectMenu;
window.renameProject = renameProject;
window.closeRenameModal = closeRenameModal;
window.confirmRename = confirmRename;
window.markAsCompleted = markAsCompleted;
window.closeCompletedModal = closeCompletedModal;
window.confirmMarkCompleted = confirmMarkCompleted;
window.archiveMyProject = archiveMyProject;
window.closeArchiveModal = closeArchiveModal;
window.confirmArchive = confirmArchive;
window.deleteMyProject = deleteMyProject;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.viewCompletedProject = viewCompletedProject;
window.editNotStartedProject = editNotStartedProject;
window.editInProgressProject = editInProgressProject;

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================

console.log('%c All Projects Page Loaded! ', 'background: #e74c3c; color: white; font-size: 16px; font-weight: bold; padding: 10px;');
console.log('%c Manager view for all projects across all engineers ', 'font-size: 14px; color: #2c3e50;');

// ============================================
// END OF ALL PROJECTS JAVASCRIPT
// ============================================