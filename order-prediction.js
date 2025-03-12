#!/usr/bin/env node

/**
 * Order Prediction
 * 
 * This script analyzes an existing order and predicts when it might be filled
 * based on historical price volatility.
 * 
 * Usage:
 *   node order-prediction.js --symbol BTCUSDT --orderId 39277145512
 */

const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');
const { calculateOrderProfit, formatProfitInfo } = require('./profit-calculator');

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
    
    return parseFloat(response.data.price);
  } catch (error) {
    console.error('Error getting current price:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Get order information
 * @param {string} symbol - Trading pair symbol
 * @param {number} orderId - Order ID
 * @returns {Promise<Object>} - Order information
 */
async function getOrder(symbol, orderId) {
  try {
    const timestamp = Date.now();
    const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = signRequest(queryString);
    
    const url = `${config.baseUrl}/api/v3/order?${queryString}&signature=${signature}`;
    
    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': config.apiKey
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting order:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Get historical klines (candlestick data)
 * @param {string} symbol - Trading pair symbol
 * @param {string} interval - Kline interval (e.g., 1h, 4h, 1d)
 * @param {number} limit - Number of klines to fetch
 * @returns {Promise<Array>} - Kline data
 */
async function getKlines(symbol, interval = '1h', limit = 24) {
  try {
    const url = `${config.baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    
    const response = await axios.get(url);
    
    return response.data;
  } catch (error) {
    console.error('Error getting klines:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Calculate price volatility from kline data
 * @param {Array} klines - Kline data
 * @returns {Object} - Volatility information
 */
function calculateVolatility(klines) {
  // Extract high and low prices from klines
  const highLowDiffs = klines.map(kline => {
    const high = parseFloat(kline[2]);
    const low = parseFloat(kline[3]);
    const open = parseFloat(kline[1]);
    
    // Calculate percentage difference between high and low
    const diffPercentage = ((high - low) / open) * 100;
    
    return diffPercentage;
  });
  
  // Calculate average volatility
  const avgVolatility = highLowDiffs.reduce((sum, diff) => sum + diff, 0) / highLowDiffs.length;
  
  // Calculate max volatility
  const maxVolatility = Math.max(...highLowDiffs);
  
  // Calculate min volatility
  const minVolatility = Math.min(...highLowDiffs);
  
  return {
    average: avgVolatility,
    max: maxVolatility,
    min: minVolatility,
    data: highLowDiffs
  };
}

/**
 * Predict when an order might be filled
 * @param {Object} order - Order information
 * @param {number} currentPrice - Current price
 * @param {Object} volatility - Volatility information
 * @returns {Object} - Prediction information
 */
function predictOrderFill(order, currentPrice, volatility) {
  const orderPrice = parseFloat(order.price);
  const side = order.side;
  
  // For a sell order, we need the price to go up
  // For a buy order, we need the price to go down
  const priceDiffPercentage = side === 'SELL' 
    ? ((orderPrice - currentPrice) / currentPrice) * 100
    : ((currentPrice - orderPrice) / currentPrice) * 100;
  
  // If the price difference is negative, the order is already in the money
  if (priceDiffPercentage < 0) {
    return {
      status: 'ready',
      message: 'Order is already in the money and should be filled soon.',
      probability: 0.95
    };
  }
  
  // Calculate how many average volatility periods it would take to reach the target price
  const periodsAvg = priceDiffPercentage / volatility.average;
  
  // Calculate how many max volatility periods it would take to reach the target price
  const periodsMax = priceDiffPercentage / volatility.max;
  
  // Calculate probability based on price difference and volatility
  let probability;
  if (priceDiffPercentage <= volatility.min) {
    probability = 0.9; // Very likely within one period
  } else if (priceDiffPercentage <= volatility.average) {
    probability = 0.7; // Likely within one period
  } else if (priceDiffPercentage <= volatility.max) {
    probability = 0.5; // Possible within one period
  } else {
    probability = Math.min(0.9, 1 / periodsAvg); // Less likely, depends on how many periods
  }
  
  let timeEstimate;
  let status;
  
  if (periodsAvg <= 0.25) {
    timeEstimate = 'within a few minutes';
    status = 'imminent';
  } else if (periodsAvg <= 0.5) {
    timeEstimate = 'within an hour';
    status = 'very_soon';
  } else if (periodsAvg <= 1) {
    timeEstimate = 'within a few hours';
    status = 'soon';
  } else if (periodsAvg <= 3) {
    timeEstimate = 'within a day';
    status = 'medium';
  } else if (periodsAvg <= 7) {
    timeEstimate = 'within a few days';
    status = 'longer';
  } else {
    timeEstimate = 'may take a week or more';
    status = 'distant';
  }
  
  return {
    status,
    message: `Order fill prediction: ${timeEstimate}`,
    probability: probability.toFixed(2),
    periodsAvg: periodsAvg.toFixed(2),
    periodsMax: periodsMax.toFixed(2),
    priceDiffPercentage: priceDiffPercentage.toFixed(2)
  };
}

/**
 * Display order prediction
 * @param {Object} order - Order information
 * @param {number} currentPrice - Current price
 * @param {Object} prediction - Prediction information
 * @param {Object} volatility - Volatility information
 */
function displayPrediction(order, currentPrice, prediction, volatility) {
  console.log('\nOrder Prediction:');
  console.log('-'.repeat(50));
  console.log(`Symbol:       ${order.symbol}`);
  console.log(`Order ID:     ${order.orderId}`);
  console.log(`Type:         ${order.type}`);
  console.log(`Side:         ${order.side}`);
  console.log(`Price:        ${order.price}`);
  console.log(`Current Price: ${currentPrice}`);
  console.log(`Price Diff:   ${prediction.priceDiffPercentage}%`);
  console.log(`Status:       ${order.status}`);
  
  console.log('\nVolatility Analysis:');
  console.log(`Average:      ${volatility.average.toFixed(2)}% per period`);
  console.log(`Maximum:      ${volatility.max.toFixed(2)}% per period`);
  console.log(`Minimum:      ${volatility.min.toFixed(2)}% per period`);
  
  console.log('\nPrediction:');
  console.log(`Status:       ${prediction.status}`);
  console.log(`Message:      ${prediction.message}`);
  console.log(`Probability:  ${prediction.probability * 100}%`);
  console.log(`Avg Periods:  ${prediction.periodsAvg}`);
  console.log(`Max Periods:  ${prediction.periodsMax}`);
  
  // If we have a profit calculator, show profit info
  if (typeof calculateOrderProfit === 'function') {
    try {
      const profitInfo = calculateOrderProfit(order, currentPrice);
      console.log('\nExpected Profit:');
      console.log(`Gross Profit: ${profitInfo.grossProfit.toFixed(4)} USDT`);
      console.log(`Net Profit:   ${profitInfo.netProfit.toFixed(4)} USDT`);
      console.log(`Percentage:   ${profitInfo.profitPercentage.toFixed(2)}%`);
    } catch (error) {
      console.log('\nCould not calculate profit information.');
    }
  }
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nOrder Prediction\n');
      console.log('Description: Analyze an existing order and predict when it might be filled\n');
      console.log('Usage:');
      console.log('  node order-prediction.js --symbol BTCUSDT --orderId 39277145512\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (required)');
      console.log('  --orderId         Order ID (required)');
      console.log('  --interval        Kline interval for volatility calculation (default: 1h)');
      console.log('  --periods         Number of periods to analyze (default: 24)');
      return;
    }
    
    if (!args.symbol || !args.orderId) {
      console.error('Symbol and orderId are required.');
      console.log('Example: node order-prediction.js --symbol BTCUSDT --orderId 39277145512');
      process.exit(1);
    }
    
    // Get order information
    console.log(`Fetching order information for ${args.symbol}...`);
    const order = await getOrder(args.symbol, args.orderId);
    
    // Get current price
    console.log('Fetching current price...');
    const currentPrice = await getCurrentPrice(args.symbol);
    
    // Get historical klines for volatility calculation
    console.log('Fetching historical price data for volatility analysis...');
    const interval = args.interval || '1h';
    const periods = parseInt(args.periods) || 24;
    const klines = await getKlines(args.symbol, interval, periods);
    
    // Calculate volatility
    const volatility = calculateVolatility(klines);
    
    // Predict order fill
    const prediction = predictOrderFill(order, currentPrice, volatility);
    
    // Display prediction
    displayPrediction(order, currentPrice, prediction, volatility);
    
  } catch (error) {
    console.error('An error occurred:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
