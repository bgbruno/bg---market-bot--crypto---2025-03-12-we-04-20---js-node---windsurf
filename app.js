#!/usr/bin/env node

/**
 * Binance Trading Bot - Main Application
 * 
 * This is the main entry point for the Binance Trading Bot application.
 * It provides a unified interface to run various commands and scripts.
 * 
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Define available commands and their associated scripts
const commands = {
  'account-info': {
    script: 'account-info.js',
    description: 'Get account information and balances'
  },
  'exchange-info': {
    script: 'exchange-info.js',
    description: 'Get exchange information and trading pairs'
  },
  'order': {
    script: 'order.js',
    description: 'Get information about a specific order'
  },
  'order-monitor': {
    script: 'order-monitor.js',
    description: 'Monitor an order until it\'s filled'
  },
  'orders-download': {
    script: 'orders-download.js',
    description: 'Download orders and save to CSV or SQLite'
  },
  'order-trade': {
    script: 'order-trade.js',
    description: 'Create and manage trading orders'
  },
  'order-cancel': {
    script: 'order-cancel.js',
    description: 'Cancel an existing order'
  }
};

/**
 * Display help information
 */
function showHelp() {
  console.log('\nBinance Trading Bot - Command Line Interface\n');
  console.log('Available commands:\n');
  
  Object.keys(commands).forEach(cmd => {
    console.log(`  ${cmd.padEnd(15)} - ${commands[cmd].description}`);
  });
  
  console.log('\nFor more information on a specific command, use:');
  console.log('  node app.js <command> --help');
  
  console.log('\nExamples:');
  console.log('  node app.js account-info');
  console.log('  node app.js exchange-info');
  console.log('  node app.js order --symbol BTCUSDT --orderId 123456789');
  console.log('  node app.js order-cancel --symbol BTCUSDT --orderId 123456789');  console.log('  node app.js order-monitor --symbol BTCUSDT --orderId 123456789');
}

/**
 * Display help for a specific command
 * @param {string} command - Command to show help for
 */
function showCommandHelp(command) {
  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    showHelp();
    return;
  }
  
  // Instead of showing our own help, execute the target script with --help
  const scriptName = commands[command].script;
  executeScript(scriptName, ['--help']);
}

/**
 * Execute a script with arguments
 * @param {string} scriptName - Name of the script to run
 * @param {Array<string>} args - Arguments to pass to the script
 */
function executeScript(scriptName, args) {
  const scriptPath = path.join(__dirname, scriptName);
  
  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }
  
  // Make the script executable (just in case)
  try {
    fs.chmodSync(scriptPath, '755');
  } catch (error) {
    // Ignore errors
  }
  
  // Spawn the script as a child process
  const child = spawn('node', [scriptPath, ...args], {
    stdio: 'inherit'
  });
  
  // Handle process exit
  child.on('exit', (code) => {
    process.exit(code);
  });
  
  // Handle errors
  child.on('error', (error) => {
    console.error(`Error executing script: ${error.message}`);
    process.exit(1);
  });
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Show help if no command or --help flag
  if (!command || command === '--help' || command === '-h') {
    showHelp();
    return;
  }
  
  // Check if command exists
  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    showHelp();
    return;
  }
  
  // Show command help if --help flag
  if (args[1] === '--help' || args[1] === '-h') {
    showCommandHelp(command);
    return;
  }
  
  // Execute the script
  const scriptArgs = args.slice(1);
  executeScript(commands[command].script, scriptArgs);
}

// Run the main function
main();
