# Apollo Tyres R&D - Tyre Virtualization Tool

A comprehensive web application for tyre simulation and analysis, supporting multiple protocols including MF 6.2, MF 5.2, FTire, CDTire, and Custom configurations.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Project Structure](#project-structure)
- [Protocol Excel Files](#protocol-excel-files)
- [Running the Application](#running-the-application)
- [Usage Guide](#usage-guide)
- [Troubleshooting](#troubleshooting)

## Overview

The Apollo Tyres Tyre Virtualization Tool is designed for:
- Managing tyre simulation protocols (MF 6.2, MF 5.2, FTire, CDTire, Custom)
- Processing protocol-specific Excel files with parameter configurations
- Automated job dependency resolution and execution
- Real-time status monitoring with enhanced reliability
- File management for simulation inputs and outputs

## Prerequisites

Before setting up the project, ensure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **PostgreSQL** (v12 or higher) - [Download here](https://www.postgresql.org/download/)
- **Abaqus** (for simulation execution) - Ensure it's installed and accessible
- **Windows OS** (required for Abaqus integration)

## Installation

### 1. Clone/Setup Project
```bash
# Navigate to your project directory
cd Apollo-Tyres

# Initialize package.json (if not already present)
npm init -y
```

### 2. Install Dependencies
```bash
# Install all required packages
npm install express pg bcrypt jsonwebtoken multer rimraf xlsx axios node-fetch

# Install development dependencies
npm install nodemon --save-dev
```

### 3. Verify package.json
Ensure your `package.json` includes these dependencies:
```json
{
  "dependencies": {
    "axios": "^1.9.0",
    "bcrypt": "^5.1.0",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "multer": "^1.4.5-lts.1",
    "node-fetch": "^2.7.0",
    "pg": "^8.11.0",
    "rimraf": "^3.0.2",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}
```

## Database Setup

### 1. Install and Configure PostgreSQL

1. **Install PostgreSQL** with default settings
2. **Set password** for postgres user (default in code: `0306`)

### 2. Database Configuration

The application automatically creates required tables on startup. Default database config in `server.js`:

```javascript
const dbConfig = {
    host: 'localhost',
    user: 'postgres',
    password: '0306',      // Change this to your PostgreSQL password
    database: 'apollo_tyres',
    port: 5432
};
```

**To customize database settings:**
- Update the `dbConfig` object in `server.js`
- Or set environment variables: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`

### 3. Default Admin User

The application creates a default admin user:
- **Email**: `admin@apollotyres.com`
- **Password**: `Apollo@123`

## Project Structure

```
d:\Apollo-Tyres/
├── package.json              # Project dependencies
├── server.js                 # Main server file
├── README.md                 # This file
├── css/                      # Stylesheets
├── js/                       # JavaScript files
├── public/                   # HTML pages
├── protocol/                 # Protocol Excel templates
├── templates/                # Simulation input templates
├── projects/                 # Generated project files
└── inc/                      # Include files
```

## Protocol Excel Files

The application requires specific Excel templates for each protocol:

### Required Files in `protocol/` directory:

1. **MF6pt2.xlsx** - Magic Formula 6.2 protocol template
2. **MF5pt2.xlsx** - Magic Formula 5.2 protocol template  
3. **FTire.xlsx** - FTire protocol template
4. **CDTire.xlsx** - CDTire protocol template
5. **Custom.xlsx** - Custom protocol template

### Excel File Format Requirements:

Each Excel file must contain:
- **Header row** with column names including:
  - `Number Of Tests` / `No of Tests`
  - `Tests` / `Test Name`
  - `Inflation Pressure [PSI]` or `[bar]`
  - `Loads[Kg]` / `Preload [N]`
  - `Inclination Angle[°]` / `Camber [Deg]`
  - `Slip Angle[°]` / `[deg]`
  - `Slip Ratio [%]` / `Slip range [%]`
  - `Test Velocity [Kmph]` / `Velocity [km/h]`
  - `Job` (input file name)
  - `Old Job` (dependency job name)

### Parameter Placeholders:

Use these placeholders in Excel files for dynamic replacement:
- `P1`, `P2`, `P3` - Pressure values
- `L1`, `L2`, `L3`, `L4`, `L5` - Load values
- `VEL`, `Vel`, `vel` - Velocity values
- `IA`, `-IA` - Inclination angle (positive/negative)
- `SA`, `-SA` - Slip angle (positive/negative)  
- `SR`, `-SR` - Slip ratio (positive/negative)

### Template Structure:

```
templates/
├── MF6pt2/
│   ├── P1_L1/          # Pressure 1, Load 1 combinations
│   │   ├── tiretransfer_axi_half.inp
│   │   ├── tiretransfer_symmetric.inp
│   │   ├── tiretransfer_full.inp
│   │   ├── rollingtire_brake_trac.inp
│   │   ├── rollingtire_brake_trac1.inp
│   │   └── rollingtire_freeroll.inp
│   ├── P1_L2/
│   └── P1_L3/
├── MF5pt2/
├── FTire/
├── CDTire/
└── Custom/
```

## Running the Application

### Development Mode
```bash
# Start with automatic restart on file changes
npm run dev

# Or manually with nodemon
npx nodemon server.js
```

### Production Mode
```bash
# Start the server
npm start

# Or directly with node
node server.js
```

### Verify Setup
1. **Check console output** for successful database connection
2. **Open browser** to `http://localhost:3000`
3. **Login** with admin credentials
4. **Test protocol upload** with sample Excel file

## Usage Guide

### 1. Login
- Navigate to `http://localhost:3000`
- Use default credentials: `admin@apollotyres.com` / `Apollo@123`

### 2. Create Project
- Enter project name on the main page
- Project folders will be created automatically

### 3. Configure Protocol
1. **Select protocol** (MF 6.2, MF 5.2, FTire, CDTire, Custom)
2. **Upload mesh file** (optional, for some protocols)
3. **Enter parameters**:
   - Load values (L1, L2, L3, etc.)
   - Pressure values (P1, P2, P3)
   - Velocity, angles, dimensions
4. **Submit** to generate protocol-specific configuration
   - If a project with the same name already exists, you'll be prompted with "Project already exists. Do you want to Replace it?"
   - Click **Yes** to replace the existing project folder
   - Click **No** to cancel and stay on the current page

### 4. Monitor Jobs
- **Automatic status checking** every 5 seconds
- **Manual refresh** by clicking status indicators
- **Real-time updates** for running, completed, and error states
- **Dependency resolution** handles job execution order

### 5. Status Indicators
- ✅ **Completed** - Job finished successfully
- ⌛ **Running** - Job currently executing
- ⚠️ **Error** - Job failed or encountered error
- ✕ **Not started** - Job not yet submitted


## Troubleshooting

### Common Issues

**1. Database Connection Failed**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
- Verify PostgreSQL is running
- Check database credentials in `server.js`

**2. Protocol Excel File Errors**
```
Error: No valid data found in Excel file
```
- Verify Excel file has correct header row
- Check column names match expected format
- Ensure data rows contain valid test configurations

**3. Abaqus Job Execution Fails**
```
Error executing job: Failed to start process
```
- Verify Abaqus is installed and in system PATH
- Check input files exist in project folders
- Ensure sufficient disk space for output files

**4. Status Not Updating**
```
Status shows "Not started" for running jobs
```
- Check browser console for JavaScript errors
- Verify `/api/check-job-status` endpoint is accessible
- Clear browser cache and reload page

### Log Files
- **Server logs**: Console output from `node server.js`
- **Database logs**: PostgreSQL logs (location varies by installation)
- **Abaqus logs**: `.log`, `.sta`, `.msg` files in project folders

### Performance Tips
- **Database**: Regular maintenance and indexing for large datasets
- **File system**: Use SSD storage for faster I/O operations
- **Memory**: Allocate sufficient RAM for concurrent job processing

## Support

For technical support or questions:
1. Check console logs for error details
2. Verify all prerequisites are installed correctly
3. Review troubleshooting section above

---

**Apollo Tyres R&D Department**  
*Tyre Virtualization Tool v1.0*


