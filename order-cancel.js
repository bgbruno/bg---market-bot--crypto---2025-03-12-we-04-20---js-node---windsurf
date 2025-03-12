#!/usr/bin/env node

/**
 * Binance Order Cancel
 * 
 * This script allows canceling existing orders.
 * 
 * Usage:
 *   node order-cancel.js --symbol BTCUSDT --orderId 123456789
 *   node order-cancel.js --symbol ETHUSDT --clientOrderId myOrder123
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
 * Cancel an order
 * @param {string} symbol - Trading pair symbol
 * @param {string} orderId - Order ID (optional if clientOrderId is provided)
 * @param {string} clientOrderId - Client order ID (optional if orderId is provided)
 * @returns {Promise<Object>} - Cancellation response
 */
async function cancelOrder(symbol, orderId, clientOrderId) {
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
    
    console.log(`Canceling order for ${symbol}...`);
    
    const url = `${config.baseUrl}/api/v3/order`;
    
    const response = await axios.delete(`${url}?${queryString}&signature=${signature}`, {
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
function displayCanceledOrder(order) {
  console.log('\nOrder Canceled:');
  console.log('-'.repeat(50));
  console.log(`Symbol:       ${order.symbol}`);
  console.log(`Order ID:     ${order.orderId}`);
  console.log(`Client ID:    ${order.clientOrderId}`);
  console.log(`Type:         ${order.type}`);
  console.log(`Side:         ${order.side}`);
  console.log(`Price:        ${order.price}`);
  console.log(`Quantity:     ${order.origQty}`);
  console.log(`Executed:     ${order.executedQty} (${(parseFloat(order.executedQty) / parseFloat(order.origQty) * 100).toFixed(2)}%)`);
  console.log(`Status:       ${order.status}`);
  
  if (order.time) {
    console.log(`Time:         ${new Date(order.time).toLocaleString()}`);
  }
  
  if (order.updateTime) {
    console.log(`Update Time:  ${new Date(order.updateTime).toLocaleString()}`);
  }
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nBinance Order Cancel\n');
      console.log('Description: Cancel an existing order\n');
      console.log('Usage:');
      console.log('  node order-cancel.js --symbol BTCUSDT --orderId 123456789');
      console.log('  node order-cancel.js --symbol ETHUSDT --clientOrderId myOrder123\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (required)');
      console.log('  --orderId         Order ID to cancel (required if clientOrderId not provided)');
      console.log('  --clientOrderId   Client order ID to cancel (required if orderId not provided)');
      console.log('\nAlternatively, you can use the app.js interface:');
      console.log('  node app.js order-cancel --symbol BTCUSDT --orderId 123456789');
      return;
    }
    
    if (config.apiKey === 'YOUR_API_KEY' || config.apiSecret === 'YOUR_API_SECRET') {
      console.error('Please update the config.js file with your Binance API key and secret.');
      console.log('You can create API keys in your Binance account settings.');
      process.exit(1);
    }
    
    if (!args.symbol) {
      console.error('Symbol is required. Use --symbol BTCUSDT');
      console.log('Example: node order-cancel.js --symbol BTCUSDT --orderId 123456789');
      process.exit(1);
    }
    
    if (!args.orderId && !args.clientOrderId) {
      console.error('Either orderId or clientOrderId is required.');
      console.log('Example: node order-cancel.js --symbol BTCUSDT --orderId 123456789');
      console.log('Example: node order-cancel.js --symbol BTCUSDT --clientOrderId myOrder123');
      process.exit(1);
    }
    
    // Cancel the order
    const canceledOrder = await cancelOrder(args.symbol, args.orderId, args.clientOrderId);
    
    // Display canceled order information
    displayCanceledOrder(canceledOrder);
    
    console.log('\nOrder has been successfully canceled.');
    
  } catch (error) {
    console.error('An error occurred:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
