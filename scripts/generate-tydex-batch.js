/**
 * Helper script for batch Tydex generation
 * Called from batch file with arguments:
 * node generate-tydex-batch.js <projectName> <protocol> <runNumber> <templateTydex> <tydexName> <folderPath>
 */

const path = require('path');
const fs = require('fs');

// Get arguments
const [nodePath, scriptPath, projectName, protocol, runNumber, templateTydex, tydexName, folderPath] = process.argv;

console.log(`\n${'='.repeat(80)}`);
console.log(`📄 Generating Tydex for Run ${runNumber}`);
console.log(`${'='.repeat(80)}`);
console.log(`Project: ${projectName}`);
console.log(`Protocol: ${protocol}`);
console.log(`Template: ${templateTydex}`);
console.log(`Output: ${tydexName}`);
console.log(`Folder: ${folderPath}`);
console.log(`${'='.repeat(80)}\n`);

try {
    // ✅ Validate inputs
    if (!projectName || !protocol || !runNumber || !templateTydex || !tydexName || !folderPath) {
        throw new Error('Missing required arguments');
    }
    
    // ✅ Locate template file
    const templatesDir = path.join(__dirname, '..', 'templates', 'Tydex', protocol);
    let templateFile = templateTydex;
    
    // Add .tdx extension if missing
    if (!templateFile.endsWith('.tdx')) {
        templateFile += '.tdx';
    }
    
    const templatePath = path.join(templatesDir, templateFile);
    
    console.log(`📂 Looking for template: ${templatePath}`);
    
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templatePath}`);
    }
    
    console.log(`✅ Template found`);
    
    // ✅ Read template content
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // ✅ Process template (replace placeholders with actual data)
    const csvDir = folderPath; // CSV files should be in the test folder
    const processedContent = await processTydexTemplateSync(templateContent, csvDir, {
        projectName,
        protocol,
        runNumber,
        templateTydex,
        tydexName
    });
    
    // ✅ Write output file
    let outputFile = tydexName;
    if (!outputFile.endsWith('.tdx')) {
        outputFile += '.tdx';
    }
    
    const outputPath = path.join(folderPath, outputFile);
    fs.writeFileSync(outputPath, processedContent, 'utf8');
    
    console.log(`\n✅ Tydex file generated: ${outputPath}`);
    console.log(`${'='.repeat(80)}\n`);
    
    process.exit(0); // Success
    
} catch (error) {
    console.error(`\n❌ Error generating Tydex:`);
    console.error(`   ${error.message}`);
    console.error(`${'='.repeat(80)}\n`);
    process.exit(1); // Failure
}

/**
 * Synchronous version of processTydexTemplate for batch execution
 * (Copy the processTydexTemplate function from server.js but make it sync)
 */
function processTydexTemplateSync(templateContent, csvDir, rowData) {
    // ✅ Implementation here (copy from server.js but use fs.readFileSync instead of async)
    const lines = templateContent.split('\n');
    let processedLines = [];
    
    // ... (rest of template processing logic - same as server.js but synchronous)
    
    return processedLines.join('\n');
}