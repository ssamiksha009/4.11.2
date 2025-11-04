const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const rimraf = require('rimraf');
const { spawn } = require('child_process');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'; // replace with secure value in production
const ABAQUS_CPU_COUNT = process.env.ABAQUS_CPUS || 4;


const ProjectLogger = require('./utils/logger');


const projectLoggers = new Map();

function getProjectLogger(projectName, protocol) {
  //  NORMALIZE PROJECT NAME (handle case sensitivity)
  const normalizedProject = String(projectName || '').trim();
  const normalizedProtocol = String(protocol || '').trim();
  
  if (!normalizedProject || !normalizedProtocol) {
    console.error(`❌ Invalid project name or protocol: "${normalizedProject}" / "${normalizedProtocol}"`);
    return null;
  }
  
  const key = `${normalizedProject}_${normalizedProtocol}`;
  
  console.log(`\n📝 Getting logger for key: ${key}`);

  //  RETURN EXISTING LOGGER IF CACHED
  if (projectLoggers.has(key)) {
    console.log(` Using cached logger: ${key}`);
    return projectLoggers.get(key);
  }

  const combinedName = `${normalizedProject}_${normalizedProtocol}`;
  const projectPath = path.join(__dirname, 'projects', combinedName);

  console.log(`📁 Project path: ${projectPath}`);

  //  ENSURE PROJECT FOLDER AND LOGS DIRECTORY EXIST
  try {
    // Create project folder if missing
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
      console.log(` Created project folder: ${projectPath}`);
    }
    
    // Create logs folder if missing
    const logsDir = path.join(projectPath, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log(` Created logs directory: ${logsDir}`);
    }
    
    //  VERIFY DIRECTORIES EXIST AFTER CREATION
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project folder still doesn't exist after creation: ${projectPath}`);
    }
    if (!fs.existsSync(logsDir)) {
      throw new Error(`Logs directory still doesn't exist after creation: ${logsDir}`);
    }
    
    console.log(` Verified: Project folder and logs directory exist`);
    
  } catch (err) {
    console.error(`❌ Failed to ensure project/logs directories:`, err);
    return null;
  }

  //  CREATE LOGGER INSTANCE
  try {
    console.log(`🔨 Creating new ProjectLogger instance...`);
    const logger = new ProjectLogger(projectPath, combinedName);
    
    //  VERIFY LOGGER WAS CREATED SUCCESSFULLY
    if (!logger) {
      throw new Error('Logger instance is null after creation');
    }
    
    //  VERIFY LOG FILE EXISTS
    if (logger.logFile && !fs.existsSync(logger.logFile)) {
      console.warn(`⚠️ Log file doesn't exist yet: ${logger.logFile}`);
      // Try to create it manually
      fs.writeFileSync(logger.logFile, `Log file created at ${new Date().toISOString()}\n`);
      console.log(` Manually created log file: ${logger.logFile}`);
    }
    
    //  CACHE LOGGER FOR REUSE
    projectLoggers.set(key, logger);
    console.log(` Logger created and cached successfully: ${key}`);
    console.log(`📄 Log file: ${logger.logFile}\n`);
    
    return logger;
    
  } catch (err) {
    console.error(`❌ Failed to instantiate ProjectLogger:`, err);
    console.error(`   Stack trace:`, err.stack);
    return null;
  }
}

// ============================================
// HELPER FUNCTION: Get Client IP Address
// ============================================

/**
 * Get the real client IP address from the request
 * Handles proxies, load balancers, and IPv6/IPv4 conversion
 */
function getClientIP(req) {
  // Priority 1: Check X-Forwarded-For header (from proxies/load balancers)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
    // The first one is the original client IP
    const ips = forwarded.split(',').map(ip => ip.trim());
    const clientIP = ips[0];
    
    // Convert IPv6 loopback to IPv4
    if (clientIP === '::1' || clientIP === '::ffff:127.0.0.1') {
      return '127.0.0.1';
    }
    
    // Remove IPv6 prefix if present (::ffff:192.168.1.1 -> 192.168.1.1)
    if (clientIP.startsWith('::ffff:')) {
      return clientIP.substring(7);
    }
    
    return clientIP;
  }
  
  // Priority 2: Check X-Real-IP header (nginx, etc.)
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    if (realIP === '::1') return '127.0.0.1';
    if (realIP.startsWith('::ffff:')) return realIP.substring(7);
    return realIP;
  }
  
  // Priority 3: Check CF-Connecting-IP (Cloudflare)
  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP) {
    if (cfIP === '::1') return '127.0.0.1';
    if (cfIP.startsWith('::ffff:')) return cfIP.substring(7);
    return cfIP;
  }
  
  // Priority 4: Direct connection IP
  let directIP = req.connection?.remoteAddress || 
                 req.socket?.remoteAddress || 
                 req.ip;
  
  if (directIP) {
    // Convert IPv6 loopback to IPv4
    if (directIP === '::1' || directIP === '::ffff:127.0.0.1') {
      return '127.0.0.1';
    }
    
    // Remove IPv6 prefix
    if (directIP.startsWith('::ffff:')) {
      directIP = directIP.substring(7);
    }
    
    return directIP;
  }
  
  // Fallback
  return 'Unknown';
}

/**
 * Generate a unique user ID with pattern: USR-XXXYYY
 * Where XXX are random uppercase letters and YYY are random numbers
 * Example: USR-ABC123, USR-XYZ789
 */
function generateUserId() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  
  let letterPart = '';
  for (let i = 0; i < 3; i++) {
    letterPart += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  let numberPart = '';
  for (let i = 0; i < 3; i++) {
    numberPart += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return `USR-${letterPart}${numberPart}`;
}

/**
 * Check if user ID already exists in database
 */
async function isUserIdUnique(userId) {
  try {
    const result = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    return result.rows.length === 0;
  } catch (err) {
    console.error('Error checking user ID uniqueness:', err);
    return false;
  }
}

/**
 * Generate a unique user ID (retry if duplicate)
 */
async function generateUniqueUserId() {
  let userId;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!isUnique && attempts < maxAttempts) {
    userId = generateUserId();
    isUnique = await isUserIdUnique(userId);
    attempts++;
  }
  
  if (!isUnique) {
    // Fallback: add timestamp to ensure uniqueness
    userId = `USR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }
  
  return userId;
}

// Create express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));


app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// quick health check for API routing (add this near the top after app/static middleware)
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});


// PostgreSQL Connection with retry logic
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',    // Changed from 'root' to default PostgreSQL user        
    password: process.env.DB_PASSWORD || '0306',
    port: process.env.DB_PORT || 5432   // Added port for PostgreSQL
};


// Replace the existing connectWithRetry function with this updated version:
async function connectWithRetry(maxRetries = 10, delay = 5000) {
    let retries = 0;
    let rootPool = null;

    const setupDatabase = async () => {
        try {
            // First connect to default postgres database
            rootPool = new Pool({
                ...dbConfig,
                database: 'postgres'
            });

            // Check if database exists
            const dbCheckResult = await rootPool.query(
                "SELECT 1 FROM pg_database WHERE datname = $1",
                ['apollo_tyres']
            );

            // Create database if it doesn't exist
            if (dbCheckResult.rows.length === 0) {
                console.log('Database apollo_tyres does not exist, creating it now...');
                await rootPool.query('CREATE DATABASE apollo_tyres');
                console.log('Database apollo_tyres created successfully');
            } else {
                console.log('Database apollo_tyres already exists');
            }

            // Close connection to postgres database
            await rootPool.end();

            // Create new pool for apollo_tyres database
            const pool = new Pool({
                ...dbConfig,
                database: 'apollo_tyres'
            });

            // Test connection and create tables
            await pool.query('SELECT NOW()');
            console.log('Connected to PostgreSQL database');

            // Create tables
            const tables = [
                {
    name: 'users',
    query: `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(20) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'engineer',
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
    )`
},
                {
                    name: 'mf_data',
                    query: `
                CREATE TABLE IF NOT EXISTS mf_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    ips VARCHAR(255),
                    loads VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    slip_angle VARCHAR(255),
                    slip_ratio VARCHAR(255),
                    test_velocity VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },

                {
                    name: 'mf52_data',
                    query: `
                CREATE TABLE IF NOT EXISTS mf52_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    loads VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    slip_angle VARCHAR(255),
                    slip_ratio VARCHAR(255),
                    test_velocity VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },
                {
                    name: 'ftire_data',
                    query: `
                CREATE TABLE IF NOT EXISTS ftire_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    loads VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    test_velocity VARCHAR(255),
                    longitudinal_slip VARCHAR(255),
                    slip_angle VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    cleat_orientation VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },

                {
                    name: 'cdtire_data',
                    query: `
                CREATE TABLE IF NOT EXISTS cdtire_data (
                    number_of_runs INT,
                    test_name VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    velocity VARCHAR(255),
                    preload VARCHAR(255),
                    camber VARCHAR(255),
                    slip_angle VARCHAR(255),
                    displacement VARCHAR(255),
                    slip_range VARCHAR(255),
                    cleat VARCHAR(255),
                    road_surface VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255),
                    fortran_file VARCHAR(255),
                    python_script VARCHAR(255)
                )
            `
                },
                {
                    name: 'custom_data',
                    query: `
                CREATE TABLE IF NOT EXISTS custom_data (
                    number_of_runs INT,
                    tests VARCHAR(255),
                    inflation_pressure VARCHAR(255),
                    loads VARCHAR(255),
                    inclination_angle VARCHAR(255),
                    slip_angle VARCHAR(255),
                    slip_ratio VARCHAR(255),
                    test_velocity VARCHAR(255),
                    cleat_orientation VARCHAR(255),
                    displacement VARCHAR(255),
                    job VARCHAR(255),
                    old_job VARCHAR(255),
                    template_tydex VARCHAR(255),
                    tydex_name VARCHAR(255),
                    p VARCHAR(255),
                    l VARCHAR(255)
                )
            `
                },

                {
                    name: 'projects',
                    query: `
                CREATE TABLE IF NOT EXISTS projects (
                    id SERIAL PRIMARY KEY,
                    project_name VARCHAR(255) NOT NULL,
                    region VARCHAR(100) NOT NULL,
                    department VARCHAR(100) NOT NULL,
                    tyre_size VARCHAR(100) NOT NULL,
                    protocol VARCHAR(50) NOT NULL,
                    status VARCHAR(50) DEFAULT 'Not Started',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    user_email VARCHAR(255)
                )
            `
                },

                // ➜ ADD BELOW inside the `tables` array in connectWithRetry()

{
  name: 'mf62_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS mf62_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      ips VARCHAR(255),
      loads VARCHAR(255),
      inclination_angle VARCHAR(255),
      slip_angle VARCHAR(255),
      slip_ratio VARCHAR(255),
      test_velocity VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'mf52_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS mf52_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      inflation_pressure VARCHAR(255),
      loads VARCHAR(255),
      inclination_angle VARCHAR(255),
      slip_angle VARCHAR(255),
      slip_ratio VARCHAR(255),
      test_velocity VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'cdtire_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS cdtire_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      test_name VARCHAR(255),
      inflation_pressure VARCHAR(255),
      velocity VARCHAR(255),
      preload VARCHAR(255),
      camber VARCHAR(255),
      slip_angle VARCHAR(255),
      displacement VARCHAR(255),
      slip_range VARCHAR(255),
      cleat VARCHAR(255),
      road_surface VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      fortran_file VARCHAR(255),
      python_script VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'ftire_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS ftire_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      loads VARCHAR(255),
      inflation_pressure VARCHAR(255),
      test_velocity VARCHAR(255),
      longitudinal_slip VARCHAR(255),
      slip_angle VARCHAR(255),
      inclination_angle VARCHAR(255),
      cleat_orientation VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},
{
  name: 'custom_project_data',
  query: `
    CREATE TABLE IF NOT EXISTS custom_project_data (
      id BIGSERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      number_of_runs INT,
      tests VARCHAR(255),
      inflation_pressure VARCHAR(255),
      loads VARCHAR(255),
      inclination_angle VARCHAR(255),
      slip_angle VARCHAR(255),
      slip_ratio VARCHAR(255),
      test_velocity VARCHAR(255),
      cleat_orientation VARCHAR(255),
      displacement VARCHAR(255),
      job VARCHAR(255),
      old_job VARCHAR(255),
      template_tydex VARCHAR(255),
      tydex_name VARCHAR(255),
      p VARCHAR(255),
      l VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},

{
  name: 'protocol_drafts',
  query: `
    CREATE TABLE IF NOT EXISTS protocol_drafts (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      protocol VARCHAR(50) NOT NULL,
      inputs_json JSONB DEFAULT '{}'::jsonb,
      matrix_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(project_id, protocol)
    )`
},

{
  name: 'tydex_files',
  query: `
    CREATE TABLE IF NOT EXISTS tydex_files (
      id SERIAL PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      protocol VARCHAR(50) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      content TEXT,  --  ADD THIS if you want to store Tydex content
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
},

//  ADD THIS BLOCK after creating the activity_logs table

{
  name: 'activity_logs',
  query: `
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      user_name VARCHAR(255),
      activity_type VARCHAR(100),
      action VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'success',
      ip_address VARCHAR(100),
      browser VARCHAR(100),
      device_type VARCHAR(50),
      related_entity_id INT,
      related_entity_type VARCHAR(100),
      project_name VARCHAR(255),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `
}
                // ... Add other table creation queries
            ];

            // In server.js, after creating tydex_files table:
try {
    await pool.query(`
        ALTER TABLE tydex_files 
        ADD CONSTRAINT tydex_files_unique_file 
        UNIQUE (project_id, filename);
    `);
    console.log('Added unique constraint to tydex_files');
} catch (e) {
    // Ignore if constraint already exists
    if (!e.message.includes('already exists')) {
        console.warn('tydex_files constraint error:', e.message);
    }
}

            // Create tables sequentially
            for (const table of tables) {
                try {
                    await pool.query(table.query);
                    console.log(`${table.name} table created successfully`);
                } catch (err) {
                    console.error(`Error creating ${table.name} table:`, err);
                }
            }

            // ➜ ADD AFTER the for..of tables-creation loop
try {
  await pool.query(`
    ALTER TABLE mf62_project_data
      ADD CONSTRAINT mf62_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_mf62_proj_project_id ON mf62_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_mf62_proj_runs       ON mf62_project_data(project_id, number_of_runs);

    ALTER TABLE mf52_project_data
      ADD CONSTRAINT mf52_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_mf52_proj_project_id ON mf52_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_mf52_proj_runs       ON mf52_project_data(project_id, number_of_runs);

    ALTER TABLE cdtire_project_data
      ADD CONSTRAINT cdtire_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_cdtire_proj_project_id ON cdtire_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_cdtire_proj_runs       ON cdtire_project_data(project_id, number_of_runs);

    ALTER TABLE ftire_project_data
      ADD CONSTRAINT ftire_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_ftire_proj_project_id ON ftire_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_ftire_proj_runs       ON ftire_project_data(project_id, number_of_runs);

    ALTER TABLE custom_project_data
      ADD CONSTRAINT custom_project_data_uniq_run UNIQUE (project_id, number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_custom_proj_project_id ON custom_project_data(project_id);
    CREATE INDEX IF NOT EXISTS idx_custom_proj_runs       ON custom_project_data(project_id, number_of_runs);
  `);
  console.log('Ensured constraints/indexes on *_project_data tables');
} catch (e) {
  // benign if constraint already exists — ignore duplicate errors
  console.warn('Constraint/index bootstrap error (safe to ignore if already exists):', e.message);
}

// After projects table is created, add this:
try {
  await pool.query(`
    ALTER TABLE projects 
    ADD COLUMN IF NOT EXISTS previous_status VARCHAR(50)
  `);
  console.log("Ensured 'previous_status' column exists on projects table");
} catch (e) {
  console.error("Error ensuring 'previous_status' column:", e);
}

// ============================================
// MIGRATION: Convert user IDs from SERIAL to custom pattern
// ============================================
try {
  // Check if id column is already VARCHAR
  const checkColumnType = await pool.query(`
    SELECT data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'id'
  `);
  
  if (checkColumnType.rows.length > 0 && checkColumnType.rows[0].data_type !== 'character varying') {
    console.log('🔄 Migrating user IDs from SERIAL to custom pattern...');
    
    // Step 1: Get all existing users
    const existingUsers = await pool.query('SELECT id, email FROM users ORDER BY id');
    
    if (existingUsers.rows.length > 0) {
      console.log(`Found ${existingUsers.rows.length} existing users to migrate`);
      
      // Step 2: Create temporary table with new structure
      await pool.query(`
        CREATE TABLE users_temp (
          id VARCHAR(20) PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'engineer',
          name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        )
      `);
      
      // Step 3: Copy data with new IDs
      for (const user of existingUsers.rows) {
        const newUserId = await generateUniqueUserId();
        const oldId = user.id;
        
        await pool.query(`
          INSERT INTO users_temp (id, email, password, role, name, created_at, updated_at, last_login)
          SELECT $1, email, password, role, name, created_at, updated_at, last_login
          FROM users WHERE id = $2
        `, [newUserId, oldId]);
        
        // Update foreign key references in projects table
        await pool.query(`
          UPDATE projects SET user_email = (SELECT email FROM users WHERE id = $1)
          WHERE user_email = (SELECT email FROM users WHERE id = $1)
        `, [oldId]);
        
        console.log(`Migrated user ${user.email}: ${oldId} -> ${newUserId}`);
      }
      
      // Step 4: Drop old table and rename temp table
      await pool.query('DROP TABLE users CASCADE');
      await pool.query('ALTER TABLE users_temp RENAME TO users');
      
      console.log(' User ID migration completed successfully');
    } else {
      // No existing users, just alter the table structure
      await pool.query('DROP TABLE users CASCADE');
      await pool.query(`
        CREATE TABLE users (
          id VARCHAR(20) PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'engineer',
          name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        )
      `);
      console.log(' Users table recreated with VARCHAR ID (no existing data)');
    }
  } else {
    console.log(' Users table already using VARCHAR for ID column');
  }
} catch (migrationErr) {
  console.error(' Error during user ID migration:', migrationErr);
  // Don't throw error - allow server to continue starting
}

            /* ➜ ADD THIS BLOCK (ensures 'name' column on users) */
try {
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)");
  console.log("Ensured 'name' column exists on users table");
} catch (e) {
  console.error("Error ensuring 'name' column:", e);
}

//  ADD THIS after the users 'name' column migration
try {
  await pool.query("ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS project_name VARCHAR(255)");
  console.log("Ensured 'project_name' column exists on activity_logs table");
} catch (e) {
  console.error("Error ensuring 'project_name' column:", e);
}

            // Ensure 'inputs' column exists on existing databases
try {
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS inputs JSONB DEFAULT '{}'::jsonb");
  console.log("Ensured 'inputs' column exists on projects table");
} catch (e) {
  console.error("Error ensuring 'inputs' column:", e);
}

