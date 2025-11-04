document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');

  // Guard clause - ensure form exists
  if (!form) {
    console.error(' Login form not found');
    return;
  }

  // ============================================
  // FORM SUBMISSION HANDLER
  // ============================================
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    
    // Clear previous errors
    if (errorMessage) {
      errorMessage.textContent = '';
      errorMessage.style.display = 'none';
    }
    
    // Get input values
    const email = (emailInput?.value || '').trim();
    const password = (passwordInput?.value || '').trim();

    // Validation
    if (!email || !password) {
      showError('Please enter both email and password');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError('Please enter a valid email address');
      return;
    }

    // Disable submit button during request
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Logging in...</span>';
    }

    try {
      console.log('🔐 Attempting login for:', email);

      // ============================================
      // API CALL
      // ============================================
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      // Parse response
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError);
        throw new Error('Invalid server response. Please try again.');
      }

      // Handle error responses
      if (!response.ok) {
        const errorMsg = data.message || data.error || `Login failed (${response.status})`;
        throw new Error(errorMsg);
      }

      // Validate token presence
      const token = data.token || '';
      if (!token) {
        throw new Error('Authentication token not received from server');
      }

      console.log('✅ Login successful:', {
        email,
        hasToken: true,
        tokenLength: token.length,
        userData: data.user ? 'present' : 'missing'
      });

      // ============================================
      // PERSIST USER DATA TO LOCALSTORAGE
      // ============================================
      
      console.log('📦 Storing user data to localStorage...');
      
      // 1. Save token (CRITICAL)
      localStorage.setItem('authToken', token);
      console.log('✓ Saved authToken');

      // 2. Extract and save email (CRITICAL for project filtering)
      const userEmail = data.user?.email || data.email || email;
      localStorage.setItem('userEmail', userEmail);
      console.log('✓ Saved userEmail:', userEmail);

      // 3. Extract and save name
      const userName = data.user?.name || data.name || email.split('@')[0];
      localStorage.setItem('userName', userName);
      console.log('✓ Saved userName:', userName);

      // 4. Extract and save role
      const userRole = data.user?.role || data.role || 'engineer';
      localStorage.setItem('userRole', userRole);
      console.log('✓ Saved userRole:', userRole);

      // 5. Save ID if available
      if (data.user?.id || data.id) {
        const userId = data.user?.id || data.id;
        localStorage.setItem('userId', String(userId));
        console.log('✓ Saved userId:', userId);
      }

      // ============================================
      // VERIFY LOCALSTORAGE IMMEDIATELY
      // ============================================
      const verification = {
        authToken: localStorage.getItem('authToken') ? '✅ Present' : '❌ MISSING',
        userEmail: localStorage.getItem('userEmail') || '❌ MISSING',
        userName: localStorage.getItem('userName') || '❌ MISSING',
        userRole: localStorage.getItem('userRole') || '❌ MISSING'
      };
      
      console.log('🔍 LocalStorage verification:', verification);

      // Critical checks
      if (!localStorage.getItem('authToken')) {
        throw new Error('CRITICAL: Failed to save authentication token');
      }
      if (!localStorage.getItem('userEmail')) {
        throw new Error('CRITICAL: Failed to save user email');
      }

      // ============================================
      // LOG LOGIN ACTIVITY
      // ============================================
      try {
        const activityResponse = await fetch('/api/activity-log', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            activity_type: 'Authentication',
            action: 'User Login',
            description: `User ${userEmail} successfully logged in`,
            status: 'success',
            metadata: {
              role: userRole,
              timestamp: new Date().toISOString(),
              email: userEmail,
              loginMethod: 'password'
            }
          })
        });
        
        if (activityResponse.ok) {
          console.log('✓ Login activity logged successfully');
        } else {
          console.warn('⚠ Activity logging returned status:', activityResponse.status);
        }
      } catch (logError) {
        console.warn('⚠ Failed to log login activity:', logError.message);
        // Don't throw - activity logging is not critical for login
      }

      // ============================================
      // DETERMINE REDIRECT URL BASED ON ROLE
      // ============================================
      let role = userRole.toLowerCase().trim();
      
      console.log('🎯 User role for redirect:', role);

      let redirectUrl = '/user-dashboard.html'; // Default for engineers

      if (role === 'manager' || role === 'admin') {
        redirectUrl = '/manager-dashboard.html';
      }

      // Small delay to ensure all async operations complete
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log('🚀 Redirecting to:', redirectUrl);
      
      // Final verification before redirect
      if (!localStorage.getItem('authToken') || !localStorage.getItem('userEmail')) {
        throw new Error('LocalStorage verification failed before redirect');
      }

      window.location.href = redirectUrl;

    } catch (error) {
      console.error('❌ Login error:', error);
      showError(error.message || 'An error occurred during login. Please try again.');
      
      // Re-enable button
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Login</span><i class="fas fa-arrow-right"></i>';
      }
    }
  });

  // ============================================
  // PASSWORD VISIBILITY TOGGLE
  // ============================================
  const togglePassword = document.querySelector('.toggle-password');
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', function() {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      // Toggle icon
      this.classList.toggle('fa-eye');
      this.classList.toggle('fa-eye-slash');
    });
  }

  // ============================================
  // REMEMBER ME FUNCTIONALITY
  // ============================================
  const rememberCheckbox = document.getElementById('remember');
  
  // Load saved email if "Remember Me" was checked
  const savedEmail = localStorage.getItem('rememberedEmail');
  if (savedEmail && emailInput) {
    emailInput.value = savedEmail;
    if (rememberCheckbox) rememberCheckbox.checked = true;
  }

  // Save email if "Remember Me" is checked
  if (rememberCheckbox) {
    form.addEventListener('submit', () => {
      if (rememberCheckbox.checked && emailInput) {
        localStorage.setItem('rememberedEmail', emailInput.value.trim());
      } else {
        localStorage.removeItem('rememberedEmail');
      }
    });
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  
  /**
   * Display error message to user
   */
  function showError(message) {
    if (errorMessage) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
      
      // Scroll to error message
      errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Auto-hide after 8 seconds
      setTimeout(() => {
        errorMessage.style.display = 'none';
      }, 8000);
    } else {
      // Fallback if error message element not found
      alert(message);
    }
  }

  // ============================================
  // AUTO-REDIRECT IF ALREADY LOGGED IN
  // ============================================
  
  const token = localStorage.getItem('authToken');
  if (token) {
    try {
      // Decode JWT to check expiration
      const payload = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      
      if (payload.exp) {
        const isExpired = Date.now() >= payload.exp * 1000;
        
        if (isExpired) {
          console.warn('⚠ Token expired, clearing session...');
          localStorage.removeItem('authToken');
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userName');
          localStorage.removeItem('userRole');
          localStorage.removeItem('userId');
          
          if (errorMessage) {
            errorMessage.textContent = 'Your session has expired. Please login again.';
            errorMessage.style.display = 'block';
          }
        } else {
          // Token still valid - redirect to appropriate dashboard
          const currentPage = window.location.pathname;
          if (currentPage === '/login.html' || currentPage === '/' || currentPage === '/index.html') {
            const userRole = localStorage.getItem('userRole') || 'engineer';
            const redirectUrl = userRole.toLowerCase() === 'manager' || userRole.toLowerCase() === 'admin'
              ? '/manager-dashboard.html' 
              : '/user-dashboard.html';
            
            console.log('✓ User already logged in, redirecting to:', redirectUrl);
            window.location.href = redirectUrl;
          }
        }
      }
    } catch (e) {
      console.error('❌ Token validation error:', e);
      // Clear invalid token
      localStorage.removeItem('authToken');
    }
  }

  // ============================================
  // ENTER KEY SUPPORT
  // ============================================
  
  // Allow Enter key on email and password fields
  [emailInput, passwordInput].forEach(input => {
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    }
  });

  console.log('✅ Login page initialized');
});

