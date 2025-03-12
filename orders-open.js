#!/usr/bin/env node

/**
 * Binance Open Orders Script
 * 
 * This script fetches all open orders from Binance.
 * 
 * Usage:
 *   node orders-open.js
 *   node orders-open.js --symbol BTCUSDT
 */

const crypto = require('crypto');
const axios = require('axios');
const config = require('./config');

// Parse command line arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg, i, argv) => {
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = value;
    }
  });
  return args;
}

// Function to sign the request parameters
function signRequest(queryString) {
  return crypto
    .createHmac('sha256', config.apiSecret)
    .update(queryString)
    .digest('hex');
}

/**
 * Get all open orders
 * @param {string} symbol - Trading pair symbol (optional)
 * @returns {Promise<Array>} - List of open orders
 */
async function getOpenOrders(symbol) {
  try {
    const timestamp = Date.now();
    let queryString = `timestamp=${timestamp}`;
    
    if (symbol) {
      queryString += `&symbol=${symbol}`;
    }
    
    const signature = signRequest(queryString);
    
    const url = `${config.baseUrl}/api/v3/openOrders?${queryString}&signature=${signature}`;
    
    console.log(`Fetching open orders${symbol ? ` for ${symbol}` : ''}...`);
    
    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': config.apiKey
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      console.error('API Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

/**
 * Format and display order information
 * @param {Object} order - Order information
 */
function displayOrder(order) {
  console.log('-'.repeat(50));
  console.log(`Symbol:       ${order.symbol}`);
  console.log(`Order ID:     ${order.orderId}`);
  console.log(`Client ID:    ${order.clientOrderId}`);
  console.log(`Type:         ${order.type}`);
  console.log(`Side:         ${order.side}`);
  console.log(`Price:        ${order.price}`);
  console.log(`Quantity:     ${order.origQty}`);
  
  if (order.executedQty) {
    console.log(`Executed:     ${order.executedQty} (${(parseFloat(order.executedQty) / parseFloat(order.origQty) * 100).toFixed(2)}%)`);
  }
  
  console.log(`Status:       ${order.status}`);
  
  if (order.time) {
    console.log(`Time:         ${new Date(order.time).toLocaleString()}`);
  }
  
  if (order.updateTime) {
    console.log(`Update Time:  ${new Date(order.updateTime).toLocaleString()}`);
  }
}

/**
 * Display help information
 */
function displayHelp() {
  console.log('\nBinance Open Orders Script\n');
  console.log('Description: Fetch and display all open orders from Binance\n');
  console.log('Usage:');
  console.log('  node orders-open.js');
  console.log('  node orders-open.js --symbol BTCUSDT\n');
  console.log('Parameters:');
  console.log('  --symbol    Trading pair symbol (optional)');
  console.log('  --help      Display this help information\n');
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      displayHelp();
      return;
    }
    
    const symbol = args.symbol;
    
    // Get open orders
    const orders = await getOpenOrders(symbol);
    
    if (orders.length === 0) {
      console.log('\nNo open orders found.');
      return;
    }
    
    console.log(`\nFound ${orders.length} open order${orders.length > 1 ? 's' : ''}:`);
    
    // Display each order
    orders.forEach(order => {
      displayOrder(order);
    });
    
    console.log('\nTo get more details about a specific order, use:');
    console.log('node order.js --symbol <SYMBOL> --orderId <ORDER_ID>');
    
  } catch (error) {
    console.error('An error occurred:', error.message);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