// Add indexes for faster row lookups
try {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_mf_data_runs ON mf_data(number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_mf52_data_runs ON mf52_data(number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_ftire_data_runs ON ftire_data(number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_cdtire_data_runs ON cdtire_data(number_of_runs);
    CREATE INDEX IF NOT EXISTS idx_custom_data_runs ON custom_data(number_of_runs);
  `);
  console.log('Ensured indexes on *_data tables for number_of_runs');
} catch (e) {
  console.warn('Index creation warning:', e.message);
}


            return pool;

        } catch (error) {
            if (rootPool) {
                try {
                    await rootPool.end();
                } catch (endError) {
                    console.error('Error closing root pool:', endError);
                }
            }
            throw error;
        }
    };

    // Function to try connecting with retry logic
    const tryConnect = async () => {
        try {
            return await setupDatabase();
        } catch (err) {
            console.error(`Error connecting to PostgreSQL database (attempt ${retries + 1}):`, err);

            if (retries < maxRetries) {
                retries++;
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return tryConnect();
            }

            console.error(`Max retries (${maxRetries}) reached. Unable to connect to PostgreSQL database.`);
            throw err;
        }
    };

    return tryConnect();
}

let db;

(async () => {
    try {
        db = await connectWithRetry();
        console.log('Database connection established and assigned to db variable');
        
        // Add this AFTER all tables are created (around line 500-600)

// ✅ ADD run_status COLUMN TO ALL PROTOCOL TABLES
try {
    console.log('✅ Adding run_status columns to protocol tables...');
    
    const tables = ['mf_data', 'mf52_data', 'ftire_data', 'cdtire_data', 'custom_data'];
    
    for (const table of tables) {
        await db.query(`
            ALTER TABLE ${table} 
            ADD COLUMN IF NOT EXISTS run_status VARCHAR(100)
        `);
    }
    
    console.log('✅ run_status columns added successfully');
} catch (e) {
    console.error('❌ Error adding run_status columns:', e);
}


        // Register inputRoutes AFTER db is ready
        try {
            const registerInputRoutes = require('./routes/inputRoutes');
            registerInputRoutes(app, db);
            console.log('[server] inputRoutes registered successfully');
        } catch (routeErr) {
            console.error('[server] failed to register inputRoutes:', routeErr && routeErr.stack || routeErr);
        }

        // NOW register the catch-all 404 handlers (AFTER all routes)
        // Generic JSON 404 for API routes — must be placed AFTER all /api/* endpoints
        app.all('/api/*', (_req, res) => {
            res.status(404).json({ success: false, message: 'Not found' });
        });

        // Catch-all for SPA (keep last)
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'login.html'));
        });

        // Start the server AFTER everything is registered
        // Start the server
        const port = process.env.PORT || 3001;
        
        const startServer = (attemptPort) => {
            app.listen(attemptPort).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`Port ${attemptPort} is busy, trying ${attemptPort + 1}...`);
                startServer(attemptPort + 1);
            } else {
                console.error('Server error:', err);
            }
        })
        .on('listening', () => {
            console.log(`Server running on port ${attemptPort}`);
        });
    };
    startServer(port);

    } catch (err) {
        console.error('Failed to establish database connection:', err);
        process.exit(1);  // Exit if we can't connect to the database
    }
})();

async function listTydexFiles(projectId) {
    const q = `
    SELECT id, protocol, filename, created_at
    FROM tydex_files
    WHERE project_id = $1
    ORDER BY created_at DESC;
    `;
    const { rows } = await db.query(q, [projectId]);
        return rows;
    }

// Login API endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required'
        });
    }

    try {
        // Begin transaction
        await db.query('BEGIN');

        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        // Check if user exists
        if (result.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const user = result.rows[0];

        // Compare password using bcrypt
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            await db.query('ROLLBACK');
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last_login timestamp
        await db.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Create JWT token
const token = jwt.sign(
    {
        userId: user.id, // Now contains custom ID like USR-ABC123
        email: user.email,
        role: user.role,
        name: user.name
    },
    JWT_SECRET,
    { expiresIn: '1h' }
);


        await db.query('COMMIT');

        // ===== START: safe, truncated activity log insert (avoid varchar/placeholder errors) =====
        try {
          const truncate = (v, len) => {
            if (v === null || v === undefined) return null;
            const s = String(v);
            return s.length > len ? s.slice(0, len) : s;
          };

          const user_email = truncate(user.email, 200);
          const user_name = truncate(user.name || '', 100);
          const activity_type = truncate('Authentication', 50);
          const action = truncate('User Login', 100);
          const description = truncate('User logged in successfully', 300);
          const statusVal = truncate('success', 50);
          const ip_address = truncate(getClientIP(req), 100);
          const browser = truncate(req.headers['user-agent'] || '', 250);
          const device_type = truncate(parseDeviceType(req.headers['user-agent'] || ''), 50);
          const related_entity_id_val = null;
          const related_entity_type_val = null;
          const project_name_val = null;
          const metadataVal = truncate(JSON.stringify({ ip: ip_address }), 1000);

          const insertActivityQ = `
            INSERT INTO activity_logs (
              user_email, user_name, activity_type, action, description,
              status, ip_address, browser, device_type,
              related_entity_id, related_entity_type, project_name, metadata, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
            RETURNING *
          `;

          await db.query(insertActivityQ, [
            user_email,
            user_name,
            activity_type,
            action,
            description,
            statusVal,
            ip_address,
            browser,
            device_type,
            related_entity_id_val,
            related_entity_type_val,
            project_name_val,
            metadataVal
          ]);
        } catch (logError) {
          console.warn('Failed to log login activity (safe insert):', logError && logError.message ? logError.message : logError);
        }
        // ===== END safe activity log insert =====


        return res.json({
            success: true,
            token: token,
            role: user.role,
            message: 'Login successful'
        });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Login error:', err);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

app.post('/api/register', async (req, res) => {
    const { email, password, role, name } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required.'
        });
    }

    try {
        // Generate unique user ID
        const userId = await generateUniqueUserId();
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user with custom ID
        const result = await db.query(
            'INSERT INTO users (id, email, password, role, name) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, name',
            [userId, email, hashedPassword, role, name || null]
        );

        res.json({
            success: true,
            message: 'User registered successfully.',
            user: result.rows[0]
        });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            res.status(409).json({
                success: false,
                message: 'Email already exists.'
            });
        } else {
            console.error('Registration error:', err);
            res.status(500).json({
                success: false,
                message: 'Registration failed.'
            });
        }
    }
});

// Token verification endpoint
app.get('/api/verify-token', authenticateToken, (req, res) => {
    // If authentication middleware passes, token is valid
    res.json({
        success: true,
        user: { email: req.user.email }
    });
});

/**
 * GET /api/me
 * Return the current user with created_at, last_login, and project statistics.
 * Uses email from your JWT payload (set in authenticateToken).
 * 
 * Response format:
 * {
 *   success: true,
 *   user: {
 *     id: "USR-ABC123",
 *     email: "user@example.com",
 *     name: "User Name",
 *     role: "manager|engineer",
 *     created_at: "2025-01-15T10:30:00.000Z",
 *     last_login: "2025-10-13T08:06:48.000Z",
 *     updated_at: "2025-10-13T08:06:48.000Z",
 *     project_count: 5,
 *     account_age_days: 272
 *   }
 * }
 */
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    // Extract email from JWT token
    const email = req.user && req.user.email;
    
    if (!email) {
      console.warn('[GET /api/me] No email found in JWT token');
      return res.status(401).json({ 
        success: false,
        error: 'unauthorized',
        message: 'Authentication token is invalid or missing email' 
      });
    }

    console.log(`[GET /api/me] Fetching user data for: ${email}`);

    // Query user data with all relevant fields
    const userQuery = `
      SELECT 
        id, 
        email, 
        role, 
        name, 
        created_at, 
        last_login,
        updated_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `;
    
    const userResult = await db.query(userQuery, [email]);
    
    // Check if user exists
    if (!userResult.rows || userResult.rows.length === 0) {
      console.warn(`[GET /api/me] User not found in database: ${email}`);
      return res.status(404).json({ 
        success: false,
        error: 'not found',
        message: 'User account not found in database' 
      });
    }

    const user = userResult.rows[0];

    // Get project count for this user
    let projectCount = 0;
    try {
      const projectCountQuery = `
        SELECT COUNT(*) as count
        FROM projects
        WHERE user_email = $1
      `;
      const projectCountResult = await db.query(projectCountQuery, [email]);
      projectCount = parseInt(projectCountResult.rows[0].count) || 0;
    } catch (projectErr) {
      console.error('[GET /api/me] Error fetching project count:', projectErr);
      // Don't fail the request if project count fails
    }

    // Calculate account age in days
    let accountAgeDays = 0;
    if (user.created_at) {
      const createdDate = new Date(user.created_at);
      const currentDate = new Date();
      const diffTime = Math.abs(currentDate - createdDate);
      accountAgeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Prepare response data
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0], // Fallback to email username if name is null
      role: user.role,
      created_at: user.created_at,
      last_login: user.last_login,
      updated_at: user.updated_at || user.created_at,
      project_count: projectCount,
      account_age_days: accountAgeDays
    };

    console.log(`[GET /api/me] Successfully fetched user data for: ${email} (ID: ${user.id})`);

    return res.json({ 
      success: true,
      user: userData 
    });

  } catch (error) {
    console.error('[GET /api/me] Server error:', error);
    console.error('[GET /api/me] Stack trace:', error.stack);
    
    return res.status(500).json({ 
      success: false,
      error: 'server error',
      message: 'An error occurred while fetching user information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/me/stats
 * Return detailed statistics for the current user
 * Includes project breakdown, recent activity, and usage metrics
 */
app.get('/api/me/stats', authenticateToken, async (req, res) => {
  try {
    const email = req.user && req.user.email;
    
    if (!email) {
      return res.status(401).json({ 
        success: false,
        error: 'unauthorized' 
      });
    }

    console.log(`[GET /api/me/stats] Fetching statistics for: ${email}`);

    // Get project statistics
    const projectStatsQuery = `
      SELECT 
        COUNT(*) as total_projects,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_projects,
        COUNT(CASE WHEN status = 'In Progress' THEN 1 END) as in_progress_projects,
        COUNT(CASE WHEN status = 'Not Started' THEN 1 END) as not_started_projects,
        COUNT(CASE WHEN status = 'Archived' THEN 1 END) as archived_projects,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as projects_last_30_days,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as projects_last_7_days
      FROM projects
      WHERE user_email = $1
    `;
    
    const projectStatsResult = await db.query(projectStatsQuery, [email]);
    const projectStats = projectStatsResult.rows[0];

    // Get protocol distribution
    const protocolDistQuery = `
      SELECT protocol, COUNT(*) as count
      FROM projects
      WHERE user_email = $1
      GROUP BY protocol
      ORDER BY count DESC
    `;
    
    const protocolDistResult = await db.query(protocolDistQuery, [email]);

    // Get recent activity count
    const recentActivityQuery = `
      SELECT COUNT(*) as count
      FROM activity_logs
      WHERE user_email = $1 
      AND created_at >= NOW() - INTERVAL '24 hours'
    `;
    
    const recentActivityResult = await db.query(recentActivityQuery, [email]);
    const recentActivityCount = parseInt(recentActivityResult.rows[0].count) || 0;

    // Get total activity count
    const totalActivityQuery = `
      SELECT COUNT(*) as count
      FROM activity_logs
      WHERE user_email = $1
    `;
    
    const totalActivityResult = await db.query(totalActivityQuery, [email]);
    const totalActivityCount = parseInt(totalActivityResult.rows[0].count) || 0;

    // Get most used protocol
    const mostUsedProtocol = protocolDistResult.rows.length > 0 
      ? protocolDistResult.rows[0].protocol 
      : 'None';

    // Calculate completion rate
    const totalProjects = parseInt(projectStats.total_projects) || 0;
    const completedProjects = parseInt(projectStats.completed_projects) || 0;
    const completionRate = totalProjects > 0 
      ? ((completedProjects / totalProjects) * 100).toFixed(1) 
      : '0.0';

    const stats = {
      projects: {
        total: totalProjects,
        completed: completedProjects,
        in_progress: parseInt(projectStats.in_progress_projects) || 0,
        not_started: parseInt(projectStats.not_started_projects) || 0,
        archived: parseInt(projectStats.archived_projects) || 0,
        last_30_days: parseInt(projectStats.projects_last_30_days) || 0,
        last_7_days: parseInt(projectStats.projects_last_7_days) || 0,
        completion_rate: parseFloat(completionRate)
      },
      protocols: protocolDistResult.rows,
      most_used_protocol: mostUsedProtocol,
      activity: {
        total: totalActivityCount,
        last_24_hours: recentActivityCount
      }
    };

    console.log(`[GET /api/me/stats] Successfully fetched statistics for: ${email}`);

    return res.json({ 
      success: true,
      stats: stats 
    });

  } catch (error) {
    console.error('[GET /api/me/stats] Server error:', error);
    
    return res.status(500).json({ 
      success: false,
      error: 'server error',
      message: 'An error occurred while fetching user statistics'
    });
  }
});
/**
 * Optional helper used by the front end when it has email but no name.
 * GET /api/users/by-email?email=x
 */
app.get('/api/users/by-email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });

    const q = `
      SELECT id, email, role, name, created_at, last_login
      FROM users
      WHERE email = $1
      LIMIT 1
    `;
    const r = await db.query(q, [email]);
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });

    return res.json({ user: r.rows[0] });
  } catch (e) {
    console.error('GET /api/users/by-email', e);
    return res.status(500).json({ error: 'server error' });
  }
});


// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token required'
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        req.user = user;
        next();
    });
}

// New middleware to require manager role
function requireManager(req, res, next) {
    if (!req.user || req.user.role !== 'manager') {
        return res.status(403).json({ success: false, message: 'Manager access required' });
    }
    next();
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'protocol');
        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Use fixed filename 'output.xlsx'
        cb(null, 'output.xlsx');
    }
});

const upload = multer({ storage: storage });

// Add new endpoint for saving Excel files
app.post('/api/save-excel', upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file received'
        });
    }

    res.json({
        success: true,
        message: 'File saved successfully',
        filename: 'output.xlsx'
    });
});

// Add these utility functions after other middleware definitions
function clearProjectsFolder() {
    const projectsPath = path.join(__dirname, 'projects');
    if (fs.existsSync(projectsPath)) {
        rimraf.sync(projectsPath);
    }
    fs.mkdirSync(projectsPath, { recursive: true });
}

// Replace the existing store-excel-data endpoint with this modified version
app.post('/api/store-excel-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    // First truncate the table
    const truncateQuery = 'TRUNCATE TABLE mf_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            console.error('Error truncating table:', truncateErr);
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }

        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO mf_data 
                (number_of_runs, tests, ips, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;

            return db.query(insertQuery, [
                row.number_of_runs,
                row.tests,
                row.ips,
                row.loads,
                row.inclination_angle,
                row.slip_angle,
                row.slip_ratio,
                row.test_velocity,
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                console.error('Error storing data:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});


app.post('/api/store-project-matrix', async (req, res) => {
  try {
    const { projectId, protocol } = req.body;
    
    if (!projectId || !protocol) {
      return res.status(400).json({ success: false, message: 'projectId and protocol required' });
    }

    const scratchTableMap = {
      'MF62': 'mf_data',
      'MF52': 'mf52_data',
      'FTire': 'ftire_data',
      'CDTire': 'cdtire_data',
      'Custom': 'custom_data'
    };

    const projectTableMap = {
      'MF62': 'mf62_project_data',
      'MF52': 'mf52_project_data',
      'FTire': 'ftire_project_data',
      'CDTire': 'cdtire_project_data',
      'Custom': 'custom_project_data'
    };

    const scratchTable = scratchTableMap[protocol];
    const projectTable = projectTableMap[protocol];

    if (!scratchTable || !projectTable) {
      return res.status(400).json({ success: false, message: 'Invalid protocol' });
    }

    let insertQuery;
    
if (protocol === 'CDTire') {
    console.log(`\n${'='.repeat(80)}`);
    console.log(` STORING CDTire PROJECT MATRIX`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Project ID: ${projectId}`);
    console.log(`Protocol: ${protocol}`);
    console.log(`Scratch Table: ${scratchTable}`);
    console.log(`Project Table: ${projectTable}`);
    
    try {
        await db.query(`
            ALTER TABLE ${scratchTable} 
            ADD COLUMN IF NOT EXISTS fortran_file VARCHAR(255),
            ADD COLUMN IF NOT EXISTS python_script VARCHAR(255)
        `);
        
        await db.query(`
            ALTER TABLE ${projectTable} 
            ADD COLUMN IF NOT EXISTS fortran_file VARCHAR(255),
            ADD COLUMN IF NOT EXISTS python_script VARCHAR(255)
        `);
        
        console.log(' CDTire columns verified/added');
    } catch (alterErr) {
        console.warn('  Column alteration warning:', alterErr.message);
    }

    console.log(`  Deleting ALL existing rows for project_id=${projectId}...`);
    try {
        // First check what exists
        const checkResult = await db.query(
            `SELECT COUNT(*) as count, 
                    string_agg(DISTINCT number_of_runs::text, ', ') as runs 
             FROM ${projectTable} 
             WHERE project_id = $1`,
            [projectId]
        );
        
        const existingCount = parseInt(checkResult.rows[0].count) || 0;
        const existingRuns = checkResult.rows[0].runs || 'none';
        
        console.log(` Found ${existingCount} existing rows with runs: ${existingRuns}`);
        
        // Now delete
        const deleteResult = await db.query(
            `DELETE FROM ${projectTable} WHERE project_id = $1`,
            [projectId]
        );
        
        console.log(` Deleted ${deleteResult.rowCount} existing CDTire rows`);
        
        const verifyResult = await db.query(
            `SELECT COUNT(*) as count FROM ${projectTable} WHERE project_id = $1`,
            [projectId]
        );
        
        const remainingCount = parseInt(verifyResult.rows[0].count) || 0;
        
        if (remainingCount > 0) {
            throw new Error(`DELETE failed - ${remainingCount} rows still exist for project_id=${projectId}`);
        }
        
        console.log(` Verified: 0 rows remain for project_id=${projectId}`);
        
    } catch (deleteErr) {
        console.error(' Error deleting existing rows:', deleteErr);
        throw new Error(`Failed to delete existing data: ${deleteErr.message}`);
    }

    // STEP 3: Build INSERT query
    insertQuery = `
      INSERT INTO ${projectTable} 
      (
        project_id, 
        number_of_runs, 
        test_name, 
        inflation_pressure, 
        velocity, 
        preload, 
        camber, 
        slip_angle, 
        displacement, 
        slip_range, 
        cleat, 
        road_surface, 
        job, 
        old_job, 
        template_tydex, 
        tydex_name, 
        p, 
        l, 
        fortran_file, 
        python_script
      )
        SELECT
        $1,
        s.number_of_runs,
        s.test_name,
        s.inflation_pressure,
        s.velocity,
        s.preload,
        s.camber,
        s.slip_angle,
        s.displacement,
        s.slip_range,
        s.cleat,
        s.road_surface,
        s.job,
        s.old_job,
        s.template_tydex,
        s.tydex_name,
        s.p,
        s.l,
        COALESCE(s.fortran_file, ''),
        COALESCE(s.python_script, '')
      FROM (
        -- pick one row per number_of_runs (avoid inserting duplicates)
        SELECT DISTINCT ON (number_of_runs)
          number_of_runs, test_name, inflation_pressure, velocity, preload, camber,
          slip_angle, displacement, slip_range, cleat, road_surface, job, old_job,
          template_tydex, tydex_name, p, l, fortran_file, python_script
        FROM ${scratchTable}
        ORDER BY number_of_runs
      ) s
      ON CONFLICT (project_id, number_of_runs)
      DO UPDATE SET
        test_name       = EXCLUDED.test_name,
        inflation_pressure = EXCLUDED.inflation_pressure,
        velocity        = EXCLUDED.velocity,
        preload         = EXCLUDED.preload,
        camber          = EXCLUDED.camber,
        slip_angle      = EXCLUDED.slip_angle,
        displacement    = EXCLUDED.displacement,
        slip_range      = EXCLUDED.slip_range,
        cleat           = EXCLUDED.cleat,
        road_surface    = EXCLUDED.road_surface,
        job             = EXCLUDED.job,
        old_job         = EXCLUDED.old_job,
        template_tydex  = EXCLUDED.template_tydex,
        tydex_name      = EXCLUDED.tydex_name,
        p               = EXCLUDED.p,
        l               = EXCLUDED.l,
        fortran_file    = EXCLUDED.fortran_file,
        python_script   = EXCLUDED.python_script
    `;
    
    console.log(` INSERT query prepared for CDTire`);
}
    // ============================================
    // MF62 PROTOCOL HANDLING
    // ============================================
    else if (protocol === 'MF62') {
      console.log(`  Deleting existing MF62 rows for project_id=${projectId}...`);
      const deleteResult = await db.query(`DELETE FROM ${projectTable} WHERE project_id = $1`, [projectId]);
      console.log(` Deleted ${deleteResult.rowCount} existing MF62 rows`);
      
      insertQuery = `
        INSERT INTO ${projectTable} 
        (project_id, number_of_runs, tests, ips, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l)
        SELECT $1, s.number_of_runs, s.tests, s.ips, s.loads, s.inclination_angle, s.slip_angle, s.slip_ratio, s.test_velocity, s.job, s.old_job, s.template_tydex, s.tydex_name, s.p, s.l
        FROM (
          SELECT DISTINCT ON (number_of_runs)
            number_of_runs, tests, ips, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l
          FROM ${scratchTable}
          ORDER BY number_of_runs
        ) s
      `;
    } 
    // ============================================
    // MF52 PROTOCOL HANDLING
    // ============================================
    else if (protocol === 'MF52') {
      console.log(`  Deleting existing MF52 rows for project_id=${projectId}...`);
      const deleteResult = await db.query(`DELETE FROM ${projectTable} WHERE project_id = $1`, [projectId]);
      console.log(` Deleted ${deleteResult.rowCount} existing MF52 rows`);
      
      insertQuery = `
        INSERT INTO ${projectTable}
        (project_id, number_of_runs, tests, inflation_pressure, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l)
        SELECT $1, s.number_of_runs, s.tests, s.inflation_pressure, s.loads, s.inclination_angle, s.slip_angle, s.slip_ratio, s.test_velocity, s.job, s.old_job, s.template_tydex, s.tydex_name, s.p, s.l
        FROM (
          SELECT DISTINCT ON (number_of_runs)
            number_of_runs, tests, inflation_pressure, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l
          FROM ${scratchTable}
          ORDER BY number_of_runs
        ) s
      `;
    } 
    // ============================================
    // FTIRE PROTOCOL HANDLING
    // ============================================
    else if (protocol === 'FTire') {
      console.log(`  Deleting existing FTire rows for project_id=${projectId}...`);
      const deleteResult = await db.query(`DELETE FROM ${projectTable} WHERE project_id = $1`, [projectId]);
      console.log(` Deleted ${deleteResult.rowCount} existing FTire rows`);
      
      insertQuery = `
        INSERT INTO ${projectTable}
        (project_id, number_of_runs, tests, loads, inflation_pressure, test_velocity, longitudinal_slip, slip_angle, inclination_angle, cleat_orientation, job, old_job, template_tydex, tydex_name, p, l)
        SELECT $1, s.number_of_runs, s.tests, s.loads, s.inflation_pressure, s.test_velocity, s.longitudinal_slip, s.slip_angle, s.inclination_angle, s.cleat_orientation, s.job, s.old_job, s.template_tydex, s.tydex_name, s.p, s.l
        FROM (
          SELECT DISTINCT ON (number_of_runs)
            number_of_runs, tests, loads, inflation_pressure, test_velocity, longitudinal_slip, slip_angle, inclination_angle, cleat_orientation, job, old_job, template_tydex, tydex_name, p, l
          FROM ${scratchTable}
          ORDER BY number_of_runs
        ) s
      `;
    } 
    // ============================================
    // CUSTOM PROTOCOL HANDLING
    // ============================================
    else if (protocol === 'Custom') {
      console.log(`  Deleting existing Custom rows for project_id=${projectId}...`);
      const deleteResult = await db.query(`DELETE FROM ${projectTable} WHERE project_id = $1`, [projectId]);
      console.log(` Deleted ${deleteResult.rowCount} existing Custom rows`);
      
      insertQuery = `
        INSERT INTO ${projectTable}
        (project_id, number_of_runs, tests, inflation_pressure, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, cleat_orientation, displacement, job, old_job, template_tydex, tydex_name, p, l)
        SELECT $1, s.number_of_runs, s.tests, s.inflation_pressure, s.loads, s.inclination_angle, s.slip_angle, s.slip_ratio, s.test_velocity, s.cleat_orientation, s.displacement, s.job, s.old_job, s.template_tydex, s.tydex_name, s.p, s.l
        FROM (
          SELECT DISTINCT ON (number_of_runs)
            number_of_runs, tests, inflation_pressure, loads, inclination_angle, slip_angle, slip_ratio, test_velocity, cleat_orientation, displacement, job, old_job, template_tydex, tydex_name, p, l
          FROM ${scratchTable}
          ORDER BY number_of_runs
        ) s
      `;
    }

    // ============================================
    // EXECUTE THE INSERT QUERY
    // ============================================
    const insertResult = await db.query(insertQuery, [projectId]);
    
    console.log(` Successfully inserted ${insertResult.rowCount} rows into ${projectTable}`);
    console.log(`${'='.repeat(80)}\n`);
    
    res.json({ 
      success: true, 
      message: 'Matrix data saved to project table',
      rowsInserted: insertResult.rowCount 
    });

  } catch (error) {
    console.error(' Error storing project matrix:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Update Excel file reading endpoint to be page-specific
app.get('/api/read-protocol-excel', (req, res) => {
    const protocolDir = path.join(__dirname, 'protocol');
    const referer = req.headers.referer || '';
    let fileName;

    if (referer.includes('ftire.html')) {
        fileName = 'FTire.xlsx';
    } else if (referer.includes('mf52.html')) {
        fileName = 'MF5pt2.xlsx';
    } else if (referer.includes('mf.html')) {
        fileName = 'MF6pt2.xlsx';
    } else if (referer.includes('cdtire.html')) {
        fileName = 'CDTire.xlsx';
    } else if (referer.includes('custom.html')) {
        fileName = 'Custom.xlsx';
    } else {
        return res.status(400).json({
            success: false,
            message: 'Unknown protocol page'
        });
    }

    const filePath = path.join(protocolDir, fileName);

    if (!fs.existsSync(protocolDir)) {
        fs.mkdirSync(protocolDir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: `${fileName} not found in protocol folder`
        });
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error reading Excel file'
            });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(data);
    });
});

