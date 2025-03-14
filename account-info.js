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
 * Get current prices for all trading pairs
 * @returns {Promise<Object>} - Object with symbol as key and price as value
 */
async function getAllPrices() {
  try {
    const response = await axios.get(`${config.baseUrl}/api/v3/ticker/price`);
    const prices = {};
    
    response.data.forEach(item => {
      prices[item.symbol] = parseFloat(item.price);
    });
    
    return prices;
  } catch (error) {
    console.error('Error fetching prices:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Display account balances in a formatted table and calculate total in EUR
 * @param {Object} account - Account information
 */
async function displayBalances(account) {
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
  
  // Calculate total value in EUR
  try {
    const prices = await getAllPrices();
    let totalEUR = 0;
    
    for (const balance of balances) {
      const asset = balance.asset;
      const totalBalance = parseFloat(balance.free) + parseFloat(balance.locked);
      
      if (totalBalance <= 0) continue;
      
      // If the asset is EUR, add directly
      if (asset === 'EUR') {
        totalEUR += totalBalance;
        continue;
      }
      
      // Try to find direct pair with EUR
      const directEURPair = `${asset}EUR`;
      if (prices[directEURPair]) {
        totalEUR += totalBalance * prices[directEURPair];
        continue;
      }
      
      // Try to convert via USDT
      const usdtPair = `${asset}USDT`;
      const eurUsdtPair = 'EURUSDT';
      
      if (prices[usdtPair] && prices[eurUsdtPair]) {
        // Convert to USDT first, then to EUR
        const valueInUSDT = totalBalance * prices[usdtPair];
        totalEUR += valueInUSDT / prices[eurUsdtPair];
        continue;
      }
      
      // Try to convert via BTC
      const btcPair = `${asset}BTC`;
      const eurBtcPair = 'BTCEUR';
      
      if (prices[btcPair] && prices[eurBtcPair]) {
        // Convert to BTC first, then to EUR
        const valueInBTC = totalBalance * prices[btcPair];
        totalEUR += valueInBTC * prices[eurBtcPair];
        continue;
      }
      
      // If asset is BTC, convert directly using BTCEUR
      if (asset === 'BTC' && prices['BTCEUR']) {
        totalEUR += totalBalance * prices['BTCEUR'];
        continue;
      }
      
      // If asset is USDT, convert using EURUSDT (inverted)
      if (asset === 'USDT' && prices['EURUSDT']) {
        totalEUR += totalBalance / prices['EURUSDT'];
        continue;
      }
      
      console.log(`Could not convert ${asset} to EUR - no conversion path found`);
    }
    
    console.log(`\n${'='.repeat(44)}`);
    console.log(`Total Balance: ${totalEUR.toFixed(2)} EUR`);
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`Timestamp: ${timestamp}`);
    console.log(`${'='.repeat(44)}`);
  } catch (error) {
    console.error('Error calculating total in EUR:', error.message);
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
        await displayBalances(account);
        
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
