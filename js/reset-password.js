// ============================================
// RESET PASSWORD - JavaScript
// ============================================

let allUsers = [];
let selectedUser = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Reset Password page initializing...');
    
    // Check authentication
    await checkAuthentication();
    
    // Load manager info
    loadManagerInfo();
    
    // Load users
    await loadUsers();
    
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
// LOAD MANAGER INFO
// ============================================

function loadManagerInfo() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const managerName = payload.name || payload.email.split('@')[0];
            
            document.getElementById('managerName').textContent = managerName.charAt(0).toUpperCase() + managerName.slice(1);
            
            const avatar = document.getElementById('managerAvatar');
            if (avatar) {
                avatar.textContent = payload.email.charAt(0).toUpperCase();
            }
        } catch (e) {
            console.error('Error parsing token:', e);
        }
    }
}

// ============================================
// LOAD USERS
// ============================================

async function loadUsers() {
    try {
        const authToken = localStorage.getItem('authToken');
        
        const response = await fetch('/api/manager/users', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        
        const data = await response.json();
        allUsers = data.success ? data.users : [];
        
        console.log('✅ Loaded', allUsers.length, 'users');
        
        // Display users list
        displayUsersList(allUsers);
        
    } catch (error) {
        console.error('❌ Error loading users:', error);
        
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Failed to load engineers</p>
            </div>
        `;
    }
}

// ============================================
// DISPLAY USERS LIST
// ============================================

function displayUsersList(users) {
    const userSelect = document.getElementById('userSelect');
    
    if (users.length === 0) {
        userSelect.innerHTML = '<option value="">-- No engineers found --</option>';
        return;
    }
    
    // Keep the default option
    let options = '<option value="">-- Select an engineer --</option>';
    
    // Add user options
    options += users.map(user => {
        const userName = user.name || 'Not Set';
        const displayText = `${userName} (${user.email}) - ${user.id}`;
        
        return `<option value="${user.id}" data-email="${user.email}" data-name="${userName}">${displayText}</option>`;
    }).join('');
    
    userSelect.innerHTML = options;
}

// ============================================
// SELECT USER
// ============================================

function selectUser(userId) {
    if (!userId) {
        // No user selected (default option chosen)
        selectedUser = null;
        document.getElementById('selectedUserDisplay').style.display = 'none';
        document.getElementById('noUserSelected').style.display = 'block';
        return;
    }
    
    // Find user
    selectedUser = allUsers.find(u => u.id === userId);
    
    if (!selectedUser) {
        console.error('User not found:', userId);
        return;
    }
    
    console.log('Selected user:', selectedUser);
    
    // Show selected user display
    document.getElementById('selectedUserDisplay').style.display = 'block';
    document.getElementById('noUserSelected').style.display = 'none';
    
    // Update selected user info
    const userName = selectedUser.name || 'Not Set';
    const userInitial = userName.charAt(0).toUpperCase();
    
    document.getElementById('selectedUserAvatar').textContent = userInitial;
    document.getElementById('selectedUserName').textContent = userName;
    document.getElementById('selectedUserEmail').textContent = selectedUser.email;
    
    // Clear form
    document.getElementById('resetPasswordForm').reset();
    document.getElementById('passwordStrengthBar').className = 'password-strength-bar';
    
    // Hide any previous messages
    document.getElementById('resetMessage').style.display = 'none';
}
// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    // User dropdown selection
    const userSelect = document.getElementById('userSelect');
    if (userSelect) {
        userSelect.addEventListener('change', function() {
            selectUser(this.value);
        });
    }
    
    // Password strength checker
    const newPasswordInput = document.getElementById('newPassword');
    const strengthBar = document.getElementById('passwordStrengthBar');
    
    if (newPasswordInput && strengthBar) {
        newPasswordInput.addEventListener('input', function() {
            const password = this.value;
            let strength = 0;
            
            // Check requirements
            const hasLength = password.length >= 6;
            const hasUppercase = /[A-Z]/.test(password);
            const hasLowercase = /[a-z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            
            // Update requirement indicators
            document.getElementById('req-length').className = hasLength ? 'requirement-met' : '';
            document.getElementById('req-uppercase').className = hasUppercase ? 'requirement-met' : '';
            document.getElementById('req-lowercase').className = hasLowercase ? 'requirement-met' : '';
            document.getElementById('req-number').className = hasNumber ? 'requirement-met' : '';
            
            // Calculate strength
            if (hasLength) strength++;
            if (hasUppercase) strength++;
            if (hasLowercase) strength++;
            if (hasNumber) strength++;
            
            // Update strength bar
            strengthBar.className = 'password-strength-bar';
            if (strength === 1 || strength === 2) {
                strengthBar.classList.add('strength-weak');
            } else if (strength === 3) {
                strengthBar.classList.add('strength-medium');
            } else if (strength === 4) {
                strengthBar.classList.add('strength-strong');
            }
        });
    }
    
    // Form submission
    const form = document.getElementById('resetPasswordForm');
    if (form) {
        form.addEventListener('submit', handleResetPassword);
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// ============================================
// RESET PASSWORD
// ============================================

async function handleResetPassword(e) {
    e.preventDefault();
    
    if (!selectedUser) {
        showMessage('Please select a user first', 'error');
        return;
    }
    
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const resetBtn = document.getElementById('resetBtn');
    
    // Validation
    if (newPassword !== confirmPassword) {
        showMessage('Passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showMessage('Password must be at least 6 characters', 'error');
        return;
    }
    
    // Password strength check
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    
    if (!hasUppercase || !hasLowercase || !hasNumber) {
        showMessage('Password must contain uppercase, lowercase, and number', 'error');
        return;
    }
    
    // Disable button
    resetBtn.disabled = true;
    resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/manager/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                engineerEmail: selectedUser.email,
                newPassword: newPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMessage(`Password reset successfully for ${selectedUser.name || selectedUser.email}!`, 'success');
            
            // Clear form
            document.getElementById('resetPasswordForm').reset();
            document.getElementById('passwordStrengthBar').className = 'password-strength-bar';
            
            // Clear selection after 2 seconds
            setTimeout(() => {
                selectedUser = null;
                document.getElementById('selectedUserDisplay').style.display = 'none';
                document.getElementById('noUserSelected').style.display = 'block';
                document.querySelectorAll('.user-list-item').forEach(item => {
                    item.classList.remove('selected');
                });
            }, 2000);
            
        } else {
            showMessage(data.message || 'Failed to reset password', 'error');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        showMessage('An error occurred. Please try again.', 'error');
    } finally {
        resetBtn.disabled = false;
        resetBtn.innerHTML = '<i class="fas fa-key"></i> Reset Password';
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showMessage(message, type) {
    const messageDiv = document.getElementById('resetMessage');
    messageDiv.textContent = message;
    messageDiv.className = 'reset-message ' + type;
    messageDiv.style.display = 'block';
    
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
        window.location.href = '/login.html';
    }
}

// ============================================
// CONSOLE MESSAGE
// ============================================

console.log('%c Reset Password Page Loaded! ', 'background: #e74c3c; color: white; font-size: 16px; font-weight: bold; padding: 10px;');
console.log('%c Manager can reset passwords for engineers ', 'font-size: 14px; color: #2c3e50;');