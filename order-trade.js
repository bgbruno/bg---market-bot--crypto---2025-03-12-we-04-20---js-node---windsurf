#!/usr/bin/env node

/**
 * Binance Order Trade
 * 
 * This script allows creating and managing trading orders.
 * 
 * Usage:
 *   node order-trade.js --symbol BTCUSDT --side BUY --quantity 0.001 --price 50000
 *   node order-trade.js --symbol BTCUSDT --side SELL --quantity 0.001 --market
 *   node order-trade.js --symbol BTCUSDT --side BUY --quoteOrderQty 50 --market
 *   node order-trade.js --symbol BTCUSDT --side SELL --quantity 0.001 --takeProfitPercentage 5
 *   node order-trade.js --symbol BTCUSDT --side SELL --quantity 0.001 --takeProfitExplicit 50 --takeProfitSymbol USDT
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
    
    return parseFloat(response.data.price);
  } catch (error) {
    console.error('Error getting current price:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * Create a new order
 * @param {Object} params - Order parameters
 * @returns {Promise<Object>} - Order information
 */
async function createOrder(params) {
  try {
    const { symbol, side, type, quantity, price, quoteOrderQty, stopPrice, stopLimitPrice } = params;
    
    if (!symbol || !side) {
      throw new Error('Symbol and side are required');
    }
    
    const timestamp = Date.now();
    let queryString = `symbol=${symbol}&side=${side}&timestamp=${timestamp}`;
    
    // Set order type
    let orderType = type;
    if (!orderType) {
      if (stopPrice && price) {
        orderType = 'STOP_LOSS_LIMIT';
      } else if (stopPrice) {
        orderType = 'STOP_LOSS';
      } else if (price) {
        orderType = 'LIMIT';
      } else {
        orderType = 'MARKET';
      }
    }
    queryString += `&type=${orderType}`;
    
    // Add time in force for LIMIT orders
    if (orderType.includes('LIMIT') && price) {
      queryString += `&timeInForce=GTC`;
      queryString += `&price=${price}`;
    }
    
    // Add stop price for STOP orders
    if (stopPrice && (orderType.includes('STOP') || orderType.includes('TAKE_PROFIT'))) {
      queryString += `&stopPrice=${stopPrice}`;
    }
    
    // Add quantity or quoteOrderQty
    if (quoteOrderQty && orderType === 'MARKET') {
      // For MARKET orders, we can specify the amount in quote currency (e.g., USDT)
      queryString += `&quoteOrderQty=${quoteOrderQty}`;
    } else if (quantity) {
      // For all other orders, we specify the amount in base currency (e.g., BTC)
      queryString += `&quantity=${quantity}`;
    } else {
      throw new Error('Either quantity or quoteOrderQty is required');
    }
    
    const signature = signRequest(queryString);
    
    const url = `${config.baseUrl}/api/v3/order`;
    
    const response = await axios.post(`${url}?${queryString}&signature=${signature}`, null, {
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
 * Create a take profit order based on a percentage gain
 * @param {string} symbol - Trading pair symbol
 * @param {number} quantity - Amount to sell
 * @param {number} buyPrice - Original buy price
 * @param {number} profitPercentage - Target profit percentage
 * @returns {Promise<Object>} - Order information
 */
async function createTakeProfitOrder(symbol, quantity, buyPrice, profitPercentage) {
  // Calculate the target price
  const targetPrice = buyPrice * (1 + profitPercentage / 100);
  
  console.log(`Creating take profit order for ${symbol}`);
  console.log(`Buy price: ${buyPrice}`);
  console.log(`Target price (${profitPercentage}% profit): ${targetPrice}`);
  
  // Create a LIMIT sell order at the target price
  const orderParams = {
    symbol: symbol,
    side: 'SELL',
    type: 'LIMIT',
    quantity: quantity,
    price: targetPrice.toFixed(2), // Adjust precision as needed
    timeInForce: 'GTC'
  };
  
  return await createOrder(orderParams);
}

/**
 * Create a take profit order with an explicit profit amount
 * @param {string} symbol - Trading pair symbol
 * @param {number} quantity - Amount to sell
 * @param {number} buyPrice - Original buy price (for reference)
 * @param {number} profitAmount - Explicit profit amount in quote currency
 * @param {string} profitSymbol - Symbol of the profit currency (default: USDT)
 * @returns {Promise<Object>} - Order information
 */
async function createTakeProfitExplicitOrder(symbol, quantity, buyPrice, profitAmount, profitSymbol = 'USDT') {
  // Define trading fees (standard Binance fees, can be adjusted based on user's VIP level)
  const buyFee = 0.001; // 0.1% for buy
  const sellFee = 0.001; // 0.1% for sell
  
  // Calculate buy fee amount
  const buyFeeAmount = buyPrice * quantity * buyFee;
  
  // Calculate the target price that will yield the desired net profit after fees
  // Formula: targetPrice = (buyPrice * quantity + profitAmount + buyFeeAmount) / (quantity * (1 - sellFee))
  const targetPrice = (buyPrice * quantity + profitAmount + buyFeeAmount) / (quantity * (1 - sellFee));
  
  const profitPercentage = ((targetPrice / buyPrice) - 1) * 100;
  
  console.log(`Creating take profit order for ${symbol}`);
  console.log(`Buy price: ${buyPrice}`);
  console.log(`Profit amount: ${profitAmount} ${profitSymbol} (net after fees)`);
  console.log(`Buy fee: ${buyFeeAmount.toFixed(8)} ${profitSymbol}`);
  console.log(`Sell fee (estimated): ${(targetPrice * quantity * sellFee).toFixed(8)} ${profitSymbol}`);
  console.log(`Target price: ${targetPrice} (${profitPercentage.toFixed(2)}% profit)`);
  
  // Create a LIMIT sell order at the target price
  const orderParams = {
    symbol: symbol,
    side: 'SELL',
    type: 'LIMIT',
    quantity: quantity,
    price: targetPrice.toFixed(2), // Adjust precision as needed
    timeInForce: 'GTC'
  };
  
  return await createOrder(orderParams);
}

// Main function
async function main() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nBinance Order Trade\n');
      console.log('Description: Create and manage trading orders\n');
      console.log('Usage:');
      console.log('  node order-trade.js --symbol BTCUSDT --side BUY --quantity 0.001 --price 50000');
      console.log('  node order-trade.js --symbol BTCUSDT --side SELL --quantity 0.001 --market');
      console.log('  node order-trade.js --symbol BTCUSDT --side BUY --quoteOrderQty 50 --market');
      console.log('  node order-trade.js --symbol BTCUSDT --side SELL --quantity 0.001 --takeProfitPercentage 5');
      console.log('  node order-trade.js --symbol BTCUSDT --side SELL --quantity 0.001 --takeProfitExplicit 50 --takeProfitSymbol USDT\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (required)');
      console.log('  --side            Order side: BUY or SELL (required)');
      console.log('  --quantity        Amount in base currency (e.g., BTC)');
      console.log('  --quoteOrderQty   Amount in quote currency (e.g., USDT) - only for MARKET orders');
      console.log('  --price           Price for LIMIT orders');
      console.log('  --market          Create a MARKET order (default is LIMIT if price is provided)');
      console.log('  --stopPrice       Stop price for STOP_LOSS orders');
      console.log('  --takeProfitPercentage      Percentage profit target (e.g., 5 for 5% profit)');
      console.log('  --takeProfitExplicit        Explicit profit amount in quote currency (e.g., 50 for 50 USDT profit)');
      console.log('  --takeProfitSymbol         Symbol of the profit currency (default: USDT)');
      console.log('  --dryRun                   Simulate order without actually placing it');
      console.log('\nAlternatively, you can use the app.js interface:');
      console.log('  node app.js order-trade --symbol BTCUSDT --side BUY --quantity 0.001 --price 50000');
      return;
    }
    
    if (config.apiKey === 'YOUR_API_KEY' || config.apiSecret === 'YOUR_API_SECRET') {
      console.error('Please update the config.js file with your Binance API key and secret.');
      console.log('You can create API keys in your Binance account settings.');
      process.exit(1);
    }
    
    if (!args.symbol) {
      console.error('Symbol is required. Use --symbol BTCUSDT');
      console.log('Example: node order-trade.js --symbol BTCUSDT --side BUY --quantity 0.001 --price 50000');
      process.exit(1);
    }
    
    if (!args.side || (args.side !== 'BUY' && args.side !== 'SELL')) {
      console.error('Side is required and must be either BUY or SELL.');
      console.log('Example: node order-trade.js --symbol BTCUSDT --side BUY --quantity 0.001 --price 50000');
      process.exit(1);
    }
    
    if (!args.quantity && !args.quoteOrderQty) {
      console.error('Either quantity or quoteOrderQty is required.');
      console.log('Example: node order-trade.js --symbol BTCUSDT --side BUY --quantity 0.001 --price 50000');
      console.log('Example: node order-trade.js --symbol BTCUSDT --side BUY --quoteOrderQty 50 --market');
      process.exit(1);
    }
    
    // Handle take profit orders
    if ((args.takeProfitPercentage || args.takeProfitExplicit) && args.side === 'SELL') {
      if (args.takeProfitPercentage && args.takeProfitExplicit) {
        console.error('Please specify either --takeProfitPercentage OR --takeProfitExplicit, not both.');
        process.exit(1);
      }
      
      if (!args.buyPrice && !args.buyOrderId) {
        // If no buy price is provided, get the current price as reference
        console.log('No buy price provided, getting current price as reference...');
        const currentPrice = await getCurrentPrice(args.symbol);
        args.buyPrice = currentPrice;
      }
      
      let order;
      
      if (args.takeProfitPercentage) {
        const profitPercentage = parseFloat(args.takeProfitPercentage);
        
        if (isNaN(profitPercentage) || profitPercentage <= 0) {
          console.error('Take profit percentage must be a positive number.');
          process.exit(1);
        }
        
        // Create take profit order based on percentage
        order = await createTakeProfitOrder(
          args.symbol,
          args.quantity,
          parseFloat(args.buyPrice),
          profitPercentage
        );
      } else {
        const profitAmount = parseFloat(args.takeProfitExplicit);
        
        if (isNaN(profitAmount) || profitAmount <= 0) {
          console.error('Take profit explicit amount must be a positive number.');
          process.exit(1);
        }
        
        // Get profit symbol if provided, otherwise default to USDT
        const profitSymbol = args.takeProfitSymbol || 'USDT';
        
        // Create take profit order with explicit profit amount
        order = await createTakeProfitExplicitOrder(
          args.symbol,
          args.quantity,
          parseFloat(args.buyPrice),
          profitAmount,
          profitSymbol
        );
      }
      
      // Display order information
      displayOrder(order);
      
      // Suggest monitoring the order
      console.log('\nTo monitor this order, use:');
      console.log(`node order-monitor.js --symbol ${args.symbol} --orderId ${order.orderId} --save`);
      
      return;
    }
    
    // Prepare order parameters
    const orderParams = {
      symbol: args.symbol,
      side: args.side,
      quantity: args.quantity,
      quoteOrderQty: args.quoteOrderQty,
      price: args.price,
      stopPrice: args.stopPrice,
      type: args.market ? 'MARKET' : (args.price ? 'LIMIT' : 'MARKET')
    };
    
    // Check if we're in dry run mode
    if (args.dryRun) {
      console.log(`[DRY RUN] Would create ${orderParams.type} ${orderParams.side} order for ${orderParams.symbol}...`);
      
      // Create a simulated order response
      const simulatedOrder = {
        symbol: orderParams.symbol,
        orderId: Math.floor(Math.random() * 1000000000),
        clientOrderId: `simulated_${Date.now()}`,
        transactTime: Date.now(),
        price: orderParams.price || 'MARKET',
        origQty: orderParams.quantity,
        executedQty: orderParams.quantity,
        status: 'FILLED',
        timeInForce: 'GTC',
        type: orderParams.type,
        side: orderParams.side,
        fills: [{
          price: orderParams.price || await getCurrentPrice(orderParams.symbol),
          qty: orderParams.quantity,
          commission: '0',
          commissionAsset: 'BNB'
        }]
      };
      
      // Display simulated order information
      console.log('\n[DRY RUN] Simulated order:');
      displayOrder(simulatedOrder);
      
      // Return simulated order
      return simulatedOrder;
    } else {
      // Create the actual order
      console.log(`Creating ${orderParams.type} ${orderParams.side} order for ${orderParams.symbol}...`);
      const order = await createOrder(orderParams);
      
      // Display order information
      displayOrder(order);
      
      // Suggest monitoring the order
      console.log('\nTo monitor this order, use:');
      console.log(`node order_monitor.js --symbol ${args.symbol} --orderId ${order.orderId} --save`);
    }
    
  } catch (error) {
    console.error('An error occurred:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('An unexpected error occurred:', error);
});