// Add new endpoint for reading output Excel file
app.get('/api/read-output-excel', (req, res) => {
    const filePath = path.join(__dirname, 'protocol', 'output.xlsx');

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: 'Output file not found'
        });
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error('Error reading Excel file:', err);
            return res.status(500).json({
                success: false,
                message: 'Error reading Excel file'
            });
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(data);
    });
});

// Add new endpoint to get MF data
app.get('/api/get-mf-data', (req, res) => {
    const query = 'SELECT * FROM mf_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching MF data:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

// Add new endpoint to get test summary data
app.get('/api/get-test-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM mf_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching test summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

// Add new endpoint to get MF 5.2 data
app.post('/api/store-mf52-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    // First truncate the table
    const truncateQuery = 'TRUNCATE TABLE mf52_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }

        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO mf52_data 
                (number_of_runs, tests, inflation_pressure, loads, inclination_angle, 
                 slip_angle, slip_ratio, test_velocity, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `;

            return db.query(insertQuery, [
                row.number_of_runs,
                row.tests,
                row.inflation_pressure,
                row.loads,
                row.inclination_angle,
                row.slip_angle,
                row.slip_ratio,
                row.test_velocity,
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

// Add endpoint to get MF 5.2 data
app.get('/api/get-mf52-data', (req, res) => {
    const query = 'SELECT * FROM mf52_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

// Add new endpoint for MF 5.2 test summary data
app.get('/api/get-mf52-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM mf52_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching MF 5.2 summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []); // Changed from results to results.rows
    });
});

// Add FTire data endpoints with correct columns
app.post('/api/store-ftire-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    const truncateQuery = 'TRUNCATE TABLE ftire_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }

        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO ftire_data 
                (number_of_runs, tests, loads, inflation_pressure, test_velocity,
                 longitudinal_slip, slip_angle, inclination_angle, cleat_orientation, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `;

            return db.query(insertQuery, [
                row.number_of_runs || 0,
                row.tests || '',
                row.loads || '',
                row.inflation_pressure || '',
                row.test_velocity || '',
                row.longitudinal_slip || '',
                row.slip_angle || '',
                row.inclination_angle || '',
                row.cleat_orientation || '',
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

app.get('/api/get-ftire-data', (req, res) => {
    const query = 'SELECT * FROM ftire_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

app.get('/api/get-ftire-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM ftire_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []); // Changed from results to results.rows
    });
});


// Update around line 1540

app.post('/api/store-cdtire-data', async (req, res) => {
    try {
        const { data, projectId } = req.body;

        if (!Array.isArray(data) || !data.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid data format'
            });
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log(`📊 STORING CDTire DATA TO SCRATCH TABLE`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Rows to insert: ${data.length}`);
        console.log(`Project ID: ${projectId || 'Not provided'}`);

        await db.query('TRUNCATE TABLE cdtire_data CASCADE');
        console.log('✅ Scratch table truncated');

        // ✅ Ensure ALL necessary columns exist
        await db.query(`
            ALTER TABLE cdtire_data 
            ADD COLUMN IF NOT EXISTS fortran_file VARCHAR(255),
            ADD COLUMN IF NOT EXISTS python_script VARCHAR(255),
            ADD COLUMN IF NOT EXISTS template_tydex VARCHAR(255),
            ADD COLUMN IF NOT EXISTS tydex_name VARCHAR(255)
        `);
        console.log('✅ Columns verified/added');

        const insertPromises = data.map(row => {
            return db.query(`
                INSERT INTO cdtire_data (
                    number_of_runs, test_name, inflation_pressure, velocity, preload,
                    camber, slip_angle, displacement, slip_range, cleat, road_surface,
                    job, old_job, fortran_file, python_script, p, l,
                    template_tydex, tydex_name
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            `, [
                row.number_of_runs, row.test_name, row.inflation_pressure, row.velocity, row.preload,
                row.camber, row.slip_angle, row.displacement, row.slip_range, row.cleat, row.road_surface,
                row.job, row.old_job, row.fortran_file, row.python_script, row.p, row.l,
                row.template_tydex || null, // ✅ NEW: Template Tydex column
                row.tydex_name || null       // ✅ NEW: Tydex Name column
            ]);
        });

        await Promise.all(insertPromises);

        console.log(`✅ CDTire data inserted successfully (${data.length} rows)`);
        console.log(`${'='.repeat(80)}\n`);

        res.json({
            success: true,
            message: 'Data stored successfully',
            rowsInserted: data.length
        });

    } catch (err) {
        console.error('❌ Error storing CDTire data:', err);
        res.status(500).json({
            success: false,
            message: 'Error storing data: ' + err.message
        });
    }
});

app.get('/api/get-cdtire-data', (req, res) => {
    const query = 'SELECT * FROM cdtire_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Changed from results to results.rows
    });
});

app.get('/api/get-cdtire-summary', (req, res) => {
    const query = `
        SELECT test_name, COUNT(*) as count
        FROM cdtire_data
        WHERE test_name IS NOT NULL AND test_name != ''
        GROUP BY test_name
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching CDTire summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []); // Changed from results to results.rows
    });
});

// Add Custom data endpoints
app.post('/api/store-custom-data', (req, res) => {
    const { data } = req.body;

    if (!Array.isArray(data) || !data.length) {
        return res.status(400).json({
            success: false,
            message: 'Invalid data format'
        });
    }

    const truncateQuery = 'TRUNCATE TABLE custom_data';
    db.query(truncateQuery, (truncateErr) => {
        if (truncateErr) {
            return res.status(500).json({
                success: false,
                message: 'Error clearing existing data'
            });
        }        // PostgreSQL doesn't support the VALUES ? syntax, use individual inserts with Promise.all
        const insertPromises = data.map(row => {
            const insertQuery = `
                INSERT INTO custom_data 
                (number_of_runs, tests, inflation_pressure, loads,
                 inclination_angle, slip_angle, slip_ratio, test_velocity, 
                 cleat_orientation, displacement, job, old_job, template_tydex, tydex_name, p, l)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `;

            return db.query(insertQuery, [
                row.number_of_runs || 0,
                row.tests || '',
                row.inflation_pressure || '',
                row.loads || '',
                row.inclination_angle || '',
                row.slip_angle || '',
                row.slip_ratio || '',
                row.test_velocity || '',
                row.cleat_orientation || '',
                row.displacement || '',
                row.job || '',
                row.old_job || '',
                row.template_tydex || '',
                row.tydex_name || '',
                row.p || '',
                row.l || ''
            ]);
        });

        Promise.all(insertPromises)
            .then(() => {
                res.json({
                    success: true,
                    message: 'Data stored successfully'
                });
            })
            .catch(err => {
                return res.status(500).json({
                    success: false,
                    message: 'Error storing data'
                });
            });
    });
});

app.get('/api/get-custom-data', (req, res) => {
    const query = 'SELECT * FROM custom_data ORDER BY number_of_runs';
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching data'
            });
        }
        res.json(results.rows); // Using results.rows for PostgreSQL
    });
});

