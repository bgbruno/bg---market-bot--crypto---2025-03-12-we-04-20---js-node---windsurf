#!/usr/bin/env node

/**
 * Market Buy Script
 * 
 * This script allows buying any cryptocurrency using market orders.
 * You can specify the amount to spend in the quote currency (e.g., USDT).
 * 
 * Usage:
 *   node market-buy.js --symbol BTCUSDT --amount 10 --confirm
 *   node market-buy.js --symbol ETHUSDT --amount 50 --confirm
 *   node market-buy.js --symbol SOLUSDT --amount 25 --base SOL --quote USDT --confirm
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
 * Get current price for a symbol
 * @param {string} symbol - Trading pair symbol
 * @returns {Promise<number>} - Current price
 */
async function getCurrentPrice(symbol) {
  try {
    const url = `${config.baseUrl}/api/v3/ticker/price?symbol=${symbol}`;
    
    const response = await axios.get(url);
    
    if (response.data && response.data.price) {
      return parseFloat(response.data.price);
    } else {
      throw new Error('Could not get current price');
    }
  } catch (error) {
    console.error('Error getting current price:', error.message);
    throw error;
  }
}

/**
 * Get exchange information for a symbol
 * @param {string} symbol - Trading pair symbol
 * @returns {Promise<Object>} - Symbol information
 */
async function getSymbolInfo(symbol) {
  try {
    const url = `${config.baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`;
    
    const response = await axios.get(url);
    
    if (response.data && response.data.symbols && response.data.symbols.length > 0) {
      return response.data.symbols[0];
    } else {
      throw new Error(`Symbol ${symbol} not found`);
    }
  } catch (error) {
    console.error('Error getting symbol information:', error.message);
    throw error;
  }
}

/**
 * Create a market buy order
 * @param {Object} params - Order parameters
 * @returns {Promise<Object>} - Order information
 */
async function createMarketBuyOrder(params) {
  try {
    const timestamp = Date.now();
    const queryParams = new URLSearchParams({
      symbol: params.symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: params.quoteOrderQty,
      timestamp: timestamp
    }).toString();
    
    const signature = signRequest(queryParams);
    
    const url = `${config.baseUrl}/api/v3/order?${queryParams}&signature=${signature}`;
    
    const response = await axios.post(url, null, {
      headers: {
        'X-MBX-APIKEY': config.apiKey
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      console.error('API Error:', error.response.data);
    }
    throw new Error(`An error occurred: ${error.message}`);
  }
}

/**
 * Format and display order information
 * @param {Object} order - Order information
 */
function displayOrder(order) {
  console.log('\nOrder Information:');
  console.log('--------------------------------------------------');
  console.log(`Symbol:       ${order.symbol}`);
  console.log(`Order ID:     ${order.orderId}`);
  console.log(`Client ID:    ${order.clientOrderId}`);
  console.log(`Type:         ${order.type}`);
  console.log(`Side:         ${order.side}`);
  
  if (order.price) {
    console.log(`Price:        ${order.price}`);
  }
  
  console.log(`Quantity:     ${order.origQty}`);
  console.log(`Executed:     ${order.executedQty} (${(parseFloat(order.executedQty) / parseFloat(order.origQty) * 100).toFixed(2)}%)`);
  console.log(`Status:       ${order.status}`);
  
  if (order.fills && order.fills.length > 0) {
    console.log('\nFill Information:');
    console.log('--------------------------------------------------');
    
    let totalQty = 0;
    let totalQuoteQty = 0;
    let totalCommission = 0;
    
    order.fills.forEach((fill, index) => {
      console.log(`Fill #${index + 1}:`);
      console.log(`  Price:       ${fill.price}`);
      console.log(`  Quantity:    ${fill.qty}`);
      console.log(`  Commission:  ${fill.commission} ${fill.commissionAsset}`);
      
      totalQty += parseFloat(fill.qty);
      totalQuoteQty += parseFloat(fill.price) * parseFloat(fill.qty);
      totalCommission += parseFloat(fill.commission);
    });
    
    console.log('\nSummary:');
    console.log(`  Total Quantity:    ${totalQty}`);
    console.log(`  Average Price:     ${(totalQuoteQty / totalQty).toFixed(8)}`);
    console.log(`  Total Cost:        ${totalQuoteQty.toFixed(8)}`);
    console.log(`  Total Commission:  ${totalCommission.toFixed(8)}`);
  }
  
  console.log('\nTo monitor this order, use:');
  console.log(`node order-monitor.js --symbol ${order.symbol} --orderId ${order.orderId} --save`);
}

/**
 * Calculate the estimated quantity based on the amount and current price
 * @param {string} symbol - Trading pair symbol
 * @param {number} amount - Amount to spend in quote currency
 * @returns {Promise<Object>} - Estimated quantity and price
 */
async function calculateEstimate(symbol, amount) {
  try {
    const currentPrice = await getCurrentPrice(symbol);
    const estimatedQuantity = amount / currentPrice;
    
    return {
      price: currentPrice,
      quantity: estimatedQuantity,
      total: amount
    };
  } catch (error) {
    console.error('Error calculating estimate:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nMarket Buy Script\n');
      console.log('Description: Buy any cryptocurrency using market orders\n');
      console.log('Usage:');
      console.log('  node market-buy.js --symbol BTCUSDT --amount 10 --confirm');
      console.log('  node market-buy.js --symbol ETHUSDT --amount 50 --confirm');
      console.log('  node market-buy.js --symbol SOLUSDT --amount 25 --base SOL --quote USDT --confirm\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (e.g., BTCUSDT)');
      console.log('  --amount          Amount to spend in quote currency (e.g., 10 USDT)');
      console.log('  --base            Base currency (optional, for display only)');
      console.log('  --quote           Quote currency (optional, for display only)');
      console.log('  --confirm         Add this flag to execute the order (otherwise just preview)');
      return;
    }
    
    // Check required parameters
    if (!args.symbol) {
      throw new Error('Symbol is required (--symbol BTCUSDT)');
    }
    
    if (!args.amount) {
      throw new Error('Amount is required (--amount 10)');
    }
    
    const symbol = args.symbol;
    const amount = parseFloat(args.amount);
    
    // Extract base and quote currencies from symbol or use provided values
    const symbolInfo = await getSymbolInfo(symbol);
    const baseCurrency = args.base || symbolInfo.baseAsset;
    const quoteCurrency = args.quote || symbolInfo.quoteAsset;
    
    // Calculate estimate
    const estimate = await calculateEstimate(symbol, amount);
    
    console.log(`\nBuying ${baseCurrency} with ${quoteCurrency}`);
    console.log('--------------------------------------------------');
    console.log(`Symbol:           ${symbol}`);
    console.log(`Current Price:    ${estimate.price} ${quoteCurrency}`);
    console.log(`Amount to Spend:  ${amount} ${quoteCurrency}`);
    console.log(`Estimated Qty:    ${estimate.quantity.toFixed(8)} ${baseCurrency}`);
    
    // Confirm the purchase
    if (!args.confirm) {
      console.log('\nTo execute this order, add --confirm to your command');
      return;
    }
    
    console.log('\nExecuting market buy order...');
    
    // Create market buy order
    const orderParams = {
      symbol: symbol,
      quoteOrderQty: amount.toString()
    };
    
    const order = await createMarketBuyOrder(orderParams);
    
    // Display order information
    displayOrder(order);
    
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
