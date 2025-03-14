#!/usr/bin/env node

/**
 * Order Simulation
 * 
 * This script simulates an order and provides information about potential execution
 * based on current market conditions.
 * 
 * Usage:
 *   node order-simulation.js --symbol BTCUSDT --side SELL --price 20004.55 --quantity 0.00021
 */

const axios = require('axios');
const crypto = require('crypto');
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
    console.error('Error fetching current price:', error.message);
    throw error;
  }
}

/**
 * Get market depth for a symbol
 * @param {string} symbol - Trading pair symbol
 * @param {number} limit - Depth limit
 * @returns {Promise<Object>} - Market depth
 */
async function getOrderBook(symbol, limit = 20) {
  try {
    const url = `${config.baseUrl}/api/v3/depth?symbol=${symbol}&limit=${limit}`;
    
    const response = await axios.get(url);
    
    return response.data;
  } catch (error) {
    console.error('Error fetching order book:', error.message);
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
    console.error('Error fetching klines:', error.message);
    throw error;
  }
}

/**
 * Calculate price volatility from kline data
 * @param {Array} klines - Kline data
 * @returns {Object} - Volatility information
 */
function calculateVolatility(klines) {
  // Extract high and low prices
  const highPrices = klines.map(kline => parseFloat(kline[2]));
  const lowPrices = klines.map(kline => parseFloat(kline[3]));
  const closePrices = klines.map(kline => parseFloat(kline[4]));
  
  // Calculate average price
  const avgPrice = closePrices.reduce((sum, price) => sum + price, 0) / closePrices.length;
  
  // Calculate average range (high - low)
  const ranges = highPrices.map((high, i) => high - lowPrices[i]);
  const avgRange = ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
  
  // Calculate standard deviation of close prices
  const squaredDiffs = closePrices.map(price => Math.pow(price - avgPrice, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length;
  const stdDev = Math.sqrt(avgSquaredDiff);
  
  // Calculate percentage volatility
  const percentageVolatility = (stdDev / avgPrice) * 100;
  
  // Calculate average percentage range
  const percentageRange = (avgRange / avgPrice) * 100;
  
  return {
    avgPrice,
    avgRange,
    stdDev,
    percentageVolatility,
    percentageRange
  };
}

/**
 * Simulate order execution
 * @param {string} symbol - Trading pair symbol
 * @param {string} side - Order side (BUY or SELL)
 * @param {number} price - Order price
 * @param {number} quantity - Order quantity
 * @param {Object} orderBook - Order book data
 * @param {Object} volatility - Volatility information
 * @returns {Object} - Simulation results
 */
function simulateOrder(symbol, side, price, quantity, orderBook, volatility) {
  const currentMarket = side === 'BUY' ? orderBook.asks : orderBook.bids;
  const priceDirection = side === 'BUY' ? 1 : -1;
  const targetPrice = parseFloat(price);
  
  // Check if the order would be filled immediately
  const bestPrice = parseFloat(currentMarket[0][0]);
  const immediateExecution = side === 'BUY' ? targetPrice >= bestPrice : targetPrice <= bestPrice;
  
  // Calculate price distance from current best price
  const priceDistance = Math.abs(targetPrice - bestPrice);
  const priceDistancePercent = (priceDistance / bestPrice) * 100;
  
  // Estimate time to fill based on volatility
  let estimatedTimeToFill = null;
  let probabilityOfFill = null;
  
  if (immediateExecution) {
    estimatedTimeToFill = 'Immediate';
    probabilityOfFill = 100;
  } else {
    // Use volatility to estimate
    const hourlyMovement = volatility.percentageRange / 24; // Approximate hourly movement
    const hoursToFill = priceDistancePercent / hourlyMovement;
    
    if (hoursToFill < 24) {
      estimatedTimeToFill = `~${Math.round(hoursToFill * 10) / 10} hours`;
      probabilityOfFill = Math.min(95, 100 - (hoursToFill * 4)); // Rough estimate
    } else if (hoursToFill < 168) { // 7 days
      estimatedTimeToFill = `~${Math.round(hoursToFill / 24)} days`;
      probabilityOfFill = Math.max(5, 100 - (hoursToFill * 0.5)); // Rough estimate
    } else {
      estimatedTimeToFill = 'Unlikely within a week';
      probabilityOfFill = Math.max(1, 100 - (hoursToFill * 0.3)); // Rough estimate
    }
  }
  
  return {
    symbol,
    side,
    price: targetPrice,
    quantity,
    bestMarketPrice: bestPrice,
    priceDistance,
    priceDistancePercent,
    immediateExecution,
    estimatedTimeToFill,
    probabilityOfFill: Math.round(probabilityOfFill)
  };
}

/**
 * Display order simulation
 * @param {Object} simulation - Simulation results
 * @param {Object} volatility - Volatility information
 */
function displaySimulation(simulation, volatility) {
  console.log('\n=== Order Simulation ===');
  console.log(`Symbol: ${simulation.symbol}`);
  console.log(`Side: ${simulation.side}`);
  console.log(`Price: ${simulation.price.toFixed(8)} ${simulation.symbol.slice(3)}`);
  console.log(`Quantity: ${simulation.quantity} ${simulation.symbol.slice(0, 3)}`);
  console.log(`Total Value: ${(simulation.price * simulation.quantity).toFixed(8)} ${simulation.symbol.slice(3)}`);
  
  console.log('\n=== Market Conditions ===');
  console.log(`Best ${simulation.side === 'BUY' ? 'Ask' : 'Bid'}: ${simulation.bestMarketPrice}`);
  console.log(`Price Distance: ${simulation.priceDistance.toFixed(8)} (${simulation.priceDistancePercent.toFixed(2)}%)`);
  console.log(`24h Volatility: ${volatility.percentageVolatility.toFixed(2)}%`);
  console.log(`Average Range: ${volatility.percentageRange.toFixed(2)}%`);
  
  console.log('\n=== Execution Prediction ===');
  console.log(`Immediate Execution: ${simulation.immediateExecution ? 'Yes' : 'No'}`);
  console.log(`Estimated Time to Fill: ${simulation.estimatedTimeToFill}`);
  console.log(`Probability of Fill: ${simulation.probabilityOfFill}%`);
  
  // Add recommendations
  console.log('\n=== Recommendations ===');
  if (simulation.immediateExecution) {
    console.log('✓ This order is likely to be filled immediately at current market conditions.');
  } else if (simulation.probabilityOfFill > 70) {
    console.log('✓ This order has a good chance of being filled within the estimated time.');
  } else if (simulation.probabilityOfFill > 30) {
    console.log('⚠ This order may take longer than expected to fill. Consider adjusting your price.');
  } else {
    console.log('⚠ This order has a low probability of being filled within a reasonable timeframe.');
    console.log(`  Consider adjusting your price closer to the current market (${simulation.bestMarketPrice}).`);
  }
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nOrder Simulation\n');
      console.log('Description: Simulate an order and provide information about potential execution\n');
      console.log('Usage:');
      console.log('  node order-simulation.js --symbol BTCUSDT --side SELL --price 20004.55 --quantity 0.00021\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (required)');
      console.log('  --side            Order side: BUY or SELL (required)');
      console.log('  --price           Order price (required)');
      console.log('  --quantity        Order quantity (required)');
      console.log('  --interval        Kline interval for volatility calculation (default: 1h)');
      console.log('  --periods         Number of periods to analyze (default: 24)');
      return;
    }
    
    if (!args.symbol || !args.side || !args.price || !args.quantity) {
      console.error('Symbol, side, price, and quantity are required.');
      console.log('Example: node order-simulation.js --symbol BTCUSDT --side SELL --price 20004.55 --quantity 0.00021');
      process.exit(1);
    }
    
    // Validate side
    const side = args.side.toUpperCase();
    if (side !== 'BUY' && side !== 'SELL') {
      console.error('Side must be either BUY or SELL');
      process.exit(1);
    }
    
    // Get current price
    const currentPrice = await getCurrentPrice(args.symbol);
    
    // Get order book
    const orderBook = await getOrderBook(args.symbol);
    
    // Get historical klines for volatility calculation
    const interval = args.interval || '1h';
    const periods = parseInt(args.periods) || 24;
    const klines = await getKlines(args.symbol, interval, periods);
    
    // Calculate volatility
    const volatility = calculateVolatility(klines);
    
    // Simulate order
    const simulation = simulateOrder(
      args.symbol,
      side,
      parseFloat(args.price),
      parseFloat(args.quantity),
      orderBook,
      volatility
    );
    
    // Display simulation
    displaySimulation(simulation, volatility);
    
  } catch (error) {
    console.error('An error occurred:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});