app.get('/api/get-custom-summary', (req, res) => {
    const query = `
        SELECT tests, COUNT(*) as count
        FROM custom_data
        WHERE tests IS NOT NULL AND tests != ''
        GROUP BY tests
        ORDER BY count DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching Custom summary:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching test summary'
            });
        }
        res.json(results.rows || []);
    });
});

// Add new endpoints for folder management
app.post('/api/clear-folders', (req, res) => {
    const { projectName, protocol } = req.body;
    const combinedFolderName = `${projectName}_${protocol}`;
    const projectPath = path.join(__dirname, 'projects', combinedFolderName);

    try {
        if (fs.existsSync(projectPath)) {
            rimraf.sync(projectPath);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Error clearing folders'
        });
    }
});

app.post('/api/generate-parameters', (req, res) => {
    try {
        const referer = req.headers.referer || '';
        let templatePath;
        // Select template based on protocol page
        if (referer.includes('mf.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'mf62.inc');
        } else if (referer.includes('mf52.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'mf52.inc');
        } else if (referer.includes('ftire.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'ftire.inc');
        } else if (referer.includes('cdtire.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'cdtire.inc');
        } else if (referer.includes('custom.html')) {
            templatePath = path.join(__dirname, 'templates', 'inc', 'custom.inc');
        } else {
            throw new Error('Unknown protocol');
        }

        // Generate parameters.inc in the central template location
        // This file will be copied to individual Px_Ly folders during project creation
        const outputPath = path.join(__dirname, 'templates', 'inc', 'parameters.inc');

        // Read template file
        let content = fs.readFileSync(templatePath, 'utf8');

        // Replace parameter values, being careful with line matching
        const data = req.body;
        const replacements = {
            '^load1_kg=': `load1_kg=${data.load1_kg || ''}`,
            '^load2_kg=': `load2_kg=${data.load2_kg || ''}`,
            '^load3_kg=': `load3_kg=${data.load3_kg || ''}`,
            '^load4_kg=': `load4_kg=${data.load4_kg || ''}`,
            '^load5_kg=': `load5_kg=${data.load5_kg || ''}`,
            '^pressure1=': `pressure1=${data.pressure1 || ''}`,
            '^pressure2=': `pressure2=${data.pressure2 || ''}`,
            '^pressure3=': `pressure3=${data.pressure3 || ''}`,
            '^speed_kmph=': `speed_kmph=${data.speed_kmph || ''}`,
            '^IA=': `IA=${data.IA || ''}`,
            '^SA=': `SA=${data.SA || ''}`,
            '^SR=': `SR=${data.SR || ''}`,
            '^width=': `width=${data.width || ''}`,
            '^diameter=': `diameter=${data.diameter || ''}`,
            '^Outer_diameter=': `Outer_diameter=${data.Outer_diameter || ''}`,
            '^nomwidth=': `nomwidth=${data.nomwidth || ''}`,
            '^aspratio=': `aspratio=${data.aspratio || ''}`
        };

        // Replace each parameter if it exists in the template with exact line start matching
        Object.entries(replacements).forEach(([key, value]) => {
            const regex = new RegExp(key + '.*', 'm');
            if (content.match(regex)) {
                content = content.replace(regex, value);
            }
        });

        // Write new parameter file
        fs.writeFileSync(outputPath, content);

        res.json({
            success: true,
            message: 'Parameter file generated successfully'
        });
    } catch (err) {
        console.error('Error generating parameter file:', err);
        res.status(500).json({
            success: false,
            message: 'Error generating parameter file'
        });
    }
});

// Configure multer for mesh file upload (temporary storage)
const meshFileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'temp');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Keep original filename
        cb(null, file.originalname);
    }
});

const uploadMeshFile = multer({ storage: meshFileStorage });

// Add new endpoint for uploading mesh files temporarily
app.post('/api/upload-mesh-file', uploadMeshFile.single('meshFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No file received'
        });
    }

    res.json({
        success: true,
        message: 'Mesh file uploaded successfully',
        filename: req.file.originalname
    });
});

// Around line 1200, ADD recursive folder copy helper:

/**
 * Recursively copy folder and its contents
 * @param {string} src - Source folder path
 * @param {string} dest - Destination folder path
 */
function copyFolderRecursiveSync(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
            copyFolderRecursiveSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}


// Add new endpoint for protocol-based folder creation on submit
app.post('/api/create-protocol-folders', (req, res) => {
    const { projectName, protocol } = req.body;
    
    if (!projectName || !protocol) {
        return res.status(400).json({
            success: false,
            message: 'Project name and protocol are required'
        });
    }

    // Function to generate unique folder name
    function generateUniqueFolderName(baseName, basePath) {
        let uniqueName = baseName;
        let fullPath = path.join(basePath, uniqueName);

        if (!fs.existsSync(fullPath)) return uniqueName;

        if (fs.existsSync(fullPath)) {
            rimraf.sync(fullPath);
            fs.mkdirSync(fullPath, { recursive: true });
        }

        return uniqueName;
    }

    const baseCombinedName = `${projectName}_${protocol}`;
    const basePath = path.join(__dirname, 'projects');
    const combinedFolderName = generateUniqueFolderName(baseCombinedName, basePath);
    const projectPath = path.join(basePath, combinedFolderName);

    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(` CREATING PROJECT FOLDERS`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Project Name: ${projectName}`);
        console.log(`Protocol: ${protocol}`);
        console.log(`Combined Folder: ${combinedFolderName}`);
        console.log(`${'='.repeat(80)}\n`);

        // Create base project folder
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
            console.log(` Created project folder: ${projectPath}`);
        }

        // Create logs directory
        const logsPath = path.join(projectPath, 'logs');
        if (!fs.existsSync(logsPath)) {
            fs.mkdirSync(logsPath, { recursive: true });
            console.log(` Created logs folder: ${logsPath}`);
        }

        // Map protocol names to their template folder names
        const protocolMap = {
            'MF62': 'MF6pt2',
            'MF52': 'MF5pt2',
            'FTire': 'FTire',
            'CDTire': 'CDTire',
            'Custom': 'Custom'
        };

        const templateProtocolName = protocolMap[protocol];
        if (!templateProtocolName) {
            throw new Error(`Unknown protocol: ${protocol}`);
        }

        const templatePath = path.join(__dirname, 'templates', templateProtocolName);

        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template folder not found: ${templatePath}`);
        }

        //  FOR CDTIRE: Copy root-level files FIRST, then copy subfolders
        if (protocol === 'CDTire') {
            console.log(`\n📁 CDTire detected - copying root-level files first...`);
            
            // Get all items in templates/CDTire
            const allItems = fs.readdirSync(templatePath);
            
            // Separate files and directories
            const rootFiles = allItems.filter(item => {
                const fullPath = path.join(templatePath, item);
                return fs.statSync(fullPath).isFile();
            });
            
            const subfolders = allItems.filter(item => {
                const fullPath = path.join(templatePath, item);
                return fs.statSync(fullPath).isDirectory();
            });
            
            //  COPY ROOT-LEVEL FILES (common files needed by all subfolders)
            console.log(`\n📄 Copying ${rootFiles.length} root-level files...`);
            rootFiles.forEach(fileName => {
                const srcFile = path.join(templatePath, fileName);
                const destFile = path.join(projectPath, fileName);
                
                try {
                    fs.copyFileSync(srcFile, destFile);
                    console.log(`    Copied: ${fileName}`);
                } catch (copyErr) {
                    console.error(`   ❌ Failed to copy ${fileName}:`, copyErr.message);
                }
            });
            
            //  COPY SUBFOLDERS (P2_L1, etc.)
            console.log(`\nCopying ${subfolders.length} subfolders...`);
            subfolders.forEach(subfolder => {
                const srcFolder = path.join(templatePath, subfolder);
                const destFolder = path.join(projectPath, subfolder);
                
                try {
                    copyFolderRecursiveSync(srcFolder, destFolder);
                    console.log(`    Copied subfolder: ${subfolder}`);
                } catch (copyErr) {
                    console.error(`   ❌ Failed to copy subfolder ${subfolder}:`, copyErr.message);
                }
            });
            
            console.log(`\n CDTire: ${rootFiles.length} files + ${subfolders.length} subfolders copied`);
            
        } else {
            //  FOR OTHER PROTOCOLS: Only copy subfolders (existing behavior)
            const subfolders = fs.readdirSync(templatePath).filter(item => {
                const fullPath = path.join(templatePath, item);
                return fs.statSync(fullPath).isDirectory();
            });
            
            console.log(`\nCopying ${subfolders.length} subfolders for ${protocol}...`);
            
            subfolders.forEach(subfolder => {
                const srcFolder = path.join(templatePath, subfolder);
                const destFolder = path.join(projectPath, subfolder);
                copyFolderRecursiveSync(srcFolder, destFolder);
                console.log(`    Copied: ${subfolder}`);
            });
        }

        // Copy parameters.inc from central template location to each subfolder
        const centralParametersPath = path.join(__dirname, 'templates', 'inc', 'parameters.inc');
        if (fs.existsSync(centralParametersPath)) {
            const allSubfolders = fs.readdirSync(projectPath).filter(item => {
                const fullPath = path.join(projectPath, item);
                return fs.statSync(fullPath).isDirectory() && item.match(/^P\d+_L\d+$/);
            });
            
            allSubfolders.forEach(subfolder => {
                const destParamsPath = path.join(projectPath, subfolder, 'parameters.inc');
                try {
                    fs.copyFileSync(centralParametersPath, destParamsPath);
                    console.log(`    Copied parameters.inc to ${subfolder}`);
                } catch (err) {
                    console.warn(`   ⚠️ Could not copy parameters.inc to ${subfolder}:`, err.message);
                }
            });
        } else {
            console.warn('⚠️ Central parameters.inc not found - skipping');
        }

        // Copy mesh file to all P_L folders if it exists
        const tempDir = path.join(__dirname, 'temp');
        if (fs.existsSync(tempDir)) {
            const meshFiles = fs.readdirSync(tempDir);
            if (meshFiles.length > 0) {
                const meshFile = meshFiles[0];
                const srcMeshPath = path.join(tempDir, meshFile);
                
                const allSubfolders = fs.readdirSync(projectPath).filter(item => {
                    const fullPath = path.join(projectPath, item);
                    return fs.statSync(fullPath).isDirectory() && item.match(/^P\d+_L\d+$/);
                });
                
                allSubfolders.forEach(subfolder => {
                    const destMeshPath = path.join(projectPath, subfolder, meshFile);
                    try {
                        fs.copyFileSync(srcMeshPath, destMeshPath);
                        console.log(`    Copied mesh file to ${subfolder}`);
                    } catch (err) {
                        console.warn(`   ⚠️ Could not copy mesh file to ${subfolder}:`, err.message);
                    }
                });
                
                // Clean up temp directory
                rimraf.sync(tempDir);
                console.log(' Cleaned up temp directory');
            }
        }

        // Clean up parameters.inc from templates/inc/ after copying to all P_L folders
        try {
            if (fs.existsSync(centralParametersPath)) {
                fs.unlinkSync(centralParametersPath);
                console.log(' Cleaned up central parameters.inc');
            }
        } catch (cleanupErr) {
            console.warn('⚠️ Could not clean up central parameters.inc:', cleanupErr.message);
        }

        console.log(`\n${'='.repeat(80)}`);
        console.log(` PROJECT FOLDERS CREATED SUCCESSFULLY`);
        console.log(`${'='.repeat(80)}\n`);

        // Get list of created subfolders for response
        const createdSubfolders = fs.readdirSync(projectPath).filter(item => {
            const fullPath = path.join(projectPath, item);
            return fs.statSync(fullPath).isDirectory() && item !== 'logs';
        });

        res.json({
            success: true,
            message: 'Protocol folders created successfully',
            foldersCreated: createdSubfolders,
            projectPath: combinedFolderName
        });

    } catch (err) {
        console.error(`\n${'='.repeat(80)}`);
        console.error(` ERROR CREATING PROJECT FOLDERS`);
        console.error(`${'='.repeat(80)}`);
        console.error(`Error: ${err.message}`);
        console.error(`Stack: ${err.stack}`);
        console.error(`${'='.repeat(80)}\n`);
        
        res.status(500).json({
            success: false,
            message: 'Error creating protocol folders: ' + err.message
        });
    }
});


/**
 * POST /api/generate-batch-file
 * Generate batch file for automated test execution
 */
app.post('/api/generate-batch-file', async (req, res) => {
    try {
        const { projectName, protocol } = req.body;
        
        if (!projectName || !protocol) {
            return res.status(400).json({
                success: false,
                message: 'Project name and protocol are required'
            });
        }
        
        const result = await generateBatchFile(projectName, protocol);
        
        res.json({
            success: true,
            message: 'Batch file generated successfully',
            batchFilePath: result.batchFilePath,
            testCount: result.testCount
        });
        
    } catch (error) {
        console.error('Error generating batch file:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate batch file'
        });
    }
});


// Around line 3298-3380

/**
 * POST /api/run-batch-file
 * Execute batch file with live status updates and Tydex generation
 * ✅ FIXED: CDTire generates Tydex after each test completion
 */
// Around line 2600

// Around line 2600

app.post('/api/run-batch-file', async (req, res) => {
    try {
        let { projectName, protocol } = req.body;
        
        if (!projectName || !protocol) {
            return res.status(400).json({
                success: false,
                message: 'Project name and protocol are required'
            });
        }
        
        // ✅ NEW: Check if projectName is numeric (project ID)
        let projectId = null;
        let actualProjectName = projectName;
        
        if (!isNaN(projectName)) {
            projectId = parseInt(projectName, 10);
            
            // Get actual project name from database
            const projectQuery = 'SELECT project_name FROM projects WHERE id = $1';
            const projectResult = await db.query(projectQuery, [projectId]);
            
            if (projectResult.rows.length > 0) {
                actualProjectName = projectResult.rows[0].project_name;
                console.log(`✅ Resolved project ID ${projectId} → "${actualProjectName}"`);
            }
        }
        
        // ✅ CRITICAL FIX: Use projectId for folder name if available
        const folderIdentifier = projectId || actualProjectName;
        
        let normalizedProtocol = protocol;
        if (protocol === 'MF6pt2' || protocol === 'MF6.2') {
            normalizedProtocol = 'MF62';
        } else if (protocol === 'MF5pt2' || protocol === 'MF5.2') {
            normalizedProtocol = 'MF52';
        }
        
        // ✅ Use folderIdentifier instead of projectName
        const combinedFolderName = `${folderIdentifier}_${normalizedProtocol}`;
        const projectPath = path.join(__dirname, 'projects', combinedFolderName);
        const batchFilePath = path.join(projectPath, 'run_all_tests.bat');
        
        console.log(`📂 Project folder: ${combinedFolderName}`);
        console.log(`📄 Batch file: ${batchFilePath}`);
        
        if (!fs.existsSync(batchFilePath)) {
            return res.status(404).json({
                success: false,
                message: 'Batch file not found. Please generate it first.'
            });
        }
        
        // ✅ Initialize logger with CORRECT folder name
        const logger = getProjectLogger(folderIdentifier, normalizedProtocol);
        
        if (!logger) {
            return res.status(500).json({
                success: false,
                message: 'Failed to initialize project logger'
            });
        }
        
        logger.info(`🚀 Starting batch execution: ${batchFilePath}`);
        
        // ... rest of existing code ...
    } catch (error) {
        console.error('❌ Error running batch file:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to run batch file'
        });
    }
});

/**
 * Helper: Update run status in database
 */
async function updateRunStatus(protocol, runNumber, status) {
    try {
        const tableMap = {
            'MF62': 'mf_data',
            'MF52': 'mf52_data',
            'FTire': 'ftire_data',
            'CDTire': 'cdtire_data',
            'Custom': 'custom_data'
        };
        
        const tableName = tableMap[protocol];
        if (!tableName) return;
        
        // Ensure status column exists
        await db.query(`
            ALTER TABLE ${tableName} 
            ADD COLUMN IF NOT EXISTS run_status VARCHAR(100)
        `);
        
        // Update status
        await db.query(`
            UPDATE ${tableName} 
            SET run_status = $1 
            WHERE number_of_runs = $2
        `, [status, runNumber]);
        
        console.log(`✅ Updated Run ${runNumber} status: ${status}`);
        
    } catch (error) {
        console.error(`❌ Failed to update status for Run ${runNumber}:`, error);
    }
}

/**
 * Helper: Generate Tydex file for a completed run
 */
async function generateTydexForRun(projectName, protocol, rowData, logger) {
    try {
        const { p, l, template_tydex, tydex_name, job } = rowData;
        
        if (!template_tydex || !tydex_name || template_tydex === '-' || tydex_name === '-') {
            logger.warn(`⚠️ Run ${rowData.number_of_runs}: No Tydex template configured, skipping`);
            return;
        }
        
        const projectFolder = `${projectName}_${protocol}`;
        const outputDir = path.join(__dirname, 'projects', projectFolder, `${p}_${l}`);
        const tempDir = path.join(outputDir, 'temp');
        
        // Template path
        let templateFileName = template_tydex.trim();
        if (!templateFileName.endsWith('.tdx')) {
            templateFileName += '.tdx';
        }
        const templatePath = path.join(__dirname, 'templates', 'Tydex', protocol, templateFileName);
        
        // Output path
        let outputFileName = tydex_name.trim();
        if (!outputFileName.endsWith('.tdx')) {
            outputFileName += '.tdx';
        }
        const outputPath = path.join(outputDir, outputFileName);
        
        // Check if template exists
        if (!fs.existsSync(templatePath)) {
            logger.error(`❌ Tydex template not found: ${templatePath}`);
            return;
        }
        
        // Check if temp directory exists (created by extract_odb_data.py)
        if (!fs.existsSync(tempDir)) {
            logger.error(`❌ Temp directory not found: ${tempDir}`);
            logger.info(`💡 You may need to run ODB extraction first`);
            return;
        }
        
        // Read template and process
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const processedContent = await processTydexTemplate(templateContent, tempDir, rowData);
        
        // Write Tydex file
        fs.writeFileSync(outputPath, processedContent, 'utf8');
        
        logger.success(`✅ Tydex file generated: ${outputFileName}`);
        
        // Save to database
        const projectId = await findProjectIdByName(projectName);
        if (projectId) {
            await db.query(`
                INSERT INTO tydex_files (project_id, protocol, filename, content, created_at)
                VALUES ($1, $2, $3, $4, NOW())
            `, [projectId, protocol, outputFileName, processedContent]);
            
            logger.info(`💾 Tydex file saved to database`);
        }
        
    } catch (error) {
        logger.error(`❌ Error generating Tydex: ${error.message}`);
        console.error('Tydex generation error:', error);
    }
}


// ... existing /api/run-batch-file endpoint ends here (around line 3298)

/**
 * GET /api/live-run-status
 * Get current execution status for a project
 * Returns live status from database
 */
app.get('/api/live-run-status', async (req, res) => {
    try {
        const { projectName, protocol } = req.query;
        
        if (!projectName || !protocol) {
            return res.status(400).json({ success: false, message: 'Missing parameters' });
        }
        
        const tableMap = {
            'MF62': 'mf_data',
            'MF52': 'mf52_data',
            'FTire': 'ftire_data',
            'CDTire': 'cdtire_data',
            'Custom': 'custom_data'
        };
        
        const tableName = tableMap[protocol];
        if (!tableName) {
            return res.status(400).json({ success: false, message: 'Invalid protocol' });
        }
        
        // ✅ Fetch all run statuses
        const query = `
            SELECT number_of_runs, run_status 
            FROM ${tableName} 
            WHERE run_status IS NOT NULL 
            ORDER BY number_of_runs
        `;
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            statuses: result.rows
        });
        
    } catch (error) {
        console.error('❌ Error fetching live status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


/**
 * GET /api/view-batch-file
 * View batch file content for a project
 * ✅ FIXED: Handles numeric project ID and resolves to correct folder
 */
app.get('/api/view-batch-file', async (req, res) => {
    try {
        let { projectName, protocol } = req.query;
        
        if (!projectName || !protocol) {
            return res.status(400).json({
                success: false,
                message: 'Project name and protocol are required'
            });
        }
        
        // ✅ NEW: Check if projectName is actually an ID (numeric)
        let projectId = null;
        let actualProjectName = projectName;
        
        if (!isNaN(projectName)) {
            projectId = parseInt(projectName, 10);
            
            // Get actual project name from database
            const projectQuery = 'SELECT project_name FROM projects WHERE id = $1';
            const projectResult = await db.query(projectQuery, [projectId]);
            
            if (projectResult.rows.length > 0) {
                actualProjectName = projectResult.rows[0].project_name;
                console.log(`✅ Resolved project ID ${projectId} → "${actualProjectName}"`);
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }
        }
        
        // ✅ CRITICAL FIX: Use projectId for folder name if available
        const folderIdentifier = projectId || actualProjectName;
        
        // ✅ Normalize protocol name to match folder structure
        let normalizedProtocol = protocol;
        
        // Map all variations to the correct folder naming convention
        if (protocol === 'MF6pt2' || protocol === 'MF6.2') {
            normalizedProtocol = 'MF62';
        } else if (protocol === 'MF5pt2' || protocol === 'MF5.2') {
            normalizedProtocol = 'MF52';
        }
        
        // ✅ Use folderIdentifier instead of actualProjectName
        const combinedFolderName = `${folderIdentifier}_${normalizedProtocol}`;
        const projectPath = path.join(__dirname, 'projects', combinedFolderName);
        const batchFilePath = path.join(projectPath, 'run_all_tests.bat');
        
        console.log(`\n[View Batch File Request]`);
        console.log(`   Project ID: ${projectId || 'N/A'}`);
        console.log(`   Project Name: ${actualProjectName}`);
        console.log(`   Folder Identifier: ${folderIdentifier}`);
        console.log(`   Protocol: ${protocol} → ${normalizedProtocol}`);
        console.log(`   Combined Folder: ${combinedFolderName}`);
        console.log(`   Looking for: ${batchFilePath}`);
        console.log(`   Project folder exists: ${fs.existsSync(projectPath)}`);
        console.log(`   Batch file exists: ${fs.existsSync(batchFilePath)}`);
        
        // ✅ Check if project folder exists first
        if (!fs.existsSync(projectPath)) {
            console.warn(`   ⚠️ Project folder not found: ${projectPath}`);
            return res.status(404).json({
                success: false,
                message: 'Project folder not found. The project may need to be re-submitted from the protocol page.'
            });
        }
        
        // ✅ Check if batch file exists
        if (!fs.existsSync(batchFilePath)) {
            console.warn(`   ⚠️ Batch file not found: ${batchFilePath}`);
            
            // ✅ Try to generate batch file on-the-fly if project folders exist
            try {
                console.log(`   🔨 Attempting to generate batch file...`);
                const generateResult = await generateBatchFile(folderIdentifier, normalizedProtocol);
                
                if (generateResult.success && fs.existsSync(batchFilePath)) {
                    console.log(`   ✅ Batch file generated successfully`);
                    // Fall through to read and return the file
                } else {
                    throw new Error('Batch file generation failed');
                }
            } catch (genError) {
                console.error(`   ❌ Failed to generate batch file:`, genError);
                return res.status(404).json({
                    success: false,
                    message: 'Batch file not found and could not be generated. Please re-submit the project from the protocol page to create the batch file.'
                });
            }
        }
        
        // ✅ Read batch file content
        const content = fs.readFileSync(batchFilePath, 'utf8');
        
        console.log(`   ✅ Batch file read successfully (${content.length} bytes)`);
        
        res.json({
            success: true,
            content: content,
            filename: 'run_all_tests.bat'
        });
        
    } catch (error) {
        console.error('❌ Error reading batch file:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to read batch file'
        });
    }
});



// Around line 3700 (AFTER the duplicate /api/view-batch-file endpoint)

/**
 * GET /api/view-logs
 * View live logs for a project+protocol
 * ✅ FIXED: Handles numeric project ID and finds latest log file
 */
// Around line 3700

app.get('/api/view-logs', async (req, res) => {
    try {
        let { projectName, protocol } = req.query;
        
        if (!projectName || !protocol) {
            return res.status(400).json({
                success: false,
                message: 'Project name and protocol are required'
            });
        }
        
        // ✅ SAME LOGIC: Check if projectName is numeric (project ID)
        let projectId = null;
        let actualProjectName = projectName;
        
        if (!isNaN(projectName)) {
            projectId = parseInt(projectName, 10);
            
            const projectQuery = 'SELECT project_name FROM projects WHERE id = $1';
            const projectResult = await db.query(projectQuery, [projectId]);
            
            if (projectResult.rows.length > 0) {
                actualProjectName = projectResult.rows[0].project_name;
                console.log(`✅ Resolved project ID ${projectId} → "${actualProjectName}"`);
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Project not found'
                });
            }
        }
        
        // ✅ CRITICAL FIX: Use projectId for folder name if available
        const folderIdentifier = projectId || actualProjectName;
        
        // Normalize protocol
        let normalizedProtocol = protocol;
        if (protocol === 'MF6pt2' || protocol === 'MF6.2') {
            normalizedProtocol = 'MF62';
        } else if (protocol === 'MF5pt2' || protocol === 'MF5.2') {
            normalizedProtocol = 'MF52';
        }
        
        // ✅ Use folderIdentifier for correct path
        const combinedFolderName = `${folderIdentifier}_${normalizedProtocol}`;
        const projectPath = path.join(__dirname, 'projects', combinedFolderName);
        const logsPath = path.join(projectPath, 'logs');
        
        console.log(`\n[View Logs Request]`);
        console.log(`   Project ID: ${projectId || 'N/A'}`);
        console.log(`   Project Name: ${actualProjectName}`);
        console.log(`   Folder: ${combinedFolderName}`);
        console.log(`   Protocol: ${protocol} → ${normalizedProtocol}`);
        console.log(`   Logs path: ${logsPath}`);
        
        // ... rest of existing code unchanged ...
    } catch (error) {
        console.error('❌ Error reading logs:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to read logs'
        });
    }
});

//  Helper function: Recursive folder copy (if not already defined)
function copyFolderRecursiveSync(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        
        if (fs.statSync(srcPath).isDirectory()) {
            copyFolderRecursiveSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}


/**
 * Generate batch file for automated test execution
 * ✅ FIXED: Uses explicit paths from templates → projects folder structure
 */
// Around line 3370 (REMOVE the skip logic)

async function generateBatchFile(projectName, protocol) {
    try {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📝 Generating batch file for ${projectName}_${protocol}`);
        console.log(`${'='.repeat(80)}`);
        
        const combinedFolderName = `${projectName}_${protocol}`;
        const projectPath = path.join(__dirname, 'projects', combinedFolderName);
        const batchFilePath = path.join(projectPath, 'run_all_tests.bat');
        
        // ✅ ADD THIS MISSING CODE BLOCK (table mapping)
        const tableMap = {
            'MF62': 'mf_data',
            'MF52': 'mf52_data',
            'FTire': 'ftire_data',
            'CDTire': 'cdtire_data',
            'Custom': 'custom_data'
        };
        
        const tableName = tableMap[protocol];
        
        if (!tableName) {
            throw new Error(`Unknown protocol: ${protocol}`);
        }
        
        console.log(`Using table: ${tableName}`);
        // ✅ END OF ADDED CODE
        
        // ... existing table mapping code ...
        
        const tableQuery = `SELECT * FROM ${tableName} ORDER BY number_of_runs`;
        const result = await db.query(tableQuery);
        const rows = result.rows;
        
        if (!rows || rows.length === 0) {
            throw new Error('No test data found');
        }
        
        let batchContent = `@echo off\n`;
        batchContent += `REM Batch file for ${projectName} (${protocol})\n`;
        batchContent += `REM Generated: ${new Date().toISOString()}\n\n`;
        
        let commandCount = 0;
        let skippedCount = 0;  // ✅ Keep counter but don't skip commands
        let currentFolder = null;
        
        // Around line 3400

// Around line 3400

for (const row of rows) {
    const runNumber = row.number_of_runs;
    const job = row.job || '';
    const oldJob = row.old_job || '';
    const p = row.p || '';
    const l = row.l || '';
    
    // ✅ FIXED: Extract fortran and python BEFORE the skip check
    const fortran = row.fortran_file || '';
    const python = row.python_script || '';
    
    // ✅ ADDED: Skip rows with invalid job names
    if (!job || job.trim() === '' || job.trim() === '-') {
        console.warn(`⚠️ Skipping run ${runNumber}: Invalid job name`);
        skippedCount++;
        continue;
    }
    
    const folderName = `${p}_${l}`;
    const folderPath = path.join(projectPath, folderName);
    const inputFilePath = path.join(folderPath, `${job}.inp`);
    
    // ✅ Log warning but DON'T skip command generation
    if (!fs.existsSync(inputFilePath)) {
        console.warn(`⚠️ Warning: Input file not found: ${inputFilePath}`);
        console.warn(`   → Command will be added to batch file (will fail if not provided)`);
    }
    
    // Add comment for new folder
    if (folderName !== currentFolder) {
        currentFolder = folderName;
        batchContent += `\nREM ===== Folder: ${folderName} =====\n`;
    }
    
    // Add comment for run
    batchContent += `\nREM Run ${runNumber}\n`;
    batchContent += `cd /d "${folderPath}"\n`;
    
    // Build Abaqus command
    let abaqusCmd = `call abaqus job=${job}`;

    // ✅ FIXED: Only add oldjob if it has a valid value (not empty, not "-")
    if (oldJob && oldJob.trim() !== '' && oldJob.trim() !== '-') {
        abaqusCmd += ` oldjob=${oldJob}`;
    }

    abaqusCmd += ` input=${job} cpus=4 interactive`;

    // Add Abaqus command
    batchContent += `${abaqusCmd}\n`;
    commandCount++;
    
    // ============================================
    // ✅ CDTire WORKFLOW: Run Python Script
    // ============================================
    if (protocol === 'CDTire' && python && python !== '-') {
        const pythonParts = python.split(/\s+/);
        const scriptName = pythonParts[0]; // e.g., "od_growth.py" or "deflection.py"
        let scriptArgs = pythonParts.slice(1).join(' ');
        
        const scriptPath = path.join('..', scriptName);
        
        // ✅ CRITICAL FIX: Add job name as argument for od_growth.py
        if (scriptName.includes('od_growth.py')) {
            const odbFileName = `${job}.odb`;
            batchContent += `call abaqus python "${scriptPath}" ${odbFileName}\n`;
        }
        // ✅ CRITICAL FIX: Add job name + speed variable for deflection.py
        else if (scriptName.includes('deflection.py')) {
            const odbFileName = `${job}.odb`;
            const speedVar = scriptArgs || 'speed1';
            batchContent += `call abaqus python "${scriptPath}" ${odbFileName} ${speedVar}\n`;
        }
        // ✅ CRITICAL FIX: Add job name for extract_element_sets.py
        else if (scriptName.includes('extract_element_sets.py')) {
            batchContent += `call abaqus python "${scriptPath}"\n`;
        }
        // ✅ Generic case (other scripts)
        else {
            batchContent += `call abaqus python "${scriptPath}"`;
            if (scriptArgs) {
                batchContent += ` ${scriptArgs}`;
            }
            batchContent += '\n';
        }
        
        batchContent += '\n';
    }
}
        
        // Footer
        batchContent += `\nREM Batch execution completed\n`;
        batchContent += `REM Commands executed: ${commandCount}\n`;
        if (skippedCount > 0) {
            batchContent += `REM Tests with warnings: ${skippedCount}\n`;
        }
        batchContent += `pause\n`;
        
        // Write batch file
        fs.writeFileSync(batchFilePath, batchContent);
        
        console.log(`✅ Batch file generated: ${batchFilePath}`);
        console.log(`   Total commands: ${commandCount}`);
        if (skippedCount > 0) {
            console.log(`   ⚠️ Tests with missing .inp files: ${skippedCount}`);
        }
        console.log(`${'='.repeat(80)}\n`);
        
        return {
            success: true,
            batchFilePath,
            testCount: commandCount
        };
        
    } catch (error) {
        console.error('❌ Error generating batch file:', error);
        throw error;
    }
}

// Add new endpoint for getting row data with p, l, job, old_job, template_tydex, tydex_name
app.get('/api/get-row-data', (req, res) => {
    const { protocol, runNumber } = req.query;

    if (!protocol || !runNumber) {
        return res.status(400).json({
            success: false,
            message: 'Protocol and run number are required'
        });
    }

    // Map protocol to table name and column variations
    const tableMap = {
        'mf62': 'mf_data',
        'mf52': 'mf52_data',
        'ftire': 'ftire_data',
        'cdtire': 'cdtire_data',
        'custom': 'custom_data'
    };

    const tableName = tableMap[protocol.toLowerCase()];
    if (!tableName) {
        return res.status(400).json({
            success: false,
            message: 'Invalid protocol'
        });
    }

    // Build query based on available columns for each protocol
    let query;
    if (protocol.toLowerCase() === 'ftire') {
        // FTire uses longitudinal_slip instead of slip_ratio
        query = `SELECT p, l, job, old_job, template_tydex, tydex_name, slip_angle, longitudinal_slip as slip_ratio, inclination_angle FROM ${tableName} WHERE number_of_runs = $1`;
    } else if (protocol.toLowerCase() === 'cdtire') {
        // CDTire doesn't have inclination_angle or slip_ratio, has slip_range
        query = `SELECT p, l, job, old_job, template_tydex, tydex_name, fortran_file, python_script, slip_angle, slip_range as slip_ratio, NULL as inclination_angle FROM ${tableName} WHERE number_of_runs = $1`;
    } else {
        // MF62, MF52, Custom have standard columns
        query = `SELECT p, l, job, old_job, template_tydex, tydex_name, slip_angle, slip_ratio, inclination_angle FROM ${tableName} WHERE number_of_runs = $1`;
    }

    db.query(query, [runNumber], (err, results) => {
        if (err) {
            console.error('Error fetching row data:', err);
            return res.status(500).json({
                success: false,
                message: 'Error fetching row data'
            });
        }

        if (results.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Row not found'
            });
        }

        res.json({
            success: true,
            data: results.rows[0]
        });
    });
});

