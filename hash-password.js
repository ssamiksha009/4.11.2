const bcrypt = require('bcrypt');

async function hashPasswords() {
  try {
    // Hash password with same salt rounds as login (10)
    const managerPassword = 'Manager@123';
    
    const managerHash = await bcrypt.hash(managerPassword, 10);
    
    console.log('\n=== HASHED PASSWORD FOR SQL ===\n');
    
    console.log('Manager Password Hash:');
    console.log(managerHash);
    console.log('\n');
    
    console.log('=== SQL INSERT STATEMENT ===\n');
    
    console.log(`-- Insert Manager
INSERT INTO users (id, email, password, role, name, created_at)
VALUES (
  'USR-MGR001',
  'manager@apollotyres.com',
  '${managerHash}',
  'manager',
  'Manager',
  CURRENT_TIMESTAMP
)
ON CONFLICT (email) DO UPDATE SET
  password = EXCLUDED.password,
  id = EXCLUDED.id,
  role = EXCLUDED.role,
  name = EXCLUDED.name;
`);
    
    console.log('\n=== LOGIN CREDENTIALS ===\n');
    console.log('Email: manager@apollotyres.com');
    console.log('Password: Manager@123');
    console.log('\n');
    
  } catch (error) {
    console.error('Error hashing password:', error);
  }
}

hashPasswords();