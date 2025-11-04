const fs = require('fs');
const path = require('path');

class ProjectLogger {
  constructor(projectPath, projectName) {
    this.projectPath = projectPath;
    this.projectName = projectName;
    this.logsDir = path.join(projectPath, 'logs');
    
    // VERIFY PROJECT PATH EXISTS
    if (!fs.existsSync(projectPath)) {
      console.error(`Project path does not exist: ${projectPath}`);
      // Create it anyway
      fs.mkdirSync(projectPath, { recursive: true });
    }
    
    // CREATE LOGS DIRECTORY WITH ERROR HANDLING
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
        console.log(`Created logs directory: ${this.logsDir}`);
      } else {
        console.log(`Logs directory already exists: ${this.logsDir}`);
      }
    } catch (err) {
      console.error(`Failed to create logs directory: ${this.logsDir}`, err);
      throw err; // Re-throw to prevent silent failure
    }
    
    // CREATE LOG FILE WITH TIMESTAMP
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(this.logsDir, `${projectName}_${timestamp}.log`);
    
    // ENSURE LOG FILE PHYSICALLY EXISTS (atomic create)
    try {
      // open in append mode and close immediately (creates file if missing)
      const fd = fs.openSync(this.logFile, 'a');
      fs.closeSync(fd);
      console.log(`Ensured log file exists: ${this.logFile}`);
    } catch (err) {
      console.error(`Failed to create log file: ${this.logFile}`, err);
      throw err;
    }
    
    //  VERIFY LOG FILE CAN BE WRITTEN TO (initialize header)
    try {
      // Initialize log file with header
      this.write(`\n${'='.repeat(80)}`);
      this.write(`PROJECT LOG FILE: ${projectName}`);
      this.write(`Created: ${new Date().toLocaleString()}`);
      this.write(`Project Path: ${projectPath}`);
      this.write(`Log File: ${this.logFile}`);
      this.write(`${'='.repeat(80)}\n`);
      
      console.log(`Log file created: ${this.logFile}`);
    } catch (err) {
      console.error(`Failed to write to log file: ${this.logFile}`, err);
      throw err;
    }
  }
  
  write(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    try {
      // Write to file with error handling
      fs.appendFileSync(this.logFile, logEntry, { encoding: 'utf8' });
    } catch (err) {
      // Fallback to console if file write fails
      console.error(`Failed to write to log file: ${this.logFile}`, err);
    }
    
    // Also log to console
    console.log(message);
  }
  
  info(message) {
    this.write(`[INFO] ${message}`);
  }
  
  error(message, error = null) {
    this.write(`[ERROR] ${message}`);
    if (error) {
      this.write(`[ERROR] Stack Trace: ${error.stack || error.message || error}`);
    }
  }
  
  warn(message) {
    this.write(`[WARN] ${message}`);
  }
  
  success(message) {
    this.write(`[SUCCESS] ${message}`);
  }
  
  separator(title = null) {
    this.write(`\n${'='.repeat(80)}`);
    if (title) this.write(` ${title}`);
    this.write(`${'='.repeat(80)}\n`);
  }
  
  jobStart(jobName, oldJobName = null) {
    this.separator('JOB EXECUTION START');
    this.write(`Job Name: ${jobName}`);
    if (oldJobName && oldJobName !== '-') {
      this.write(`Dependencies: ${oldJobName}`);
    }
    this.write(`Start Time: ${new Date().toLocaleString()}`);
  }
  
  jobEnd(jobName, success = true, duration = null) {
    this.separator('JOB EXECUTION END');
    this.write(`Job Name: ${jobName}`);
    this.write(`Status: ${success ? 'SUCCESS' : 'FAILED'}`);
    this.write(`End Time: ${new Date().toLocaleString()}`);
    if (duration) {
      this.write(`Duration: ${duration}ms`);
    }
  }
  
  abaqusOutput(output) {
    this.write(`[ABAQUS] ${output.trim()}`);
  }
  
  fortranOutput(output) {
    this.write(`[FORTRAN] ${output.trim()}`);
  }
  
  pythonOutput(output) {
    this.write(`[PYTHON] ${output.trim()}`);
  }
}

module.exports = ProjectLogger;