// Add new endpoint for checking ODB file existence
app.get('/api/check-odb-file', (req, res) => {
    const { projectName, protocol, folderName, jobName } = req.query;

    if (!projectName || !protocol || !folderName || !jobName) {
        return res.status(400).json({
            success: false,
            message: 'All parameters are required'
        });
    }
    const combinedFolderName = `${projectName}_${protocol}`;
    const odbPath = path.join(__dirname, 'projects', combinedFolderName, folderName, `${jobName}.odb`);

    const exists = fs.existsSync(odbPath);

    res.json({
        success: true,
        exists: exists,
        path: odbPath
    });
});

// Add new endpoint for checking TYDEX file existence
app.get('/api/check-tydex-file', (req, res) => {
    const { projectName, protocol, folderName, tydexName } = req.query;

    if (!projectName || !protocol || !folderName || !tydexName) {
        return res.status(400).json({
            success: false,
            message: 'All parameters are required'
        });
    }

    const combinedFolderName = `${projectName}_${getProtocolAbbreviation(protocol)}`;

    // Ensure tydex_name has .tdx extension
    let fileName = tydexName.trim();
    if (!fileName.endsWith('.tdx')) {
        fileName += '.tdx';
    }

    const tydexPath = path.join(__dirname, 'projects', combinedFolderName, folderName, fileName);

    const exists = fs.existsSync(tydexPath);

    res.json({
        success: true,
        exists: exists,
        path: tydexPath
    });
});

// ============================================
// REQUEST DEDUPLICATION MIDDLEWARE
// ============================================
const activeRequests = new Map(); 