// ============================================
// GLOBAL LOGOUT FUNCTION
// ============================================

/**
 * Global logout function callable from any page
 */
window.logout = async function() {
  if (!confirm('Are you sure you want to logout?')) {
    return;
  }

  try {
    console.log('🔓 Logging out user...');

    // Get auth data before clearing
    const authToken = localStorage.getItem('authToken');
    const userEmail = localStorage.getItem('userEmail');
    
    // Log logout activity (if token available)
    if (authToken) {
      try {
        await fetch('/api/activity-log', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            activity_type: 'Authentication',
            action: 'User Logout',
            description: `User ${userEmail || 'unknown'} logged out`,
            status: 'success',
            metadata: {
              timestamp: new Date().toISOString()
            }
          })
        });
        console.log('✓ Logout activity logged');
      } catch (logError) {
        console.warn('⚠ Failed to log logout activity:', logError.message);
        // Continue with logout even if logging fails
      }
    }
  } catch (error) {
    console.error('❌ Error during logout:', error);
  } finally {
    // Clear all auth data (always executed)
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    
    console.log('✓ Auth data cleared, redirecting to login...');
    
    // Redirect to login page
    window.location.href = '/login.html';
  }
};

// ============================================
// DEBUG HELPER (Always Available)
// ============================================

// Storage change listener (for debugging)
window.addEventListener('storage', (e) => {
  if (e.key && (e.key.includes('user') || e.key.includes('auth'))) {
    console.log('🔄 Auth storage changed:', {
      key: e.key,
      changed: true
    });
  }
});

// Global debug function (always available)
window.debugAuth = function() {
  const token = localStorage.getItem('authToken');
  console.table({
    'Auth Token': token ? '✅ Present (' + token.length + ' chars)' : '❌ Missing',
    'User Email': localStorage.getItem('userEmail') || '❌ Missing',
    'User Name': localStorage.getItem('userName') || '❌ Missing',
    'User Role': localStorage.getItem('userRole') || '❌ Missing',
    'User ID': localStorage.getItem('userId') || 'Not set'
  });
  
  // Verify token with API
  if (token) {
    fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(d => console.log('✅ API Verification:', d))
    .catch(e => console.error('❌ API Verification Failed:', e));
  }
};

console.log('💡 Tip: Run debugAuth() in console to check auth state');

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

window.addEventListener('error', (event) => {
  console.error('🚨 Global error on login page:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🚨 Unhandled promise rejection:', event.reason);
});

console.log('✅ Login.js fully loaded');