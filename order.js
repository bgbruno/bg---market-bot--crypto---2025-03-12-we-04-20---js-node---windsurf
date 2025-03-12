#!/usr/bin/env node

/**
 * Binance Order Information Script
 * 
 * This script fetches information about a specific order from Binance
 * using the /api/v3/order endpoint.
 * 
 * Usage:
 *   node order.js --symbol BTCUSDT --orderId 123456789
 *   node order.js --symbol ETHUSDT --clientOrderId myOrder123
 */

const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
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
 * Get information about a specific order
 * @param {string} symbol - Trading pair symbol
 * @param {string} orderId - Order ID (optional if clientOrderId is provided)
 * @param {string} clientOrderId - Client order ID (optional if orderId is provided)
 * @returns {Promise<Object>} - Order information
 */
async function getOrder(symbol, orderId, clientOrderId) {
  try {
    if (!symbol) {
      throw new Error('Symbol is required');
    }
    
    if (!orderId && !clientOrderId) {
      throw new Error('Either orderId or clientOrderId is required');
    }
    
    const timestamp = Date.now();
    let queryString = `symbol=${symbol}&timestamp=${timestamp}`;
    
    if (orderId) {
      queryString += `&orderId=${orderId}`;
    }
    
    if (clientOrderId) {
      queryString += `&origClientOrderId=${clientOrderId}`;
    }
    
    const signature = signRequest(queryString);
    
    const url = `${config.baseUrl}/api/v3/order?${queryString}&signature=${signature}`;
    
    console.log(`Fetching order information for ${symbol}...`);
    console.log(`URL: ${url.replace(/signature=.+$/, 'signature=***')}`);
    
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
  console.log('\nOrder Information:');
  console.log('-'.repeat(50));
  console.log(`Symbol:       ${order.symbol}`);
  console.log(`Order ID:     ${order.orderId}`);
  console.log(`Client ID:    ${order.clientOrderId}`);
  console.log(`Type:         ${order.type}`);
  console.log(`Side:         ${order.side}`);
  console.log(`Price:        ${order.price}`);
  console.log(`Quantity:     ${order.origQty}`);
  console.log(`Executed:     ${order.executedQty}`);
  console.log(`Status:       ${order.status}`);
  console.log(`Time:         ${new Date(order.time).toLocaleString()}`);
  console.log(`Update Time:  ${new Date(order.updateTime).toLocaleString()}`);
  
  if (order.fills && order.fills.length > 0) {
    console.log('\nFill Information:');
    console.log('-'.repeat(50));
    order.fills.forEach((fill, index) => {
      console.log(`Fill #${index + 1}:`);
      console.log(`  Price:      ${fill.price}`);
      console.log(`  Quantity:   ${fill.qty}`);
      console.log(`  Commission: ${fill.commission} ${fill.commissionAsset}`);
      console.log(`  Trade ID:   ${fill.tradeId}`);
    });
  }
}

/**
 * Search for an order across all symbols
 * @param {string} orderId - Order ID to search for
 * @returns {Promise<Object|null>} - Order information or null if not found
 */
async function searchOrderAcrossSymbols(orderId) {
  try {
    // Import the getExchangeInfo function
    const { getExchangeInfo } = require('./binance_exchange_info');
    
    console.log(`Searching for order ID ${orderId} across all symbols...`);
    
    // Get all symbols
    const symbols = await getExchangeInfo();
    console.log(`Found ${symbols.length} symbols to search through`);
    
    // Try each symbol
    for (const symbol of symbols) {
      try {
        const order = await getOrder(symbol, orderId);
        console.log(`Found order for symbol ${symbol}!`);
        return order;
      } catch (error) {
        // Ignore errors, just continue to next symbol
        if (error.response && error.response.status === 404) {
          // Order not found for this symbol, continue
        } else if (error.response && error.response.data && error.response.data.code === -2013) {
          // Order does not exist, continue
        } else {
          console.error(`Error searching ${symbol}:`, error.message);
        }
      }
    }
    
    console.log('Order not found on any symbol');
    return null;
  } catch (error) {
    console.error('Error searching across symbols:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nBinance Order Information\n');
      console.log('Description: Get information about a specific order\n');
      console.log('Usage:');
      console.log('  node order.js --symbol BTCUSDT --orderId 123456789');
      console.log('  node order.js --symbol ETHUSDT --clientOrderId myOrder123');
      console.log('  node order.js --orderId 123456789 --save\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (required for direct lookup)');
      console.log('  --orderId         Order ID to look up (required if clientOrderId not provided)');
      console.log('  --clientOrderId   Client order ID to look up (required if orderId not provided)');
      console.log('  --save            Save order details to file');
      console.log('\nAlternatively, you can use the app.js interface:');
      console.log('  node app.js order --symbol BTCUSDT --orderId 123456789');
      return;
    }
    
    if (config.apiKey === 'YOUR_API_KEY' || config.apiSecret === 'YOUR_API_SECRET') {
      console.error('Please update the config.js file with your Binance API key and secret.');
      console.log('You can create API keys in your Binance account settings.');
      process.exit(1);
    }
    
    let order;
    
    // If only orderId is provided without symbol, search across all symbols
    if (args.orderId && !args.symbol) {
      console.log('No symbol provided. Searching across all symbols...');
      order = await searchOrderAcrossSymbols(args.orderId);
      
      if (!order) {
        console.error(`Order with ID ${args.orderId} not found on any symbol.`);
        process.exit(1);
      }
    } else {
      // Normal lookup with symbol and orderId/clientOrderId
      if (!args.symbol) {
        console.error('Symbol is required. Use --symbol BTCUSDT');
        console.log('Example: node order.js --symbol BTCUSDT --orderId 123456789');
        process.exit(1);
      }
      
      if (!args.orderId && !args.clientOrderId) {
        console.error('Either orderId or clientOrderId is required.');
        console.log('Example: node order.js --symbol BTCUSDT --orderId 123456789');
        console.log('Example: node order.js --symbol BTCUSDT --clientOrderId myOrder123');
        process.exit(1);
      }
      
      order = await getOrder(args.symbol, args.orderId, args.clientOrderId);
    }
    
    // Display order information
    displayOrder(order);
    
    // Save to file if requested
    if (args.save) {
      const filename = `order_${order.symbol}_${order.orderId}.json`;
      fs.writeFileSync(filename, JSON.stringify(order, null, 2));
      console.log(`\nOrder information saved to ${filename}`);
    }
    
  } catch (error) {
    // Error already logged in the respective functions
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
