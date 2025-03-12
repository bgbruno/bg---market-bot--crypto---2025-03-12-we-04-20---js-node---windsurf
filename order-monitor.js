#!/usr/bin/env node

/**
 * Binance Order Monitor
 * 
 * This script monitors the status of a specific order using Binance WebSocket API
 * and notifies when the order is filled.
 * 
 * Usage:
 *   node order-monitor.js --orderId 123456789 --symbol BTCUSDT
 *   node order-monitor.js --clientOrderId myOrder123 --symbol BTCUSDT
 */

const crypto = require('crypto');
const axios = require('axios');
const WebSocket = require('ws');
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
 * Get a listen key for user data stream
 * @returns {Promise<string>} - Listen key
 */
async function getListenKey() {
  try {
    const url = `${config.baseUrl}/api/v3/userDataStream`;
    
    const response = await axios.post(url, null, {
      headers: {
        'X-MBX-APIKEY': config.apiKey
      }
    });
    
    return response.data.listenKey;
  } catch (error) {
    console.error('Error getting listen key:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Keep the listen key alive by sending a ping
 * @param {string} listenKey - Listen key to keep alive
 */
async function keepAliveListenKey(listenKey) {
  try {
    const url = `${config.baseUrl}/api/v3/userDataStream`;
    
    await axios.put(`${url}?listenKey=${listenKey}`, null, {
      headers: {
        'X-MBX-APIKEY': config.apiKey
      }
    });
    
    console.log('Listen key kept alive');
  } catch (error) {
    console.error('Error keeping listen key alive:', error.response ? error.response.data : error.message);
  }
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
  console.log(`Executed:     ${order.executedQty} (${(parseFloat(order.executedQty) / parseFloat(order.origQty) * 100).toFixed(2)}%)`);
  console.log(`Status:       ${order.status}`);
  console.log(`Time:         ${new Date(order.time).toLocaleString()}`);
  console.log(`Update Time:  ${new Date(order.updateTime).toLocaleString()}`);
}

/**
 * Monitor order status using WebSocket
 * @param {string} symbol - Trading pair symbol
 * @param {string} orderId - Order ID
 * @param {string} clientOrderId - Client order ID
 */
async function monitorOrderStatus(symbol, orderId, clientOrderId) {
  try {
    // First, get current order information
    const order = await getOrder(symbol, orderId, clientOrderId);
    displayOrder(order);
    
    // If order is already filled, no need to monitor
    if (order.status === 'FILLED') {
      console.log('\nOrder is already filled. No need to monitor.');
      return;
    }
    
    // Get a listen key for user data stream
    console.log('\nGetting listen key for WebSocket connection...');
    const listenKey = await getListenKey();
    console.log(`Listen key obtained: ${listenKey.substring(0, 10)}...`);
    
    // Setup keep-alive interval (every 30 minutes)
    const keepAliveInterval = setInterval(() => {
      keepAliveListenKey(listenKey).catch(err => {
        console.error('Failed to keep listen key alive:', err.message);
        clearInterval(keepAliveInterval);
      });
    }, 30 * 60 * 1000); // 30 minutes
    
    // Connect to WebSocket
    console.log('\nConnecting to Binance WebSocket...');
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${listenKey}`);
    
    // Track order updates
    let lastStatus = order.status;
    let lastExecutedQty = parseFloat(order.executedQty);
    
    ws.on('open', () => {
      console.log('WebSocket connection established');
      console.log(`\nMonitoring order ${orderId || clientOrderId} for symbol ${symbol}...`);
      console.log('Waiting for updates... (Press Ctrl+C to exit)');
    });
    
    ws.on('message', (data) => {
      const event = JSON.parse(data);
      
      // Check if this is an execution report for our order
      if (event.e === 'executionReport' && 
          (event.i === parseInt(orderId) || event.c === clientOrderId) && 
          event.s === symbol) {
        
        const currentStatus = event.X; // Current execution type
        const currentExecutedQty = parseFloat(event.z); // Cumulative filled quantity
        
        // Only log if there's a change in status or executed quantity
        if (currentStatus !== lastStatus || currentExecutedQty !== lastExecutedQty) {
          console.log(`\n[${new Date().toLocaleString()}] Order update:`);
          console.log(`Status: ${currentStatus}`);
          console.log(`Executed: ${currentExecutedQty}/${parseFloat(event.q)} (${(currentExecutedQty / parseFloat(event.q) * 100).toFixed(2)}%)`);
          
          if (currentExecutedQty > lastExecutedQty) {
            console.log(`New fill: ${(currentExecutedQty - lastExecutedQty).toFixed(8)} at price ${event.L}`);
          }
          
          lastStatus = currentStatus;
          lastExecutedQty = currentExecutedQty;
          
          // If order is filled, close the connection
          if (currentStatus === 'FILLED') {
            console.log('\n🎉 Order has been completely filled! 🎉');
            console.log(`Time: ${new Date(event.T).toLocaleString()}`);
            
            // Save order details to file if requested
            if (parseArgs().save) {
              const saveArg = parseArgs().save;
              // Get the save path - either the path provided or default to './orders'
              let savePath = './orders';
              if (typeof saveArg === 'string') {
                savePath = saveArg;
              }
              
              // Create directory if it doesn't exist
              if (!fs.existsSync(savePath)) {
                fs.mkdirSync(savePath, { recursive: true });
                console.log(`Created directory: ${savePath}`);
              }
              
              const filename = `${savePath}/${symbol}-${event.i}.json`;
              fs.writeFileSync(filename, JSON.stringify(event, null, 2));
              console.log(`\nOrder details saved to: ${filename}`);
            }
            
            // Close WebSocket and clear interval
            ws.close();
            clearInterval(keepAliveInterval);
          }
        }
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
      console.log('WebSocket connection closed');
      clearInterval(keepAliveInterval);
    });
    
  } catch (error) {
    console.error('Error monitoring order:', error.message);
  }
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nBinance Order Monitor\n');
      console.log('Description: Monitor an order until it\'s filled\n');
      console.log('Usage:');
      console.log('  node order-monitor.js --symbol BTCUSDT --orderId 123456789');
      console.log('  node order-monitor.js --symbol ETHUSDT --clientOrderId myOrder123 --save\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (required)');
      console.log('  --orderId         Order ID to monitor (required if clientOrderId not provided)');
      console.log('  --clientOrderId   Client order ID to monitor (required if orderId not provided)');
      console.log('  --save            Save order details to file when filled. Can specify path: --save "./data/orders"');
      console.log('\nAlternatively, you can use the app.js interface:');
      console.log('  node app.js order-monitor --symbol BTCUSDT --orderId 123456789');
      return;
    }
    
    if (config.apiKey === 'YOUR_API_KEY' || config.apiSecret === 'YOUR_API_SECRET') {
      console.error('Please update the config.js file with your Binance API key and secret.');
      console.log('You can create API keys in your Binance account settings.');
      process.exit(1);
    }
    
    if (!args.symbol) {
      console.error('Symbol is required. Use --symbol BTCUSDT');
      console.log('Example: node order-monitor.js --symbol BTCUSDT --orderId 123456789');
      process.exit(1);
    }
    
    if (!args.orderId && !args.clientOrderId) {
      console.error('Either orderId or clientOrderId is required.');
      console.log('Example: node order-monitor.js --symbol BTCUSDT --orderId 123456789');
      console.log('Example: node order-monitor.js --symbol BTCUSDT --clientOrderId myOrder123');
      process.exit(1);
    }
    
    await monitorOrderStatus(args.symbol, args.orderId, args.clientOrderId);
    
  } catch (error) {
    console.error('An error occurred:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
