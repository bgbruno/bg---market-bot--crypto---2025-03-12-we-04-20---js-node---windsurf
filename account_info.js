#!/usr/bin/env node

/**
 * Binance Account Information Module
 * 
 * This module provides functionality to fetch Binance account information
 * such as balances and account status.
 */

const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');

/**
 * Function to sign the request parameters
 * @param {string} queryString - Query string to sign
 * @returns {string} - Signature
 */
function signRequest(queryString) {
  return crypto
    .createHmac('sha256', config.apiSecret)
    .update(queryString)
    .digest('hex');
}

/**
 * Get account information including balances
 * @returns {Promise<Object>} - Account information
 */
async function getAccountInfo() {
  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    const signature = signRequest(queryString);
    
    const url = `${config.baseUrl}/api/v3/account?${queryString}&signature=${signature}`;
    
    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': config.apiKey
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching account info:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Display account balances in a formatted table
 * @param {Object} account - Account information
 */
function displayBalances(account) {
  const balances = account.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
  
  console.log(`\nAccount Balances:`);
  console.log(`${'Asset'.padEnd(10)} | ${'Free'.padEnd(15)} | ${'Locked'.padEnd(15)}`);
  console.log(`${'-'.repeat(10)} | ${'-'.repeat(15)} | ${'-'.repeat(15)}`);
  
  for (const balance of balances) {
    console.log(
      `${balance.asset.padEnd(10)} | ` +
      `${parseFloat(balance.free).toFixed(8).padEnd(15)} | ` +
      `${parseFloat(balance.locked).toFixed(8).padEnd(15)}`
    );
  }
}

// If this file is run directly (not imported as a module)
if (require.main === module) {
  // Run the main function
  (async () => {
    try {
      const args = process.argv.slice(2);
      
      // Show help if --help flag is provided
      if (args.includes('--help') || args.includes('-h')) {
        console.log('\nBinance Account Information\n');
        console.log('Description: Get account information and balances\n');
        console.log('Usage:');
        console.log('  node account_info.js');
        console.log('  node account_info.js --min-balance 10\n');
        console.log('Parameters:');
        console.log('  --min-balance     Minimum balance to display (default: 0)');
        console.log('\nAlternatively, you can use the app.js interface:');
        console.log('  node app.js account-info');
        return;
      }
      
      console.log('Fetching Binance account information...');
      
      if (config.apiKey === 'YOUR_API_KEY' || config.apiSecret === 'YOUR_API_SECRET') {
        console.error('Please update the config.js file with your Binance API key and secret.');
        console.log('You can create API keys in your Binance account settings.');
        process.exit(1);
      }
      
      try {
        const account = await getAccountInfo();
        
        // Display account information
        console.log('\n=== Account Information ===');
        console.log(`Account Type: ${account.accountType}`);
        console.log(`Can Trade: ${account.canTrade}`);
        console.log(`Can Withdraw: ${account.canWithdraw}`);
        console.log(`Can Deposit: ${account.canDeposit}`);
        
        // Display balances
        displayBalances(account);
        
        // Save to file if requested
        if (process.argv.includes('--save')) {
          const fs = require('fs');
          const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
          const filename = `binance_account_${timestamp}.json`;
          fs.writeFileSync(filename, JSON.stringify(account, null, 2));
          console.log(`\nAccount information saved to ${filename}`);
        }
        
      } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { getAccountInfo, displayBalances };