function deduplicateRequests(req, res, next) {
  const key = `${req.method}:${req.path}:${JSON.stringify(req.body)}`;
  
  if (activeRequests.has(key)) {
    console.warn(`DUPLICATE REQUEST BLOCKED: ${key}`);
    return res.status(409).json({
      success: false,
      message: 'Request already in progress, please wait'
    });
  }
  
  activeRequests.set(key, Date.now());
  
  // Cleanup after response is sent
  const cleanup = () => {
    activeRequests.delete(key);
  };
  
  res.on('finish', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
  
  next();
}


// New endpoint for job dependency resolution

// ============================================
// JOB DEPENDENCY RESOLUTION ENDPOINT (PERMANENT FIX)
// ============================================
app.post('/api/resolve-job-dependencies', deduplicateRequests, async (req, res) => {
    const { projectName, protocol, runNumber } = req.body;

    //  CRITICAL: Track if response was sent
    let responseSent = false;

    //  Safe response wrapper
    function sendOnce(statusCode, data) {
        if (responseSent || res.headersSent) {
            console.warn(`⚠️ Blocked duplicate response (already sent: ${responseSent}, headers sent: ${res.headersSent})`);
            return;
        }
        responseSent = true;
        res.status(statusCode).json(data);
        console.log(`📤 Response sent: ${statusCode}`);
    }

    // Validate inputs
    if (!projectName || !protocol || !runNumber) {
        return sendOnce(400, {
            success: false,
            message: 'Project name, protocol, and run number are required'
        });
    }

    const tableMap = {
        'mf62': 'mf_data',
        'mf52': 'mf52_data',
        'ftire': 'ftire_data',
        'cdtire': 'cdtire_data',
        'custom': 'custom_data'
    };

    const tableName = tableMap[protocol.toLowerCase()];
    if (!tableName) {
        return sendOnce(400, {
            success: false,
            message: 'Invalid protocol'
        });
    }

    // Fetch row data
    let rowData = {};
    try {
        let dataQuery;
        if (protocol.toLowerCase() === 'cdtire') {
            dataQuery = `SELECT job, old_job, p, l, fortran_file, python_script, test_name FROM ${tableName} WHERE number_of_runs = $1`;
        } else {
            dataQuery = `SELECT job, old_job, p, l FROM ${tableName} WHERE number_of_runs = $1`;
        }
        
        const dataResult = await db.query(dataQuery, [runNumber]);
        if (dataResult.rows.length > 0) {
            rowData = dataResult.rows[0];
            console.log(' Row data:', rowData);
        } else {
            return sendOnce(404, {
                success: false,
                message: 'No data found for run number ' + runNumber
            });
        }
    } catch (dbErr) {
        console.error('❌ Database error:', dbErr);
        return sendOnce(500, {
            success: false,
            message: 'Database error: ' + dbErr.message
        });
    }

    // Validate P and L
    const pValue = rowData.p || '';
    const lValue = rowData.l || '';
    const folderName = pValue + '_' + lValue;

    const combinedFolderName = projectName + '_' + protocol;
    const projectPath = path.join(__dirname, 'projects', combinedFolderName);
    const subfolderPath = path.join(projectPath, folderName);

    if (!fs.existsSync(projectPath)) {
        return sendOnce(404, {
            success: false,
            message: 'Project folder not found: ' + projectPath
        });
    }

    if (!fs.existsSync(subfolderPath)) {
        return sendOnce(404, {
            success: false,
            message: 'Subfolder not found: ' + folderName
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log(' DEPENDENCY RESOLUTION');
    console.log('='.repeat(80));
    console.log('Project: ' + projectName);
    console.log('Protocol: ' + protocol);
    console.log('Run: ' + runNumber);
    console.log('Folder: ' + folderName);
    console.log('Job: ' + rowData.job);
    console.log('='.repeat(80) + '\n');

    // ============================================
    // DEPENDENCY RESOLUTION (NO RESPONSE INSIDE)
    // ============================================
    async function resolveDependencies(jobName, visitedJobs = new Set()) {
        if (visitedJobs.has(jobName)) {
            console.warn('⚠️ Circular dependency: ' + jobName);
            return;
        }

        visitedJobs.add(jobName);

        // Find job file
        const searchNames = [
            jobName,
            jobName.endsWith('.inp') ? jobName.replace('.inp', '') : jobName + '.inp'
        ];

        let foundFolder = false;
        for (const searchName of searchNames) {
            const fullPath = path.join(subfolderPath, searchName);
            if (fs.existsSync(fullPath)) {
                console.log(' Found: ' + fullPath);
                foundFolder = true;
                break;
            }
        }

        if (!foundFolder) {
            const templatePath = path.join(__dirname, 'templates', protocol, folderName);
            if (fs.existsSync(templatePath)) {
                const files = fs.readdirSync(templatePath);
                const templateInp = files.find(f => f === jobName + '.inp' || f === jobName);
                
                if (templateInp) {
                    const srcPath = path.join(templatePath, templateInp);
                    const destPath = path.join(subfolderPath, templateInp);
                    fs.copyFileSync(srcPath, destPath);
                    console.log(' Copied from template');
                } else {
                    throw new Error('Job "' + jobName + '" not found');
                }
            } else {
                throw new Error('Job "' + jobName + '" not found');
            }
        }

        // Check dependencies
        const oldJobName = rowData.old_job;
        
        if (oldJobName && oldJobName.trim() !== '' && oldJobName !== '-') {
            console.log('🔗 Dependency: ' + oldJobName);
            await resolveDependencies(oldJobName, new Set(visitedJobs));
        }

        //  EXECUTE JOB (NO RESPONSE SENT HERE)
        console.log('⚙️ Executing: ' + jobName);
        try {
        // Execute main job with enhanced CDTire support
        await executeAbaqusJob(
            subfolderPath,
            jobName,
            rowData.old_job,
            folderName,
            protocol,
            rowData // Pass full row data including fortran_file and python_script
        );
        
        console.log(`Job completed: ${jobName}`);
        
    } catch (jobErr) {
        console.error(`Job execution error: ${jobErr.message}`);
        throw jobErr;
    }
  }

    // ============================================
    // MAIN EXECUTION (SINGLE RESPONSE POINT)
    // ============================================
    try {
        await resolveDependencies(rowData.job);

        console.log('\n' + '='.repeat(80));
        console.log(' ALL JOBS COMPLETED');
        console.log('='.repeat(80) + '\n');

        //  ONLY RESPONSE - SUCCESS
        sendOnce(200, {
            success: true,
            message: 'All jobs executed successfully'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        
        //  ONLY RESPONSE - ERROR
        sendOnce(500, {
            success: false,
            message: error.message || 'Job execution failed'
        });
    }




/**
 * Enhanced Abaqus Job Execution with Fortran and Python Script Support (CDTire)
 * Workflow Cases:
 * 1. deflection.py → generates .f files → store in templates/CDTire
 * 2. job/old_job → fortran (if present) → python (if present) → tydex
 * 3. job/old_job → tydex (no fortran/python)
 * 4. job/old_job → fortran → tydex (no python)
 * 5. job/old_job → python → tydex (no fortran)
 * 6. job/old_job → fortran → python → tydex (both present)
 */
function executeAbaqusJob(folderPath, jobName, oldJobName, folderName = '', protocol = '', rowData = {}) {
    return new Promise((resolve, reject) => {
        const logger = getProjectLogger(rowData.projectName || 'unknown', protocol);
        
        const inpFileName = jobName.endsWith('.inp') ? jobName : `${jobName}.inp`;
        const inpFilePath = path.join(folderPath, inpFileName);
        
        if (!fs.existsSync(inpFilePath)) {
            const errorMsg = `Input file not found: ${inpFilePath}`;
            console.error(`Error: ${errorMsg}`);
            if (logger) logger.error(errorMsg);
            return reject(new Error(errorMsg));
        }
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`EXECUTING ABAQUS JOB`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Folder: ${folderPath}`);
        console.log(`Job: ${jobName}`);
        console.log(`Old Job: ${oldJobName || 'None'}`);
        console.log(`Protocol: ${protocol}`);
        console.log(`${'='.repeat(80)}\n`);
        
        if (logger) {
            logger.info(`Executing job: ${jobName} in ${folderName}`);
            if (oldJobName && oldJobName !== '-') {
                logger.info(`Using restart from: ${oldJobName}`);
            }
        }
        
        // Build Abaqus command
        const jobBaseName = jobName.replace('.inp', '');
        let abaqusArgs = ['job=' + jobBaseName];
        
        // Add oldjob parameter if specified
        if (oldJobName && oldJobName.trim() !== '' && oldJobName !== '-') {
            const oldJobBaseName = oldJobName.replace('.inp', '');
            abaqusArgs.push('oldjob=' + oldJobBaseName);
            console.log(`Using restart file from: ${oldJobBaseName}`);
        }
        
        // Add remaining parameters
        abaqusArgs.push('input=' + inpFileName);
        abaqusArgs.push('cpus=' + (ABAQUS_CPU_COUNT || 4));
        abaqusArgs.push('interactive');
        
        // CDTIRE: Add Fortran file if present
        if (protocol === 'CDTire' && rowData.fortran_file && rowData.fortran_file.trim() !== '' && rowData.fortran_file !== '-') {
            const fortranBaseName = rowData.fortran_file.replace('.f', '');
            abaqusArgs.push('user=' + fortranBaseName);
            console.log(`Using Fortran file: ${fortranBaseName}`);
            if (logger) logger.info(`Using Fortran file: ${fortranBaseName}`);
        }
        
        console.log(`Abaqus command: abaqus ${abaqusArgs.join(' ')}`);
        
        // Execute Abaqus
        const abaqusProcess = spawn('abaqus', abaqusArgs, {
            cwd: folderPath,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        
        // Register process
        registerChildProcess(abaqusProcess, {
            projectName: rowData.projectName,
            protocol: protocol,
            runNumber: rowData.number_of_runs,
            type: 'abaqus'
        });
        
        // Capture output
        abaqusProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Abaqus stdout] ${output}`);
            if (logger) logger.info(output);
        });
        
        abaqusProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`[Abaqus stderr] ${output}`);
            if (logger) logger.error(output);
        });
        
        abaqusProcess.on('close', async (code) => {
            if (code === 0) {
                console.log(`Abaqus job completed: ${jobName}`);
                if (logger) logger.success(`Job completed: ${jobName}`);
                
                // CDTIRE: Run Python script if present
                if (protocol === 'CDTire' && rowData.python_script && rowData.python_script.trim() !== '' && rowData.python_script !== '-') {
                    try {
                        console.log(`Running Python script: ${rowData.python_script}`);
                        if (logger) logger.info(`Running Python script: ${rowData.python_script}`);
                        
                        await runPythonScript(folderPath, rowData.python_script, jobName, folderName, logger);
                        
                        console.log(`Python script completed: ${rowData.python_script}`);
                        if (logger) logger.success(`Python script completed: ${rowData.python_script}`);
                        
                        resolve();
                    } catch (pythonErr) {
                        console.error(`Python script error: ${pythonErr.message}`);
                        if (logger) logger.error(`Python script error: ${pythonErr.message}`);
                        reject(pythonErr);
                    }
                } else {
                    resolve();
                }
            } else {
                const errorMsg = `Abaqus job failed with exit code ${code}`;
                console.error(`Error: ${errorMsg}`);
                if (logger) logger.error(errorMsg);
                reject(new Error(errorMsg));
            }
        });
        
        abaqusProcess.on('error', (error) => {
            console.error(`Abaqus process error:`, error);
            if (logger) logger.error(`Process error: ${error.message}`);
            reject(error);
        });
    });
}

/**
 * Run a Python script using Abaqus Python
 * Executes Python scripts for CDTire protocol post-processing
 * @param {string} folderPath - Path to the job folder (e.g., Z:\...\cddemo_CDTire\P2_L1)
 * @param {string} pythonFileName - Name of the Python file (e.g., deflection.py)
 * @param {string} jobName - Name of the job
 * @param {string} folderName - Folder name (e.g., P2_L1)
 * @param {object} logger - Project logger instance
 * @returns {Promise<Object>} - Returns {success: true, stdout, stderr} on success
 */

async function runPythonScript(folderPath, pythonFileName, jobName, folderName, logger = null) {
    return new Promise((resolve, reject) => {
        // Remove .py extension if present
        const pythonBaseName = pythonFileName.replace('.py', '');
        
        // ✅ CORRECT: Construct ODB file name from job name
        const odbName = jobName.replace('.inp', '') + '.odb';
        
        console.log(`\nRunning Python script: ${pythonBaseName}.py`);
        console.log(`Target ODB: ${odbName}`);
        console.log(`Working directory: ${folderPath}`);
        
        if (logger) {
            logger.info(`Running Python script: ${pythonBaseName}.py with ODB: ${odbName}`);
        }
        
        // Execute: abaqus python script.py odb_file.odb
        const pythonProcess = spawn('abaqus', ['python', `${pythonBaseName}.py`, odbName], {
            cwd: folderPath,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        
        // Register process
        registerChildProcess(pythonProcess, {
            type: 'python',
            script: pythonBaseName,
            folder: folderName
        });
        
        // Capture output
        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Python stdout] ${output}`);
            if (logger) logger.pythonOutput(output);
        });
        
        pythonProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`[Python stderr] ${output}`);
            if (logger) logger.error(`[Python stderr] ${output}`);
        });
        
        pythonProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`Python script completed successfully: ${pythonBaseName}.py`);
                if (logger) logger.success(`Python script completed: ${pythonBaseName}.py`);
                resolve();
            } else {
                const errorMsg = `Python script failed with exit code ${code}`;
                console.error(`Error: ${errorMsg}`);
                if (logger) logger.error(errorMsg);
                reject(new Error(errorMsg));
            }
        });
        
        pythonProcess.on('error', (error) => {
            console.error(`Python process error:`, error);
            if (logger) logger.error(`Python error: ${error.message}`);
            reject(error);
        });
    });
}


/**
 * Run a Fortran .f file using Abaqus
 */
async function runFortranFile(folderPath, fortranFileName, jobName, folderName) {
    return new Promise((resolve, reject) => {
        console.log(`\n Running Fortran file: ${fortranFileName}`);
        
        const templateFortranPath = path.join(__dirname, 'templates', 'CDTire', fortranFileName);
        const localFortranPath = path.join(folderPath, fortranFileName);

        // Check if Fortran file exists in templates
        if (!fs.existsSync(templateFortranPath)) {
            const error = `Fortran file not found: ${templateFortranPath}`;
            console.error(` ${error}`);
            return reject(new Error(error));
        }

        console.log(` Found Fortran file in templates: ${templateFortranPath}`);

        // Copy Fortran file to job folder
        try {
            fs.copyFileSync(templateFortranPath, localFortranPath);
            console.log(` Copied Fortran file to: ${localFortranPath}`);
        } catch (copyErr) {
            console.error(` Failed to copy Fortran file:`, copyErr);
            return reject(copyErr);
        }

        // Run Abaqus job with Fortran subroutine
        const fortranCmd = `abaqus job=${jobName} user=${fortranFileName} interactive`;
        
        console.log(`  Fortran command: ${fortranCmd}`);

        const fortranProcess = spawn('cmd.exe', ['/c', fortranCmd], {
            cwd: folderPath,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        registerChildProcess(fortranProcess, { 
            job: jobName, 
            folder: folderName, 
            type: 'fortran' 
        });

        let fortranOutput = '';

        fortranProcess.stdout.on('data', (data) => {
            const output = data.toString();
            fortranOutput += output;
            console.log(` Fortran output: ${output.trim()}`);
            
            broadcastSse('run-status', {
                run: jobName,
                folder: folderName,
                status: 'running',
                stage: 'fortran',
                message: `Running Fortran subroutine...`
            });
        });

        fortranProcess.stderr.on('data', (data) => {
            console.error(`  Fortran stderr: ${data.toString()}`);
        });

        fortranProcess.on('close', (code) => {
            console.log(`\n Fortran execution completed with exit code: ${code}`);
            
            if (code !== 0) {
                const error = `Fortran execution failed with exit code ${code}`;
                console.error(` ${error}`);
                return reject(new Error(error));
            }

            console.log(` Fortran file executed successfully\n`);
            resolve();
        });
    });
}


/**
 * Run a Fortran .f file using Abaqus
 * Fetches Fortran file from templates/CDTire folder
 * @param {string} folderPath - Path to the job folder
 * @param {string} fortranFileName - Name of the Fortran file (.f)
 * @param {string} jobName - Name of the job
 * @param {string} folderName - Folder name (e.g., P1_L1)
 */
async function runFortranFile(folderPath, fortranFileName, jobName, folderName) {
    return new Promise((resolve, reject) => {
        console.log(`\n🔧 Running Fortran file: ${fortranFileName}`);
        
        //  Source: templates/CDTire/<fortran_file>
        const templateFortranPath = path.join(__dirname, 'templates', 'CDTire', fortranFileName);
        
        //  Destination: job folder
        const localFortranPath = path.join(folderPath, fortranFileName);

        // Check if Fortran file exists in templates
        if (!fs.existsSync(templateFortranPath)) {
            const error = `Fortran file not found in templates: ${templateFortranPath}`;
            console.error(` ${error}`);
            return reject(new Error(error));
        }

        console.log(` Found Fortran file in templates: ${templateFortranPath}`);

        // Copy Fortran file to job folder
        try {
            fs.copyFileSync(templateFortranPath, localFortranPath);
            console.log(` Copied Fortran file to: ${localFortranPath}`);
        } catch (copyErr) {
            console.error(` Failed to copy Fortran file:`, copyErr);
            return reject(copyErr);
        }

        //  Run Fortran file using Abaqus
        // Command: call abaqus job=<job_name> user=<fortran_file> oldjob=<job_name> interactive
        const fortranCmd = `call abaqus job=${jobName}_fortran user=${fortranFileName} oldjob=${jobName} interactive`;
        
        console.log(`  Fortran command: ${fortranCmd}`);

        const fortranProcess = spawn('cmd.exe', ['/c', fortranCmd], {
            cwd: folderPath,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        registerChildProcess(fortranProcess, { 
            job: jobName, 
            folder: folderName, 
            type: 'fortran' 
        });

        let fortranOutput = '';

        fortranProcess.stdout.on('data', (data) => {
            const output = data.toString();
            fortranOutput += output;
            console.log(` Fortran output: ${output.trim()}`);
            
            broadcastSse('run-status', {
                run: jobName,
                folder: folderName,
                status: 'running',
                stage: 'fortran',
                message: `Running Fortran file: ${fortranFileName}`
            });
        });

        fortranProcess.stderr.on('data', (data) => {
            console.error(`  Fortran stderr: ${data.toString()}`);
        });

        fortranProcess.on('close', (code) => {
            console.log(`\n Fortran execution completed with exit code: ${code}`);
            
            if (code !== 0) {
                const error = `Fortran execution failed with exit code ${code}`;
                console.error(` ${error}`);
                return reject(new Error(error));
            }

            console.log(` Fortran file executed successfully\n`);
            resolve();
        });
    });
}

});

// Add endpoint for checking job completion status more comprehensively
app.get('/api/check-job-status', (req, res) => {
    const { projectName, protocol, folderName, jobName } = req.query;

    if (!projectName || !protocol || !folderName || !jobName) {
        return res.status(400).json({
            success: false,
            message: 'All parameters are required'
        });
    }
    const combinedFolderName = `${projectName}_${protocol}`;
    const jobPath = path.join(__dirname, 'projects', combinedFolderName, folderName);

    try {
        // Check for various file types to determine job status
        const odbFile = path.join(jobPath, `${jobName}.odb`);
        const staFile = path.join(jobPath, `${jobName}.sta`);
        const msgFile = path.join(jobPath, `${jobName}.msg`);

        let status = 'not_started';
        let message = '';

        if (fs.existsSync(odbFile)) {
            status = 'completed';
            message = 'Job completed successfully - ODB file exists';
        } else if (fs.existsSync(staFile)) {
            // Check status file content
            try {
                const staContent = fs.readFileSync(staFile, 'utf8');
                if (staContent.includes('COMPLETED')) {
                    status = 'completed';
                    message = 'Job completed according to status file';
                } else if (staContent.includes('ABORTED') || staContent.includes('ERROR')) {
                    status = 'error';
                    message = 'Job aborted or encountered error';
                } else {
                    status = 'running';
                    message = 'Job is currently running';
                }
            } catch (readErr) {
                status = 'running';
                message = 'Status file exists but could not be read';
            }
        } else if (fs.existsSync(msgFile)) {
            status = 'running';
            message = 'Job started - message file exists';
        }

        res.json({
            success: true,
            status: status,
            message: message,
            files: {
                odb: fs.existsSync(odbFile),
                sta: fs.existsSync(staFile),
                msg: fs.existsSync(msgFile)
            }
        });

    } catch (err) {
        console.error('Error checking job status:', err);
        res.status(500).json({
            success: false,
            message: 'Error checking job status: ' + err.message
        });
    }
});

app.post('/api/save-project', authenticateToken, async (req, res) => {
  try {
    const { project_name, region, department, tyre_size, protocol, status, inputs } = req.body;
    const userEmail = req.user.email;

    const result = await db.query(`
      INSERT INTO projects
        (project_name, region, department, tyre_size, protocol, status, created_at, user_email, inputs)
      VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,$7,$8)
      RETURNING id
    `, [
      project_name,
      region,
      department,
      tyre_size,
      protocol,
      status,
      userEmail,
      inputs || {}   // make sure it’s an object
    ]);

    res.json({ success: true, message: 'Project saved successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Error saving project:', error);
    res.status(500).json({ success: false, message: 'Failed to save project' });
  }
});


// Update the project history endpoint (engineers = own, managers = all with ?all=1)
app.get('/api/project-history', authenticateToken, async (req, res) => {
  try {
    const viewAll = req.query.all === '1' || req.query.view === 'all';
    const isManager = req.user && req.user.role === 'manager';

    const baseFields = `
      id, project_name, region, department, tyre_size, protocol,
      created_at, status, completed_at, user_email
    `;

    let sql, params;
    if (viewAll && isManager) {
      // Manager view: all users’ projects
      sql = `SELECT ${baseFields} FROM projects ORDER BY created_at DESC`;
      params = [];
    } else {
      // Default/engineer view: only their own projects
      sql = `SELECT ${baseFields} FROM projects WHERE user_email = $1 ORDER BY created_at DESC`;
      params = [req.user.email];
    }

    const result = await db.query(sql, params);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch project history',
      details: error.message
    });
  }
});

// Get current system info (timestamp and user)
app.get('/api/system-info', authenticateToken, async (req, res) => {
    try {
        const utcTimestamp = new Date().toISOString()
            .replace('T', ' ')
            .replace(/\.\d+Z$/, '');

        res.json({
            success: true,
            data: {
                current_timestamp: utcTimestamp,
                user_login: req.user.email.split('@')[0] || 'unknown'
            }
        });
    } catch (error) {
        console.error('Error getting system info:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get system information'
        });
    }
});


app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userRole = req.user.role;
    
    let query;
    let params;
    
    // Managers can see all projects, engineers see only their own
    if (userRole === 'manager') {
      query = `
        SELECT 
          p.*,
          COALESCE(u.name, SPLIT_PART(p.user_email, '@', 1)) as user_name
        FROM projects p
        LEFT JOIN users u ON p.user_email = u.email
        ORDER BY p.created_at DESC
      `;
      params = [];
    } else {
      query = `
        SELECT 
          p.*,
          COALESCE(u.name, SPLIT_PART(p.user_email, '@', 1)) as user_name
        FROM projects p
        LEFT JOIN users u ON p.user_email = u.email
        WHERE p.user_email = $1
        ORDER BY p.created_at DESC
      `;
      params = [userEmail];
    }
    
    const result = await db.query(query, params);
    
    // Transform the results to ensure user_name is never null
    const projects = result.rows.map(project => ({
      ...project,
      user_name: project.user_name || project.user_email.split('@')[0]
    }));
    
    console.log(` Fetched ${projects.length} projects for user: ${userEmail}`);
    
    res.json(projects);
    
  } catch (error) {
    console.error('❌ Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects',
      error: error.message
    });
  }
});

// Fix GET /api/projects/:id to return proper 404 or project
app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const q = 'SELECT * FROM projects WHERE id = $1';
    const r = await db.query(q, [id]);
    if (!r.rows || r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    return res.json({ success: true, project: r.rows[0] });
  } catch (err) {
    console.error('GET /api/projects/:id error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// UPDATE PROJECT NAME (PATCH)
// ============================================
app.patch('/api/projects/:id', authenticateToken, async (req, res) => {
    const projectId = req.params.id;
    const { project_name } = req.body;
    const userEmail = req.user.email;

    try {
        // Validate input
        if (!project_name || project_name.trim().length < 3) {
            return res.status(400).json({ 
                error: 'Project name must be at least 3 characters long' 
            });
        }

        // Check if project exists and user has permission
        const checkQuery = `
            SELECT id, user_email 
            FROM projects 
            WHERE id = $1
        `;
        
        const checkResult = await db.query(checkQuery, [projectId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = checkResult.rows[0];

        // Check if user is the project owner or a manager
        if (project.user_email !== userEmail && req.user.role !== 'manager') {
            return res.status(403).json({ 
                error: 'You do not have permission to update this project' 
            });
        }

        // Update only the project_name - NO updated_at column needed
        const updateQuery = `
            UPDATE projects 
            SET project_name = $1
            WHERE id = $2
            RETURNING id, project_name
        `;

        const updateResult = await db.query(updateQuery, [project_name.trim(), projectId]);

        console.log(` Project ${projectId} renamed to "${project_name}" by ${userEmail}`);

        res.json({ 
            success: true, 
            message: 'Project renamed successfully',
            project: updateResult.rows[0]
        });

    } catch (error) {
        console.error(' Error renaming project:', error);
        res.status(500).json({ 
            error: 'Failed to rename project',
            details: error.message 
        });
    }
});

// ============================================
// UPDATE PROJECT STATUS (PATCH)
// ============================================
app.patch('/api/projects/:id/status', authenticateToken, async (req, res) => {
    const projectId = req.params.id;
    const { status } = req.body;
    const userEmail = req.user.email;

    try {
        // Validate status
        const validStatuses = ['Not Started', 'In Progress', 'Completed', 'Archived'];
        
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
            });
        }

        // Check if project exists and user has permission
        const checkQuery = `
            SELECT id, user_email, status as current_status 
            FROM projects 
            WHERE id = $1
        `;
        
        const checkResult = await db.query(checkQuery, [projectId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = checkResult.rows[0];

        // Check if user is the project owner or a manager
        if (project.user_email !== userEmail && req.user.role !== 'manager') {
            return res.status(403).json({ 
                error: 'You do not have permission to update this project' 
            });
        }

        // Prepare update query based on status
        let updateQuery;
        let queryParams;

        if (status === 'Completed') {
            // Set completed_at timestamp when marking as completed
            updateQuery = `
                UPDATE projects 
                SET status = $1, 
                    completed_at = NOW() 
                WHERE id = $2
                RETURNING id, status, completed_at
            `;
            queryParams = [status, projectId];
        } else {
            // Just update status for other statuses
            // If moving from Completed to another status, clear completed_at
            updateQuery = `
                UPDATE projects 
                SET status = $1, 
                    completed_at = NULL 
                WHERE id = $2
                RETURNING id, status
            `;
            queryParams = [status, projectId];
        }

        const updateResult = await db.query(updateQuery, queryParams);

        console.log(` Project ${projectId} status changed from "${project.current_status}" to "${status}" by ${userEmail}`);

        res.json({ 
            success: true, 
            message: 'Project status updated successfully',
            project: updateResult.rows[0]
        });

    } catch (error) {
        console.error(' Error updating project status:', error);
        res.status(500).json({ 
            error: 'Failed to update project status',
            details: error.message 
        });
    }
});



// === Rename a project (PATCH preferred; PUT kept for fallback) ===
// Place ABOVE: app.all('/api/*', ...) and below your other project endpoints.

async function canRenameProject(db, requester, projectId) {
  // Managers can rename anything; engineers can rename only their own projects
  if (!requester) return false;
  if (requester.role === 'manager') return true;

  const r = await db.query('SELECT user_email FROM projects WHERE id = $1', [projectId]);
  if (!r.rows.length) return false;
  return r.rows[0].user_email === requester.email;
}

async function renameProjectHandler(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { project_name } = req.body || {};
    if (!id || !project_name || !project_name.trim()) {
      return res.status(400).json({ success: false, message: 'Valid project id and project_name required' });
    }

    // Check the project exists
    const existing = await db.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Project not found' });

    // Authorization
    const allowed = await canRenameProject(db, req.user, id);
    if (!allowed) return res.status(403).json({ success: false, message: 'Forbidden' });

    // Update ONLY the name (no updated_at column in your schema)
    const q = 'UPDATE projects SET project_name = $1 WHERE id = $2 RETURNING id, project_name';
    const r = await db.query(q, [project_name.trim(), id]);

    return res.json({ success: true, project: r.rows[0] });
  } catch (err) {
    console.error('PATCH /api/projects/:id/name error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}


// DELETE /api/projects/:id - Delete a project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id, 10);
    
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Valid project ID required' });
    }
    
    // Check if project exists and user has permission
    const checkQuery = 'SELECT user_email, project_name FROM projects WHERE id = $1';
    const checkResult = await db.query(checkQuery, [projectId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    
    const project = checkResult.rows[0];
    
    // Authorization: managers can delete any, engineers only their own
    if (req.user.role !== 'manager' && project.user_email !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only delete your own projects' });
    }
    
    // Delete the project (CASCADE will delete related data)
    const deleteQuery = 'DELETE FROM projects WHERE id = $1 RETURNING *';
    const deleteResult = await db.query(deleteQuery, [projectId]);
    
    console.log(` Deleted project ${projectId}: ${project.project_name}`);
    
    res.json({
      success: true,
      message: 'Project deleted successfully',
      project: deleteResult.rows[0]
    });
    
  } catch (error) {
    console.error(' Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete project: ' + error.message
    });
  }
});


// Auth required so req.user is available
app.patch('/api/projects/:id/name', authenticateToken, renameProjectHandler);
app.put('/api/projects/:id/name', authenticateToken, renameProjectHandler); // front-end fallback

// Archive project
app.patch('/api/projects/:id/archive', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id, 10);
    
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Valid project ID required' });
    }
    
    const checkQuery = 'SELECT user_email FROM projects WHERE id = $1';
    const checkResult = await db.query(checkQuery, [projectId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    
    const project = checkResult.rows[0];
    
    if (req.user.role !== 'manager' && project.user_email !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    
    // Store current status before archiving
const updateQuery = `
  UPDATE projects 
  SET previous_status = status, 
      status = $1 
  WHERE id = $2 
  RETURNING *
`;
const updateResult = await db.query(updateQuery, ['Archived', projectId]);
    
    console.log(` Archived project ${projectId}`);
    
    res.json({
      success: true,
      message: 'Project archived successfully',
      project: updateResult.rows[0]
    });
    
  } catch (error) {
    console.error(' Error archiving project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive project: ' + error.message
    });
  }
});

// Unarchive project
app.patch('/api/projects/:id/unarchive', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectId = parseInt(id, 10);
    
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Valid project ID required' });
    }
    
    const checkQuery = 'SELECT user_email FROM projects WHERE id = $1';
    const checkResult = await db.query(checkQuery, [projectId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    
    const project = checkResult.rows[0];
    
    if (req.user.role !== 'manager' && project.user_email !== req.user.email) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    
    // Restore previous status, fallback to 'Not Started' if null
const updateQuery = `
  UPDATE projects 
  SET status = COALESCE(previous_status, 'Not Started'),
      previous_status = NULL
  WHERE id = $2 
  RETURNING *
`;
const updateResult = await db.query(updateQuery, [projectId]);
    
    console.log(` Unarchived project ${projectId}`);
    
    res.json({
      success: true,
      message: 'Project unarchived successfully',
      project: updateResult.rows[0]
    });
    
  } catch (error) {
    console.error(' Error unarchiving project:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unarchive project: ' + error.message
    });
  }
});


// Add this with your other endpoints
// Mark Project as Complete
app.post('/api/mark-project-complete', async (req, res) => {
    try {
        const { projectName } = req.body;

        if (!projectName) {
            return res.status(400).json({
                success: false,
                message: 'Project name is required'
            });
        }

        // First, check if project exists
        const checkQuery = 'SELECT * FROM projects WHERE project_name = $1';
        const checkResult = await db.query(checkQuery, [projectName]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Update project status and completion time
        const updateQuery = `
            UPDATE projects 
            SET status = 'Completed', 
                completed_at = CURRENT_TIMESTAMP 
            WHERE project_name = $1
            RETURNING *
        `;

        const result = await db.query(updateQuery, [projectName]);

        if (result.rows.length > 0) {
            res.json({
                success: true,
                message: 'Project marked as completed',
                project: result.rows[0]
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update project status'
            });
        }
    } catch (error) {
        console.error('Error marking project as complete:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark project as complete'
        });
    }
});

// POST /api/mark-project-in-progress
app.post('/api/mark-project-in-progress', async (req, res) => {
    try {
        const { projectName } = req.body;

        if (!projectName) {
            return res.status(400).json({
                success: false,
                message: 'Project name is required'
            });
        }

        // Check if project exists
        const checkQuery = 'SELECT * FROM projects WHERE project_name = $1';
        const checkResult = await db.query(checkQuery, [projectName]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

                // Update project status to In Progress and clear completed_at
        const updateQuery = `
            UPDATE projects 
            SET status = 'In Progress',
                completed_at = NULL
            WHERE project_name = $1
            RETURNING id, project_name, status, completed_at
        `;

        const result = await db.query(updateQuery, [projectName]);

        if (result.rows.length > 0) {
            // Log the activity
            try {
                await db.query(`
                    INSERT INTO activity_logs (
                        user_email,
                        activity_type,
                        action,
                        description,
                        project_name,
                        metadata,
                        created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                `, [
                    req.user?.email || 'system',
                    'Project Status',
                    'Mark In Progress',
                    `Project "${projectName}" marked as In Progress`,
                    projectName,
                    JSON.stringify({ 
                        previous_status: checkResult.rows[0].status,
                        new_status: 'In Progress'
                    })
                ]);
            } catch (logErr) {
                console.warn('Failed to log activity:', logErr);
            }

            res.json({
                success: true,
                message: 'Project marked as in progress',
                project: result.rows[0]
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update project status'
            });
        }
    } catch (error) {
        console.error('Error marking project as in progress:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark project as in progress'
        });
    }
});

// POST /api/check-project-exists
app.post('/api/check-project-exists', async (req, res) => {
  try {
    const { projectName, protocol } = req.body;
    if (!projectName) return res.status(400).json({ success: false, message: 'projectName required' });

    //  CHECK DATABASE FIRST (not folder)
    let q = 'SELECT id, project_name, protocol, status FROM projects WHERE project_name = $1';
    const params = [projectName];
    
    if (protocol) {
      q += ' AND protocol = $2';
      params.push(protocol);
    }

    const r = await db.query(q, params);
    const exists = r.rows.length > 0;
    
    //  ONLY if project exists in DB, then check folder
    let folderExists = false;
    if (exists) {
      const folderName = projectName + (protocol ? `_${protocol}` : '');
      const projectPath = path.join(__dirname, 'projects', folderName);
      folderExists = fs.existsSync(projectPath);
    }
    
    res.json({ 
      success: true, 
      exists, // TRUE only if in database
      folderExists, // TRUE only if folder exists
      project: r.rows[0] || null 
    });
    
  } catch (err) {
    console.error('/api/check-project-exists', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Fix GET /api/projects/:id to return proper 404 or project
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const q = 'SELECT * FROM projects WHERE id = $1';
    const r = await db.query(q, [id]);
    if (!r.rows || r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    return res.json({ success: true, project: r.rows[0] });
  } catch (err) {
    console.error('GET /api/projects/:id error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Manager APIs (requires authenticateToken + requireManager)
app.get('/api/manager/users', authenticateToken, requireManager, async (req, res) => {
  try {
    // Return users with project counts
    const q = `
      SELECT u.id, u.name, u.email, u.role, u.created_at, u.last_login,
             COALESCE(p.project_count, 0) AS project_count
      FROM users u
      LEFT JOIN (
        SELECT user_email, COUNT(*) AS project_count
        FROM projects
        GROUP BY user_email
      ) p ON p.user_email = u.email
      WHERE u.role = 'engineer'
      ORDER BY u.created_at DESC
    `;
    const r = await db.query(q);
    res.json({ success: true, users: r.rows });
  } catch (err) {
    console.error('/api/manager/users error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/manager/add-user', authenticateToken, requireManager, async (req, res) => {
  try {
    const { name, email, password, role = 'engineer' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password required' });
    }

    // Generate unique user ID
    const userId = await generateUniqueUserId();
    
    const hashed = await bcrypt.hash(password, 10);
    const insertQ = 'INSERT INTO users (id, name, email, password, role, created_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) RETURNING id, name, email, role';
    const r = await db.query(insertQ, [userId, name, email, hashed, role]);
    res.json({ success: true, user: r.rows[0] });
  } catch (err) {
    console.error('/api/manager/add-user error', err);
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Email already exists' });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Manager Reset Password for Engineers
app.post('/api/manager/reset-password', authenticateToken, requireManager, async (req, res) => {
  try {
    const { engineerEmail, newPassword } = req.body;
    
    if (!engineerEmail || !newPassword) {
      return res.status(400).json({ success: false, message: 'Engineer email and new password required' });
    }
    
    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    // Check if user exists and is an engineer
    const userCheck = await db.query('SELECT id, email, role FROM users WHERE email = $1', [engineerEmail]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }
    
    if (userCheck.rows[0].role !== 'engineer') {
      return res.status(403).json({ success: false, message: 'Can only reset passwords for engineers' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    const updateQuery = 'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING email';
    const result = await db.query(updateQuery, [hashedPassword, engineerEmail]);
    
    if (result.rows.length === 0) {
      return res.status(500).json({ success: false, message: 'Failed to update password' });
    }
    
    console.log(` Manager ${req.user.email} reset password for engineer ${engineerEmail}`);
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully',
      email: result.rows[0].email
    });
    
  } catch (err) {
    console.error('/api/manager/reset-password error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Lightweight notifications & recent-activity stubs used by manager dashboard
app.get('/api/manager/notifications', authenticateToken, requireManager, async (req, res) => {
  try {
    // Replace with real notifications query if you have one
    const notifications = []; // e.g. fetch recent system messages
    res.json({ success: true, notifications });
  } catch (err) {
    console.error('/api/manager/notifications error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/manager/recent-activity', authenticateToken, requireManager, async (req, res) => {
  try {
    // Replace with real activity query if you have one
    const activities = []; // e.g. fetch recent manager-visible events
    res.json({ success: true, activities });
  } catch (err) {
    console.error('/api/manager/recent-activity error', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Simple Server-Sent Events endpoint for run status updates
const sseClients = new Set();

function broadcastSse(eventName, payload) {
  const data = `event: ${eventName}\n` + `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (e) { /* ignore broken client */ }
  }
}

app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  sseClients.add(res);

  // keepalive ping
  const ping = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});


// Add TYDEX generation endpoint
app.post('/api/generate-tydex', async (req, res) => {
    try {
        const { protocol, projectName, rowData } = req.body;

        if (!protocol || !projectName || !rowData || !rowData.template_tydex) {
            return res.json({ success: false, message: 'Missing required parameters or template_tydex' });
        }

        // Use template_tydex to find the template file
        let templateFileName = rowData.template_tydex.trim();
        if (!templateFileName.endsWith('.tdx')) {
            templateFileName += '.tdx';
        }
        let outputFileName = rowData.tydex_name ? rowData.tydex_name.trim() : templateFileName;
        if (!outputFileName.endsWith('.tdx')) {
            outputFileName += '.tdx';
        }

        const projectFolder = `${projectName}_${getProtocolAbbreviation(protocol)}`;
        const outputDir = path.join(__dirname, 'projects', projectFolder, `${rowData.p}_${rowData.l}`);
        const odbName = rowData.job ? rowData.job.replace(/\.inp$/i, '') : '';
        const odbPath = path.join(outputDir, `${odbName}.odb`);
        const pythonScriptPath = path.join(__dirname, 'extract_odb_data.py');
        const tempDir = path.join(outputDir, 'temp');
        const templatePath = path.join(__dirname, 'templates', 'Tydex', protocol, templateFileName);
        const outputPath = path.join(outputDir, outputFileName);

        // Step 1: Run the Python script to extract ODB data
        if (!fs.existsSync(odbPath)) {
            return res.json({ success: false, message: `ODB file not found: ${odbPath}` });
        }
        if (!fs.existsSync(pythonScriptPath)) {
            return res.json({ success: false, message: `Python script not found: ${pythonScriptPath}` });
        }

        // Run "abaqus python extract_odb_data.py odbPath outputDir" with timeout
        await new Promise((resolve, reject) => {
            const args = [
                'python',
                `"${pythonScriptPath}"`,
                `"${odbPath}"`,
                `"${outputDir}"`
            ];
            const cmd = `abaqus ${args.join(' ')}`;
            const proc = spawn('cmd', ['/c', cmd], { cwd: __dirname, shell: true, windowsHide: true }); // Added windowsHide
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', data => { stdout += data.toString(); });
            proc.stderr.on('data', data => { stderr += data.toString(); });
            // Add 60-second timeout
            const timeout = setTimeout(() => {
                proc.kill();
                reject(new Error('Python script timeout (60s exceeded)'));
            }, 60000);
            
            proc.on('close', code => {
                clearTimeout(timeout);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Python script failed (exit ${code}): ${stderr || stdout}`));
                }
            });
            proc.on('error', err => {
                clearTimeout(timeout);
                reject(err);
            });
        });

// Step 2: Check if temp folder was created
        if (!fs.existsSync(tempDir)) {
            return res.json({ success: false, message: 'CSV temp directory not found after running Python script.' });
        }
        // Step 3: Check if template exists
        if (!fs.existsSync(templatePath)) {
            const tydexDir = path.join(__dirname, 'templates', 'Tydex', protocol);
            let availableTemplates = [];
            if (fs.existsSync(tydexDir)) {
                availableTemplates = fs.readdirSync(tydexDir).filter(file => file.endsWith('.tdx'));
            }
            return res.json({
                success: false,
                message: `Template file not found: ${templateFileName}. Available templates: ${availableTemplates.join(', ') || 'None found'}`
            });
        }

        // Step 4: Read template and generate TYDEX as before
        const templateContent = await fs.promises.readFile(templatePath, 'utf8');
        const processedContent = await processTydexTemplate(templateContent, tempDir, rowData);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        await fs.promises.writeFile(outputPath, processedContent, 'utf8');
        //  NEW: Save to database (find projectId first)
        const projectId = await findProjectIdByName(projectName);
        
        if (projectId) {
            const fileContent = processedContent; // The generated Tydex content
            
            // In server.js, replace the INSERT query with:
await db.query(`
    INSERT INTO tydex_files (project_id, protocol, filename, content, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (project_id, filename) 
    DO UPDATE SET content = EXCLUDED.content, created_at = NOW()
`, [projectId, protocol, outputFileName, fileContent]);
            
            console.log(`✓ Saved Tydex file to database: ${outputFileName}`);
        }

        res.json({ success: true, message: 'TYDEX file generated successfully' });

    } catch (error) {
        console.error('Error generating TYDEX:', error);
        res.json({ success: false, message: `Error: ${error.message}` });
    }
});

// Helper function to get projectId from project name
async function findProjectIdByName(projectName) {
    try {
        const result = await db.query('SELECT id FROM projects WHERE project_name = $1 LIMIT 1', [projectName]);
        return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (err) {
        console.error('Error finding project ID:', err);
        return null;
    }
}


// Add new endpoint for opening TYDEX file in notepad
app.post('/api/open-tydex-file', (req, res) => {
    try {
        const { protocol, projectName, p, l, tydex_name } = req.body;

        if (!protocol || !projectName || !p || !l || !tydex_name) {
            return res.json({ success: false, message: 'Missing required parameters' });
        }

        // Construct the file path
        const projectFolder = `${projectName}_${getProtocolAbbreviation(protocol)}`;
        const folderName = `${p}_${l}`;

        // Ensure tydex_name has .tdx extension
        let fileName = tydex_name.trim();
        if (!fileName.endsWith('.tdx')) {
            fileName += '.tdx';
        }

        const filePath = path.join(__dirname, 'projects', projectFolder, folderName, fileName);

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.json({ success: false, message: `TYDEX file not found: ${fileName}` });
        }

        // Open file in notepad (spawn is already declared at the top)
        spawn('notepad.exe', [filePath], { detached: true });

        res.json({ success: true, message: 'TYDEX file opened in notepad' });

    } catch (error) {
        console.error('Error opening TYDEX file:', error);
        res.json({ success: false, message: `Error: ${error.message}` });
    }
});

function getProtocolAbbreviation(protocol) {
    switch (protocol) {
        case 'MF6pt2': return 'MF62';
        case 'MF5pt2': return 'MF52';
        case 'FTire': return 'FTire';
        case 'CDTire': return 'CDTire';
        case 'Custom': return 'Custom';
        default: return protocol;
    }
}

async function processTydexTemplate(templateContent, csvDir, rowData = null) {
    const lines = templateContent.split('\n');
    let inMeasurChannels = false;
    let inMeasurData = false;
    let inHeader = false;
    let inConstants = false;
    let channelMapping = {};
    let processedLines = [];

    // Get current date and time
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).replace(/,/g, '-'); // Format: DD-MMM-YYYY (e.g., 15-Jan-2024)

    const currentTime = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) + ' IST'; // Format: HH:MM AM/PM IST

    // Extract ODB file name from csvDir path for MEASID
    const odbFileName = path.basename(path.dirname(csvDir)); // Get parent directory name which should be the P_L folder
    const parentPath = path.dirname(path.dirname(csvDir)); // Get project folder path
    const projectFolderName = path.basename(parentPath); // Get project folder name

    // Try to find ODB file in the P_L folder to get actual name
    let measId = 'unknown_measurement';
    try {
        const plFolderPath = path.dirname(csvDir);
        const files = fs.readdirSync(plFolderPath);
        const odbFile = files.find(file => file.endsWith('.odb'));
        if (odbFile) {
            measId = odbFile.replace('.odb', ''); // Remove .odb extension
        }
    } catch (error) {
        console.warn('Could not determine ODB file name for MEASID:', error.message);
    }

    // Read parameters.inc file to get parameter values
    const parametersPath = path.join(path.dirname(csvDir), 'parameters.inc');
    let parameterValues = {};

    if (fs.existsSync(parametersPath)) {
        try {
            const parametersContent = await fs.promises.readFile(parametersPath, 'utf8');
            parameterValues = parseParametersFile(parametersContent);
        } catch (error) {
            console.warn('Could not read parameters.inc file:', error.message);
        }
    }

    // First pass: identify channel mappings and process header/constants
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('**HEADER')) {
            inHeader = true;
            inConstants = false;
            processedLines.push(line);
            continue;
        }

        if (line.includes('**CONSTANTS')) {
            inHeader = false;
            inConstants = true;
            processedLines.push(line);
            continue;
        }

        if (line.includes('**MEASURCHANNELS')) {
            inHeader = false;
            inConstants = false;
            inMeasurChannels = true;
            processedLines.push(line);
            continue;
        }

        if (line.includes('**MEASURDATA')) {
            inHeader = false;
            inConstants = false;
            inMeasurChannels = false;
            inMeasurData = true;
            processedLines.push(line);
            continue;
        }

        // Check for any other ** section
        if (line.startsWith('**') && !line.includes('**HEADER') && !line.includes('**CONSTANTS') && !line.includes('**MEASURCHANNELS') && !line.includes('**MEASURDATA')) {
            inHeader = false;
            inConstants = false;
            inMeasurChannels = false;
            inMeasurData = false;
            processedLines.push(line);
            continue;
        }

        if (inHeader && line.trim()) {
            // Process header lines for DATE, CLCKTIME, SUPPLIER, and MEASID
            let processedLine = line;

           
            // For DATE lines: find the last non-whitespace sequence and replace it with current date
            if (line.trim().startsWith('DATE')) {
                processedLine = line.replace(/\S+(?=\s*$)/, currentDate);
            }

            // For CLCKTIME lines: find the last non-whitespace sequence and replace it with current time
            if (line.trim().startsWith('CLCKTIME')) {
                processedLine = line.replace(/\S+(?=\s*$)/, currentTime);
            }

            // For SUPPLIER lines: replace everything after "Supplier" while preserving whitespace
            if (line.trim().startsWith('SUPPLIER')) {
                processedLine = line.replace(/(SUPPLIER\s+Data\s+Supplier\s+).*/, '$1Apollo/Vredestein');
            }

            // For MEASID lines: replace with ODB file name
            if (line.trim().startsWith('MEASID')) {
                processedLine = line.replace(/\S+(?=\s*$)/, measId);
            }

            processedLines.push(processedLine);
        } else if (inConstants && line.trim()) {
            // Process constants section
            let processedLine = line;

            // Map TYDEX constants to parameters.inc values
            if (line.trim().startsWith('RIMDIAME')) {
                // diameter from parameters.inc (convert to meters if needed)
                if (parameterValues.diameter) {
                    const diameterValue = (parseFloat(parameterValues.diameter) / 1000).toFixed(4); // Convert mm to m
                    processedLine = line.replace(/\S+(?=\s*$)/, diameterValue);
                }
            } else if (line.trim().startsWith('RIMWIDTH')) {
                // width from parameters.inc (convert to meters if needed)
                if (parameterValues.width) {
                    const widthValue = (parseFloat(parameterValues.width) / 1000).toFixed(4); // Convert mm to m
                    processedLine = line.replace(/\S+(?=\s*$)/, widthValue);
                }
            } else if (line.trim().startsWith('LONGVEL') || line.trim().startsWith('TRAJVELH')) {
                // speed from parameters.inc (convert km/h to m/s)
                if (parameterValues.speed_kmph) {
                    const velocityValue = (parseFloat(parameterValues.speed_kmph) * 1000 / 3600).toFixed(2);
                    processedLine = line.replace(/\S+(?=\s*$)/, velocityValue);
                }
            } else if (line.trim().startsWith('INFLPRES')) {
                // pressure1 from parameters.inc (convert PSI to Pa)
                if (parameterValues.pressure1) {
                    const pressureValue = (parseFloat(parameterValues.pressure1) * 6894.76).toFixed(0); // Convert PSI to Pa (1 PSI = 6894.76 Pa)
                    processedLine = line.replace(/\S+(?=\s*$)/, pressureValue);
                } 
            } else if (line.trim().startsWith('INCLANGL')) {
                // Use inclination angle from database row data only (convert degrees to radians)
                if (rowData && rowData.inclination_angle !== undefined) {
                    const inclinationValue = (parseFloat(rowData.inclination_angle) * Math.PI / 180).toFixed(4);
                    processedLine = line.replace(/\S+(?=\s*$)/, inclinationValue);
                }
            } else if (line.trim().startsWith('LONGSLIP')) {
                // Use slip ratio from database row data only (convert percentage to decimal)
                if (rowData && rowData.slip_ratio !== undefined) {
                    const slipValue = (parseFloat(rowData.slip_ratio) / 100).toFixed(4);
                    processedLine = line.replace(/\S+(?=\s*$)/, slipValue);
                }
            } else if (line.trim().startsWith('SLIPANGL')) {
                // Use slip angle from database row data only (convert degrees to radians)
                if (rowData && rowData.slip_angle !== undefined) {
                    const slipAngleValue = (parseFloat(rowData.slip_angle) * Math.PI / 180).toFixed(4);
                    processedLine = line.replace(/\S+(?=\s*$)/, slipAngleValue);
                }
            } else if (line.trim().startsWith('LOCATION')) {
                // Replace everything after "-" with "R&D Chennai"
                processedLine = line.replace(/(LOCATION\s+Location\s+-\s+).*/, '$1R&D Chennai');
            } else if (line.trim().startsWith('MANUFACT')) {
                // Replace everything after "-" with "Apollo/Vredestein", preserving original spacing
                processedLine = line.replace(/(MANUFACT\s+Tyre brand name\s+-\s+).*/, '$1Apollo/Vredestein');
            } else if (line.trim().startsWith('OVALLDIA')) {
                // Use Outside_diameter from parameters.inc (convert to meters)
                if (parameterValues.Outer_diameter) {
                    const ovallDiaValue = (parseFloat(parameterValues.Outer_diameter) / 1000).toFixed(3); // Convert mm to m
                    processedLine = line.replace(/\S+(?=\s*$)/, ovallDiaValue);
                }
            }

            processedLines.push(processedLine);
        } else if (inMeasurChannels && line.trim()) {
            // Parse channel definition: CHANNELNAME Unit description 1 0 0
            const parts = line.split(/\s+/);
            if (parts.length >= 4) {
                const channelName = parts[0];
                channelMapping[channelName] = Object.keys(channelMapping).length;
            }
            processedLines.push(line);
        } else if (inMeasurData && line.trim() && !line.startsWith('**')) {
            // This is measurement data - will be replaced
            processedLines.push(line);
        } else {
            // Preserve all other content unchanged
            processedLines.push(line);
        }
    }

    // Read CSV data
    const csvData = await readCsvData(csvDir, channelMapping);

    // Second pass: replace measurement data only
    const finalLines = [];
    inMeasurData = false;
    let dataRowCount = 0;

    for (let i = 0; i < processedLines.length; i++) {
        const line = processedLines[i];

        if (line.includes('**MEASURDATA')) {
            inMeasurData = true;
            // Extract the number from the line if present
            const match = line.match(/\*\*MEASURDATA\s+(\d+)/);
            if (match) {
                const newCount = csvData.maxRows || parseInt(match[1]);
                finalLines.push(`**MEASURDATA ${newCount}`);
            } else {
                finalLines.push(line);
            }
            continue;
        }

        // Check for any other ** section to end MEASURDATA processing
        if (line.startsWith('**') && !line.includes('**MEASURDATA')) {
            inMeasurData = false;
            finalLines.push(line);
            continue;
        }

        if (inMeasurData && line.trim() && !line.startsWith('**')) {
            // Replace with CSV data
            if (dataRowCount < csvData.maxRows) {
                const newDataLine = generateDataLine(csvData, channelMapping, dataRowCount, line);
                finalLines.push(newDataLine);
                dataRowCount++;
            }
        } else {
            // Preserve all other content unchanged
            finalLines.push(line);
        }
    }

    return finalLines.join('\n');
}

async function readCsvData(csvDir, channelMapping) {
    const csvData = {};
    let maxRows = 0;

    // Map common channel names to CSV file names
    const channelToCsvMap = {
        'FX': 'FX.csv',
        'FXW': 'FX.csv',
        'FYW': 'FYW.csv',
        'FYH': 'FYW.csv',
        'FZW': 'FZW.csv',
        'FZH': 'FZW.csv',
        'MXW': 'MXW.csv',
        'MXH': 'MXW.csv',
        'MZW': 'MZW.csv',
        'MZH': 'MZW.csv',
        'U1': 'U1.csv',
        'U2': 'U2.csv',
        'U3': 'U3.csv',
        'TYREDEFW': 'U3.csv', // Map TYREDEFW to U3 displacement data
        'DSTGRWHC': 'U3.csv', // Map DSTGRWHC to U3 for calculation
        'RUNTIME': 'FX.csv', // Use time from any CSV, fallback to U1.csv if FX not available
        'MEASNUMB': null // Will be generated as sequence
    };

    // Read parameters.inc file to get Outer_diameter value for DSTGRWHC calculation
    const parametersPath = path.join(path.dirname(csvDir), 'parameters.inc');
    let outerDiameter = 0;

    if (fs.existsSync(parametersPath)) {
        try {
            const parametersContent = fs.readFileSync(parametersPath, 'utf8');
            const parameters = parseParametersFile(parametersContent);
            outerDiameter = parseFloat(parameters.Outer_diameter) || 0;
        } catch (error) {
            console.warn('Could not read Outer_diameter from parameters.inc:', error.message);
        }
    }

// Read all unique CSV files in parallel (OUTSIDE the loop)
const uniqueCsvFiles = new Set(Object.values(channelToCsvMap).filter(Boolean));
const csvContents = {};

await Promise.all(
  Array.from(uniqueCsvFiles).map(async (csvFileName) => {
    const csvPath = path.join(csvDir, csvFileName);
    if (fs.existsSync(csvPath)) {
      csvContents[csvFileName] = await fs.promises.readFile(csvPath, 'utf8');
    }
  })
);

// Now process channels using cached contents
for (const [channelName, index] of Object.entries(channelMapping)) {
  const csvFileName = channelToCsvMap[channelName];

  if (csvFileName && csvContents[csvFileName]) {
    const csvContent = csvContents[csvFileName];
    const lines = csvContent.split('\n').filter(line => line.trim());

    // Skip header line
    const dataLines = lines.slice(1);
    const values = dataLines.map(line => {
      const parts = line.split(',');
      if (channelName === 'RUNTIME') {
        return parseFloat(parts[0]) || 0; // Time column
      } else if (channelName === 'DSTGRWHC') {
        // Calculate Outer_diameter/2 - U3 (convert mm to m and apply formula)
        const u3Value = parseFloat(parts[1]) || 0; // U3 displacement value
        const radiusInMeters = (outerDiameter) / 2; // Convert diameter to radius
        return radiusInMeters - u3Value; // Distance from ground to wheel center
      } else {
        return parseFloat(parts[1]) || 0; // Value column
      }
    });

    csvData[channelName] = values;
    maxRows = Math.max(maxRows, values.length);
  } else if (channelName === 'MEASNUMB') {
    // Generate sequence numbers (will be populated after maxRows is known)
    csvData[channelName] = [];
  } else if (channelName === 'RUNTIME' && !csvData[channelName]) {
    // Fallback: try to get runtime from U1.csv if FX.csv doesn't exist
    if (csvContents['U1.csv']) {
      const csvContent = csvContents['U1.csv'];
      const lines = csvContent.split('\n').filter(line => line.trim());
      const dataLines = lines.slice(1);
      const values = dataLines.map(line => {
        const parts = line.split(',');
        return parseFloat(parts[0]) || 0; // Time column
      });
      csvData[channelName] = values;
      maxRows = Math.max(maxRows, values.length);
    }
  }
}

// Generate sequence numbers for MEASNUMB
if (csvData['MEASNUMB'] !== undefined) {
  csvData['MEASNUMB'] = Array.from({ length: maxRows }, (_, i) => i + 1);
}

csvData.maxRows = maxRows;
return csvData;
}

function generateDataLine(csvData, channelMapping, rowIndex, originalLine) {
    let processedLine = originalLine;

    // Get all the data values for this row
    const dataValues = {};
    for (const [channelName, columnIndex] of Object.entries(channelMapping)) {
        if (csvData[channelName] && rowIndex < csvData[channelName].length) {
            const value = csvData[channelName][rowIndex];

            // Format number to maintain reasonable precision
            if (channelName === 'MEASNUMB') {
                dataValues[columnIndex] = value.toString();
            } else if (channelName === 'RUNTIME') {
                dataValues[columnIndex] = value.toFixed(8);
            } else {
                dataValues[columnIndex] = value.toFixed(4);
            }
        }
    }

    // Process each value position in the line from left to right
    let currentColumnIndex = 0;
    let tempLine = processedLine;

    // Find all non-whitespace sequences and replace them one by one
    while (currentColumnIndex < Object.keys(channelMapping).length) {
        if (dataValues[currentColumnIndex] !== undefined) {
            const newValue = dataValues[currentColumnIndex];

            // Find the position of the current value to replace
            const regex = new RegExp(`(^|\\s+)(\\S+)`, 'g');
            let match;
            let valuePosition = 0;
            let lastMatch = null;

            // Find the specific value position we want to replace
            while ((match = regex.exec(tempLine)) !== null && valuePosition <= currentColumnIndex) {
                if (valuePosition === currentColumnIndex) {
                    lastMatch = match;
                    break;
                }
                valuePosition++;
            }

            if (lastMatch) {
                const fullMatch = lastMatch[0];
                const whitespace = lastMatch[1];
                const currentValue = lastMatch[2];

                // Check if the current value starts with a negative sign
                if (currentValue.startsWith('-')) {
                    // Remove the negative sign and add space before the value
                    const replacement = whitespace + ' ' + newValue;
                    tempLine = tempLine.substring(0, lastMatch.index) + replacement + tempLine.substring(lastMatch.index + fullMatch.length);
                } else {
                    // Use the same replacement logic as date/time - replace the last non-whitespace sequence
                    const replacement = whitespace + currentValue.replace(/\S+(?=\s*$)/, newValue);
                    tempLine = tempLine.substring(0, lastMatch.index) + replacement + tempLine.substring(lastMatch.index + fullMatch.length);
                }
            }
        }
        currentColumnIndex++;
    }

    return tempLine;
}

// Helper function to parse parameters.inc file
function parseParametersFile(content) {
    const parameters = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Skip comments and empty lines
        if (trimmedLine.startsWith('*') || trimmedLine.startsWith('!') || !trimmedLine) {
            continue;
        }

        // Parse parameter assignments (parameter=value)
        const match = trimmedLine.match(/^(\w+)\s*=\s*(.+)$/);
        if (match) {
            const paramName = match[1].trim();
            let paramValue = match[2].trim();

            // Remove any trailing comments
            paramValue = paramValue.split('!')[0].split('*')[0].trim();

            parameters[paramName] = paramValue;
        }
    }

    return parameters;
}


app.post('/api/manager/reset-password', authenticateToken, requireManager, async (req, res) => {
    try {
        const { engineerEmail, newPassword } = req.body;

        // Validate inputs
        if (!engineerEmail || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Engineer email and new password are required'
            });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the password for the engineer
        const result = await db.query(
            'UPDATE users SET password = $1 WHERE email = $2 AND role = \'engineer\' RETURNING email',
            [hashedPassword, engineerEmail]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Engineer not found'
            });
        }

        res.json({
            success: true,
            message: 'Password updated successfully',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password'
        });
    }
});

// --- Engineer: my projects (scoped to logged-in user) ---
app.get('/api/my-projects', authenticateToken, async (req, res) => {
  try {
    const q = `
      SELECT id, project_name, protocol, status, created_at, completed_at, user_email
      FROM projects
      WHERE user_email = $1
      ORDER BY created_at DESC
    `;
    const r = await db.query(q, [req.user.email]);
    return res.json({ success: true, projects: r.rows || [] });
  } catch (err) {
    console.error('GET /api/my-projects error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- Engineer: simple recent activity derived from projects ---
app.get('/api/my-activity', authenticateToken, async (req, res) => {
  try {
    const q = `
      SELECT project_name, protocol, status, created_at, completed_at
      FROM projects
      WHERE user_email = $1
      ORDER BY GREATEST(COALESCE(completed_at,'epoch'), created_at) DESC
      LIMIT 50
    `;
    const r = await db.query(q, [req.user.email]);

    // Turn project rows into "activities"
    const activities = [];
    for (const row of r.rows) {
      activities.push({
        type: 'Project created',
        message: `${row.project_name} (${row.protocol})`,
        created_at: row.created_at
      });
      if (row.completed_at) {
        activities.push({
          type: 'Project completed',
          message: `${row.project_name} (${row.protocol})`,
          created_at: row.completed_at
        });
      }
      if (row.status && !/^(completed|not started)$/i.test(row.status)) {
        activities.push({
          type: `Status: ${row.status}`,
          message: `${row.project_name} (${row.protocol})`,
          created_at: row.created_at
        });
      }
    }

    // Sort newest first and trim
    activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json({ success: true, activities: activities.slice(0, 30) });
  } catch (err) {
    console.error('GET /api/my-activity error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// === In-Progress Drafts (resume state) ===
// Upsert draft snapshot (inputs + computed tables) for a project+protocol
// Around line 6470 - Update GET endpoint

app.get('/api/drafts/:projectId/:protocol', async (req, res) => {
  try {
    const { projectId, protocol } = req.params;

    // ✅ FIXED: Changed project_drafts → protocol_drafts
    const query = `
      SELECT inputs_json, matrix_json, updated_at
      FROM protocol_drafts
      WHERE project_id = $1 AND protocol = $2
    `;

    const result = await db.query(query, [projectId, protocol]);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        inputs_json: null,
        matrix_json: null,
        message: 'No draft found'
      });
    }

    res.json({
      success: true,
      inputs_json: result.rows[0].inputs_json,
      matrix_json: result.rows[0].matrix_json,
      updated_at: result.rows[0].updated_at
    });

  } catch (error) {
    console.error('Error fetching draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch draft: ' + error.message
    });
  }
});

// Read latest draft snapshot for a project+protocol
app.get('/api/projects/:projectId/drafts/:protocol', async (req, res) => {
  const { projectId, protocol } = req.params;
  try {
    const result = await db.query(
      `SELECT * FROM protocol_drafts
       WHERE project_id = $1 AND protocol = $2;`,
      [projectId, protocol]
    );
    res.json({ ok: true, draft: result.rows[0] || null });
  } catch (e) {
    console.error('get draft error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Around line 6920 (AFTER GET /api/projects/:projectId/drafts/:protocol)

/**
 * POST /api/projects/:projectId/drafts/:protocol
 * Save/update draft inputs for a project+protocol
 * ✅ UPSERT: Creates new row or updates existing
 */
app.post('/api/projects/:projectId/drafts/:protocol', authenticateToken, async (req, res) => {
  try {
    const { projectId, protocol } = req.params;
    const { inputs_json } = req.body;

    if (!inputs_json || typeof inputs_json !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'inputs_json must be an object'
      });
    }

    console.log(`💾 Saving draft inputs for project ${projectId}, protocol ${protocol}`);
    console.log(`   Input fields: ${Object.keys(inputs_json).length}`);

    // ✅ UPSERT: Insert new row or update existing
    const upsertQuery = `
      INSERT INTO protocol_drafts (project_id, protocol, inputs_json, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (project_id, protocol)
      DO UPDATE SET
        inputs_json = EXCLUDED.inputs_json,
        updated_at = NOW()
      RETURNING id, project_id, protocol, updated_at
    `;

    const result = await db.query(upsertQuery, [
      projectId,
      protocol,
      JSON.stringify(inputs_json)
    ]);

    console.log(`✅ Draft saved successfully (row ID: ${result.rows[0].id})`);

    res.json({
      success: true,
      message: 'Draft saved successfully',
      draft: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error saving draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save draft: ' + error.message
    });
  }
});

// ADD THIS after the /api/projects/:projectId/data endpoint (around line 2285)
app.get('/api/projects/:projectId/matrix', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get project protocol
    const projectQuery = 'SELECT protocol FROM projects WHERE id = $1';
    const projectResult = await db.query(projectQuery, [projectId]);
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const protocol = projectResult.rows[0].protocol;

    const projectTableMap = {
      'MF62': 'mf62_project_data',
      'MF52': 'mf52_project_data',
      'FTire': 'ftire_project_data',
      'CDTire': 'cdtire_project_data',
      'Custom': 'custom_project_data'
    };

    const tableName = projectTableMap[protocol];
    if (!tableName) {
      return res.status(400).json({ success: false, message: 'Unknown protocol' });
    }

    const dataQuery = `SELECT * FROM ${tableName} WHERE project_id = $1 ORDER BY number_of_runs`;
    const dataResult = await db.query(dataQuery, [projectId]);

    res.json({
      success: true,
      protocol: protocol,
      rows: dataResult.rows
    });

  } catch (error) {
    console.error('Error fetching project matrix:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


// ============================================
// ACTIVITY LOG ENDPOINTS
// ============================================

/**
 * POST /api/activity-log
 * Create a new activity log entry
 */
app.post('/api/activity-log', authenticateToken, async (req, res) => {
  try {
    const {
      activity_type,
      action,
      description,
      status = 'success',
      related_entity_id,
      related_entity_type,
      metadata = {}
    } = req.body;

    const user_email = req.user.email;
    const user_name = req.user.name || 'Unknown';

    // Get IP address
    const ip_address = getClientIP(req);


    // Get browser and device info from User-Agent
    const userAgent = req.headers['user-agent'] || '';
    const browser = parseBrowser(userAgent);
    const device_type = parseDeviceType(userAgent);

    //  Extract project_name from request body
const project_name = req.body.project_name || null;

const insertQuery = `
  INSERT INTO activity_logs (
    user_email, user_name, activity_type, action, description,
    status, ip_address, browser, device_type,
    related_entity_id, related_entity_type, project_name, metadata, created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
  RETURNING *
`;

const result = await db.query(insertQuery, [
  user_email,
  user_name,
  activity_type,
  action,
  description,
  status,
  ip_address,
  browser,
  device_type,
  related_entity_id || null,
  related_entity_type || null,
  project_name, //  Added
  JSON.stringify(metadata)
]);

    res.json({ success: true, log: result.rows[0] });

  } catch (error) {
    console.error('Error creating activity log:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/activity-log
 * Get activity logs for current user (with filters)
 */
app.get('/api/activity-log', authenticateToken, async (req, res) => {
  try {
    const user_email = req.user.email;
    const user_role = req.user.role;

    const {
      activity_type,
      status,
      start_date,
      end_date,
      limit = 100,
      offset = 0
    } = req.query;

    let query = `
      SELECT * FROM activity_logs
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // Managers can see all logs, engineers only their own
    if (user_role !== 'manager') {
      query += ` AND user_email = $${paramIndex}`;
      params.push(user_email);
      paramIndex++;
    }

    // Apply filters
    if (activity_type) {
      query += ` AND activity_type = $${paramIndex}`;
      params.push(activity_type);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (start_date) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM activity_logs WHERE 1=1`;
    const countParams = [];
    let countIndex = 1;

    if (user_role !== 'manager') {
      countQuery += ` AND user_email = $${countIndex}`;
      countParams.push(user_email);
      countIndex++;
    }

    if (activity_type) {
      countQuery += ` AND activity_type = $${countIndex}`;
      countParams.push(activity_type);
      countIndex++;
    }

    if (status) {
      countQuery += ` AND status = $${countIndex}`;
      countParams.push(status);
      countIndex++;
    }

    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      logs: result.rows,
      total: totalCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/activity-log/stats
 * Get activity statistics
 */
app.get('/api/activity-log/stats', authenticateToken, async (req, res) => {
  try {
    const user_email = req.user.email;
    const user_role = req.user.role;

    const whereClause = user_role === 'manager' ? '' : 'WHERE user_email = $1';
    const params = user_role === 'manager' ? [] : [user_email];

    // Get activity type breakdown
    const typeQuery = `
      SELECT activity_type, COUNT(*) as count
      FROM activity_logs
      ${whereClause}
      GROUP BY activity_type
      ORDER BY count DESC
    `;

    const typeResult = await db.query(typeQuery, params);

    // Get status breakdown
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM activity_logs
      ${whereClause}
      GROUP BY status
    `;

    const statusResult = await db.query(statusQuery, params);

    // Get recent activity count
    const recentQuery = `
      SELECT COUNT(*) as count
      FROM activity_logs
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} created_at >= NOW() - INTERVAL '24 hours'
    `;

    const recentResult = await db.query(recentQuery, params);

    res.json({
      success: true,
      stats: {
        by_type: typeResult.rows,
        by_status: statusResult.rows,
        last_24_hours: parseInt(recentResult.rows[0].count)
      }
    });

  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper functions for parsing user agent
function parseBrowser(userAgent) {
  //  Check Edge FIRST (before Chrome) because Edge contains "Chrome" in user agent
  if (userAgent.includes('Edg/') || userAgent.includes('Edge/')) return 'Edge';
  
  // Check for Chrome (but exclude Edge)
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  
  // Check for Firefox
  if (userAgent.includes('Firefox')) return 'Firefox';
  
  // Check for Safari (excluding Chrome-based browsers)
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  
  // Check for Internet Explorer
  if (userAgent.includes('MSIE') || userAgent.includes('Trident')) return 'Internet Explorer';
  
  // Check for Opera
  if (userAgent.includes('OPR') || userAgent.includes('Opera')) return 'Opera';
  
  return 'Unknown';
}

function parseDeviceType(userAgent) {
  if (userAgent.includes('Mobile')) return 'Mobile';
  if (userAgent.includes('Tablet')) return 'Tablet';
  return 'Desktop';
}



// -----------------------------
// Run-time persistence endpoints
// -----------------------------

/**
 * POST /api/record-run-time
 * Body: { projectName, protocol, runNumber, startTime?, endTime?, durationSeconds? }
 * Adds columns to protocol table if missing and updates row for number_of_runs.
 */
app.post('/api/record-run-time', async (req, res) => {
  try {
    const { projectName, protocol, runNumber } = req.body;
    const startTime = req.body.startTime || null;
    const endTime = req.body.endTime || null;
    const durationSeconds = req.body.durationSeconds != null ? Number(req.body.durationSeconds) : null;

    if (!protocol || !runNumber) return res.status(400).json({ success:false, message: 'protocol and runNumber required' });

    const tableMap = {
      'mf62': 'mf_data',
      'mf52': 'mf52_data',
      'ftire': 'ftire_data',
      'cdtire': 'cdtire_data',
      'custom': 'custom_data'
    };
    const tableName = tableMap[String(protocol).toLowerCase()];
    if (!tableName) return res.status(400).json({ success:false, message: 'Unknown protocol' });

    // Ensure columns exist
    const alterQueries = [
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_start_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_end_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_duration_seconds INTEGER`
    ];
    for (const q of alterQueries) {
      try { await db.query(q); } catch (e) { /* ignore */ }
    }

    // Build update parts
    const parts = [];
    const params = [];
    let idx = 1;
    if (startTime) { parts.push(`run_start_time = $${idx++}`); params.push(startTime); }
    if (endTime)   { parts.push(`run_end_time = $${idx++}`); params.push(endTime); }
    if (durationSeconds !== null) { parts.push(`run_duration_seconds = $${idx++}`); params.push(durationSeconds); }

    if (parts.length === 0) {
      return res.json({ success: true, message: 'Nothing to update' });
    }

    // final param for number_of_runs
    params.push(runNumber);
    const updateQuery = `UPDATE ${tableName} SET ${parts.join(', ')} WHERE number_of_runs = $${idx} RETURNING *`;
    const { rows } = await db.query(updateQuery, params);

    // if no row updated, try to insert a minimal row (best-effort; won't include other columns)
    if (rows.length === 0) {
      const insertCols = ['number_of_runs'];
      const insertVals = [];
      const insertParams = [];
      let pidx = 1;
      insertVals.push(`$${pidx++}`);
      insertParams.push(runNumber);
      if (startTime) { insertCols.push('run_start_time'); insertVals.push(`$${pidx++}`); insertParams.push(startTime); }
      if (endTime)   { insertCols.push('run_end_time'); insertVals.push(`$${pidx++}`); insertParams.push(endTime); }
      if (durationSeconds !== null) { insertCols.push('run_duration_seconds'); insertVals.push(`$${pidx++}`); insertParams.push(durationSeconds); }
      const insertQ = `INSERT INTO ${tableName} (${insertCols.join(',')}) VALUES (${insertVals.join(',')}) RETURNING *`;
      try {
        const ir = await db.query(insertQ, insertParams);
        return res.json({ success: true, inserted: ir.rows[0] || null });
      } catch (e) {
        // could fail due to NOT NULL constraints; log and still return ok
        console.error('insert run-time fallback failed', e && e.message);
        return res.json({ success: true, message: 'No matching row updated; attempted insert failed' });
      }
    }

    res.json({ success: true, updated: rows[0] });
  } catch (err) {
    console.error('record-run-time error', err && err.stack || err);
    res.status(500).json({ success: false, message: 'Server error recording run time' });
  }
});

/**
 * GET /api/get-run-times
 * Query: projectId (optional) & protocol
 * Returns list of { number_of_runs, run_start_time, run_end_time, run_duration_seconds }
 */
app.get('/api/get-run-times', async (req, res) => {
  try {
    const protocol = req.query.protocol;
    if (!protocol) return res.status(400).json({ success: false, message: 'protocol required' });

    const tableMap = {
      'mf62': 'mf_data',
      'mf52': 'mf52_data',
      'ftire': 'ftire_data',
      'cdtire': 'cdtire_data',
      'custom': 'custom_data'
    };
    const tableName = tableMap[String(protocol).toLowerCase()];
    if (!tableName) return res.status(400).json({ success: false, message: 'Unknown protocol' });

    // Ensure the runtime columns exist (safe even if they already do)
    const alterQueries = [
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_start_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_end_time TIMESTAMP`,
      `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS run_duration_seconds INTEGER`
    ];
    for (const q of alterQueries) {
      try { await db.query(q); } catch (e) { /* ignore alter errors */ }
    }

    // Now safely select
    const q = `SELECT number_of_runs, run_start_time, run_end_time, run_duration_seconds FROM ${tableName} ORDER BY number_of_runs`;
    const { rows } = await db.query(q);
    res.json(rows);
  } catch (err) {
    console.error('get-run-times error', err && err.stack || err);

    // Fallback: try to return number_of_runs only (map to uniform shape)
    try {
      const protocol = req.query.protocol || '';
      const tableMap = {
        'mf62': 'mf_data',
        'mf52': 'mf52_data',
        'ftire': 'ftire_data',
        'cdtire': 'cdtire_data',
        'custom': 'custom_data'
      };
      const tableName = tableMap[String(protocol).toLowerCase()];
      if (tableName) {
        const { rows } = await db.query(`SELECT number_of_runs FROM ${tableName} ORDER BY number_of_runs`);
        const mapped = rows.map(r => ({
          number_of_runs: r.number_of_runs,
          run_start_time: null,
          run_end_time: null,
          run_duration_seconds: 0
        }));
        return res.json(mapped);
      }
    } catch (e) {
      console.error('get-run-times fallback failed', e && e.stack || e);
    }

    res.status(500).json({ success: false, message: 'Server error fetching run times' });
  }
});

// track spawned child processes so we can terminate them
const runningProcesses = new Set();

function registerChildProcess(child, meta = {}) {
  try {
    runningProcesses.add(child);
    // attach cleanup on exit
    child.on('close', () => runningProcesses.delete(child));
    child.on('error', () => runningProcesses.delete(child));
    // optional metadata
    child._meta = meta;
  } catch (e) {
    console.warn('registerChildProcess error', e);
  }
}

// ===== Tydex File Storage & Retrieval Endpoints =====

/**
 * POST /api/tydex/:projectId
 * Save a generated Tydex file for a project
 * Body: { protocol, filename, content }
 */
app.post('/api/tydex/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { protocol, filename, content } = req.body;

    if (!protocol || !filename || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'protocol, filename, and content are required' 
      });
    }

    const insertQuery = `
      INSERT INTO tydex_files (project_id, protocol, filename, content, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, filename, created_at
    `;

    const result = await db.query(insertQuery, [projectId, protocol, filename, content]);

    res.json({
      success: true,
      message: 'Tydex file saved successfully',
      file: result.rows[0]
    });

  } catch (error) {
    console.error('Error saving Tydex file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save Tydex file: ' + error.message
    });
  }
});

/**
 * GET /api/tydex/:projectId
 * Get all Tydex files for a project
 */
app.get('/api/tydex/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const query = `
      SELECT id, protocol, filename, created_at
      FROM tydex_files
      WHERE project_id = $1
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, [projectId]);

    res.json(result.rows || []);

  } catch (error) {
    console.error('Error fetching Tydex files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Tydex files: ' + error.message
    });
  }
});

/**
 * GET /api/tydex/:projectId/:fileId
 * Get a specific Tydex file's content
 */
app.get('/api/tydex/:projectId/:fileId', async (req, res) => {
  try {
    const { projectId, fileId } = req.params;

    const query = `
      SELECT id, protocol, filename, content, created_at
      FROM tydex_files
      WHERE project_id = $1 AND id = $2
    `;

    const result = await db.query(query, [projectId, fileId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tydex file not found'
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching Tydex file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Tydex file: ' + error.message
    });
  }
});

/**
 * GET /api/drafts/:projectId/:protocol
 * Get saved draft inputs and matrix for a project+protocol
 */
app.get('/api/drafts/:projectId/:protocol', async (req, res) => {
  try {
    const { projectId, protocol } = req.params;

    const query = `
      SELECT inputs_json, matrix_json, updated_at
      FROM protocol_drafts
      WHERE project_id = $1 AND protocol = $2
    `;

    const result = await db.query(query, [projectId, protocol]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No draft found for this project and protocol'
      });
    }

    res.json({
      success: true,
      inputs_json: result.rows[0].inputs_json,
      matrix_json: result.rows[0].matrix_json,
      updated_at: result.rows[0].updated_at
    });

  } catch (error) {
    console.error('Error fetching draft:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch draft: ' + error.message
    });
  }
});


// Around line 5050

/**
 * GET /api/project-inputs
 * Fetch saved inputs from protocol_drafts table for input sidebar
 * ✅ Shows ALL projects with ANY saved inputs (even partial)
 * ✅ FIXED: Added authenticateToken middleware
 */
app.get('/api/project-inputs', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const userEmail = req.user.email; // ✅ Get user email from JWT token
    
    console.log(`📋 Fetching saved inputs for user: ${userEmail}`);
    
    // Fetch drafts with inputs for current user
    const query = `
      SELECT 
        pd.project_id AS id,
        p.project_name,
        pd.protocol,
        pd.inputs_json AS inputs,
        pd.updated_at AS created_at
      FROM protocol_drafts pd
      JOIN projects p ON p.id = pd.project_id
      WHERE p.user_email = $1
        AND pd.inputs_json IS NOT NULL
        AND jsonb_typeof(pd.inputs_json) = 'object'
        AND pd.inputs_json::text != '{}'
      ORDER BY pd.updated_at DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [userEmail, limit]);
    
    console.log(`📋 Fetched ${result.rows.length} saved input sets for ${userEmail}`);
    
    // ✅ Parse inputs_json for each row
    const rows = result.rows.map(row => ({
      ...row,
      inputs: typeof row.inputs === 'string' ? JSON.parse(row.inputs) : row.inputs
    }));
    
    res.json(rows);
    
  } catch (error) {
    console.error('❌ Error fetching project inputs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inputs: ' + error.message
    });
  }
});


// Add API route to stop all running processes
app.post('/api/stop-all', (req, res) => {
  const result = { requested: 0, killed: [], errors: [] };
  const procs = Array.from(runningProcesses);
  result.requested = procs.length;

  procs.forEach((child) => {
    try {
      // best-effort termination
      // first try graceful termination
      child.kill && child.kill(); // default signal
      // if still alive after short delay, force kill (platform dependent)
      setTimeout(() => {
        try {
          if (!child.killed && child.kill) child.kill('SIGKILL');
        } catch (e) {}
      }, 1200);
      result.killed.push(child.pid || null);
    } catch (err) {
      result.errors.push(String(err));
    }
  });

  // optional: broadcast SSE if you implemented broadcastSse earlier
  try {
    if (typeof broadcastSse === 'function') {
      broadcastSse('run-status', { status: 'stopped', message: 'Stopped by user via Stop All' });
    }
  } catch (e) {}

  res.json({ ok: true, ...result });
});