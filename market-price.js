#!/usr/bin/env node

/**
 * Market Price
 * 
 * This script fetches the current market price for a specified trading pair.
 * 
 * Usage:
 *   node market-price.js --symbol BTCUSDT
 */

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

// Get current price for a symbol
async function getCurrentPrice(symbol) {
  try {
    const url = `${config.baseUrl}/api/v3/ticker/price?symbol=${symbol}`;
    const response = await axios.get(url);
    return response.data.price;
  } catch (error) {
    console.error('Error fetching price:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nMarket Price\n');
      console.log('Description: Get the current market price for a trading pair\n');
      console.log('Usage:');
      console.log('  node market-price.js --symbol BTCUSDT\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (required)');
      return;
    }
    
    // Check if symbol is provided
    if (!args.symbol) {
      console.error('Error: Symbol is required. Use --symbol BTCUSDT');
      process.exit(1);
    }
    
    // Get current price
    const price = await getCurrentPrice(args.symbol);
    
    // Display the price
    console.log(`\nCurrent price for ${args.symbol}:`);
    console.log(`Current price: ${price}`);
    
  } catch (error) {
    console.error('An error occurred:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
