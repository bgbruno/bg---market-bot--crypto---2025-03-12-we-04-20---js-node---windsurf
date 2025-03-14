#!/usr/bin/env node

/**
 * Trading Loop
 * 
 * This script creates a complete trading loop that:
 * 1. Buys BTC with USDT using market orders
 * 2. Sells BTC for USDT with a specified profit target
 * 3. Shows order prediction
 * 4. Monitors the order until it's filled
 * 5. Repeats the process
 * 
 * Usage:
 *   node trading-loop.js --buyAmount 10 --profit 0.001 --cycles 3
 *   node trading-loop.js --symbol ETHUSDT --buyAmount 20 --profitPercent 1.5 --stopLoss 0.5
 *   node trading-loop.js --config trading-config.json
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Load configuration from file
function loadConfig(configPath) {
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error(`Error loading config file: ${error.message}`);
    return null;
  }
}

// Save configuration to file
function saveConfig(config, configPath) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Configuration saved to: ${configPath}`);
    return true;
  } catch (error) {
    console.error(`Error saving config file: ${error.message}`);
    return false;
  }
}

// Execute a command and return its output as a promise
function executeCommand(command, args = [], cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`\n> Executing: ${command} ${args.join(' ')}`);
    console.log('-'.repeat(50));
    
    const childProcess = spawn(command, args, {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output);
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

// Extract order ID from order output
function extractOrderId(output) {
  const match = output.match(/Order ID:\s+(\d+)/);
  return match ? match[1] : null;
}

// Helper function to extract fill information from market-buy.js output
function extractFillInfo(output) {
  const quantityMatch = output.match(/Total Quantity:\s+([0-9.]+)/);
  const priceMatch = output.match(/Average Price:\s+([0-9.]+)/);
  const costMatch = output.match(/Total Cost:\s+([0-9.]+)/);
  
  return {
    quantity: quantityMatch ? quantityMatch[1] : null,
    price: priceMatch ? priceMatch[1] : null,
    cost: costMatch ? costMatch[1] : null
  };
}

// Extract quantity from market buy output
function extractBuyQuantity(output) {
  // Look for the Total Quantity line in the Summary section
  const match = output.match(/Total Quantity:\s+([\d.]+)/);
  if (match) {
    // Round to 5 decimal places to avoid precision errors
    return parseFloat(match[1]).toFixed(5);
  }
  
  // Fallback: look for the Executed line
  const fallbackMatch = output.match(/Executed:\s+([\d.]+)/);
  return fallbackMatch ? parseFloat(fallbackMatch[1]).toFixed(5) : null;
}

// Extract average price from market buy output
function extractBuyPrice(output) {
  const match = output.match(/Average Price:\s+([\d.]+)/);
  if (match) {
    return match[1];
  }
  return null;
}

// Calculate profit target price based on buy price and profit settings
function calculateProfitPrice(buyPrice, profitSettings, quantity = null) {
  const price = parseFloat(buyPrice);
  
  // Trading fee on Binance is 0.1% per trade (0.1% for buy, 0.1% for sell)
  // We need to account for both fees to ensure we don't lose money
  const buyFeeRate = 0.001; // 0.1% for buy
  const sellFeeRate = 0.001; // 0.1% for sell
  const totalFeeRate = buyFeeRate + sellFeeRate; // 0.2% total
  
  // Calculate the minimum profit needed to break even after fees
  // For a profitable trade, we need: sell_amount > buy_amount + fees
  if (profitSettings.type === 'fixed') {
    // Fixed profit amount in quote currency
    if (quantity) {
      const quantityNum = parseFloat(quantity);
      
      // Calculate buy cost including fee
      const buyCost = price * quantityNum;
      const buyFee = buyCost * buyFeeRate;
      
      // Calculate the target profit (user-specified amount)
      const targetProfit = parseFloat(profitSettings.value);
      
      // Calculate the sell price needed to achieve target profit after fees
      // Formula: sell_price = (buy_cost + buy_fee + target_profit) / (quantity * (1 - sell_fee_rate))
      const sellPrice = (buyCost + buyFee + targetProfit) / (quantityNum * (1 - sellFeeRate));
      
      // Ensure the sell price is at least 1.5% higher than buy price to guarantee profit
      const minProfitablePrice = price * 1.015;
      
      // Cap the maximum sell price to prevent unrealistic values
      // Limit to 5% profit for very small quantities to ensure orders can be filled
      const maxProfitablePrice = price * 1.05;
      
      // Use the price that's between min and max profitable prices
      return Math.min(Math.max(sellPrice, minProfitablePrice), maxProfitablePrice).toFixed(2);
    } else {
      // Fallback when quantity is not provided
      // Add a minimum 1.5% to price plus the fixed profit amount
      const minProfitPercentage = 0.015; // 1.5% minimum profit
      return (price * (1 + minProfitPercentage + totalFeeRate) + parseFloat(profitSettings.value)).toFixed(2);
    }
  } else if (profitSettings.type === 'percent') {
    // Percentage profit
    const profitPercent = parseFloat(profitSettings.value) / 100;
    
    // Ensure minimum profit percentage is at least 1.5% plus fees
    const minProfitPercentage = 0.015; // 1.5% minimum profit
    const maxProfitPercentage = 0.05; // 5% maximum profit to ensure orders can be filled
    const effectiveProfit = Math.min(Math.max(profitPercent, minProfitPercentage), maxProfitPercentage);
    
    // Calculate sell price with adjusted profit percentage
    // Formula: sell_price = buy_price * (1 + effective_profit) / (1 - sell_fee_rate)
    const sellPrice = price * (1 + effectiveProfit + buyFeeRate) / (1 - sellFeeRate);
    
    return sellPrice.toFixed(2);
  }
  
  // Default fallback - ensure at least 1.5% profit plus fees
  const minProfitPercentage = 0.015; // 1.5% minimum profit
  return (price * (1 + minProfitPercentage + totalFeeRate)).toFixed(2);
}

// Calculate stop loss price based on buy price and stop loss settings
function calculateStopLossPrice(buyPrice, stopLossSettings) {
  if (!stopLossSettings.enabled) {
    return null;
  }
  
  const price = parseFloat(buyPrice);
  
  if (stopLossSettings.type === 'fixed') {
    // Fixed loss amount in quote currency
    return (price - parseFloat(stopLossSettings.value)).toFixed(2);
  } else if (stopLossSettings.type === 'percent') {
    // Percentage loss
    const lossPercent = parseFloat(stopLossSettings.value) / 100;
    return (price * (1 - lossPercent)).toFixed(2);
  }
  
  return null;
}

// Monitor order with price tracking to detect significant price drops
async function monitorOrderWithPriceTracking(symbol, orderId, buyPrice, priceDropSettings) {
  console.log(`Starting order monitoring with price tracking for order ${orderId}...`);
  
  let highestPrice = buyPrice;
  let currentPrice = buyPrice;
  let orderStatus = 'NEW';
  let monitorResult = { stdout: '' };
  
  // Monitor the order until it's filled or cancelled
  while (orderStatus !== 'FILLED' && orderStatus !== 'CANCELED') {
    // Check order status
    const orderArgs = [
      'order.js',
      '--orderId', orderId,
      '--symbol', symbol
    ];
    
    const orderResult = await executeCommand('node', orderArgs);
    const statusMatch = orderResult.stdout.match(/Status:\s+(\w+)/i);
    if (statusMatch) {
      orderStatus = statusMatch[1].toUpperCase();
      console.log(`Current order status: ${orderStatus}`);
    }
    
    if (orderStatus === 'FILLED') {
      console.log('Order has been filled!');
      monitorResult = orderResult;
      break;
    }
    
    if (orderStatus === 'CANCELED') {
      console.log('Order has been cancelled!');
      monitorResult = orderResult;
      break;
    }
    
    // Check current market price
    try {
      const priceArgs = [
        'market-price.js',
        '--symbol', symbol
      ];
      
      const priceResult = await executeCommand('node', priceArgs);
      const priceMatch = priceResult.stdout.match(/Current price:\s+([\d.]+)/i);
      
      if (priceMatch) {
        currentPrice = parseFloat(priceMatch[1]);
        console.log(`Current market price: ${currentPrice}`);
        
        // Update highest price if current price is higher
        if (currentPrice > highestPrice) {
          highestPrice = currentPrice;
          console.log(`New highest price: ${highestPrice}`);
        }
        
        // Check for price drop
        const absoluteDrop = highestPrice - currentPrice;
        const percentageDrop = (absoluteDrop / highestPrice) * 100;
        
        console.log(`Price drop from highest: ${absoluteDrop.toFixed(2)} (${percentageDrop.toFixed(2)}%)`);
        
        // Check if price drop exceeds thresholds
        const absoluteThresholdExceeded = priceDropSettings.absolute && 
                                         parseFloat(priceDropSettings.absolute) > 0 && 
                                         absoluteDrop >= parseFloat(priceDropSettings.absolute);
        
        const percentageThresholdExceeded = priceDropSettings.percentage && 
                                           parseFloat(priceDropSettings.percentage) > 0 && 
                                           percentageDrop >= parseFloat(priceDropSettings.percentage);
        
        if (absoluteThresholdExceeded || percentageThresholdExceeded) {
          console.log(`\n*** PRICE DROP THRESHOLD EXCEEDED ***`);
          if (absoluteThresholdExceeded) {
            console.log(`Absolute drop: ${absoluteDrop.toFixed(2)} exceeds threshold of ${priceDropSettings.absolute}`);
          }
          if (percentageThresholdExceeded) {
            console.log(`Percentage drop: ${percentageDrop.toFixed(2)}% exceeds threshold of ${priceDropSettings.percentage}%`);
          }
          
          // Cancel the current order
          console.log(`Cancelling order ${orderId} due to price drop...`);
          const cancelArgs = [
            'order-cancel.js',
            '--orderId', orderId,
            '--symbol', symbol,
            '--confirm'
          ];
          
          const cancelResult = await executeCommand('node', cancelArgs);
          console.log(`Order cancellation result: ${cancelResult.stdout}`);
          
          // Create a new order with updated price
          console.log(`Creating new order with updated market price...`);
          monitorResult = { stdout: `Order cancelled due to price drop. Original status: ${orderStatus}` };
          break;
        }
      }
    } catch (error) {
      console.warn(`Error checking market price: ${error.message}`);
    }
    
    // Wait before checking again (10 seconds)
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  return monitorResult;
}

// Save trading history to a log file
function saveToHistory(data) {
  const historyDir = path.join(process.cwd(), 'history');
  
  // Create history directory if it doesn't exist
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir);
  }
  
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = path.join(historyDir, `trade_${timestamp}.json`);
  
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`\nTrade history saved to: ${filename}`);
  
  // Also update the cumulative statistics file
  updateTradingStats(data);
}

// Update cumulative trading statistics
function updateTradingStats(tradeData) {
  // Create timestamp for the filename
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const statsFile = path.join(process.cwd(), 'history', `trading_stats_${timestamp}.json`);
  
  let stats = { 
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalProfit: 0,
    totalLoss: 0,
    netProfit: 0,
    winRate: 0,
    startDate: null,
    lastTradeDate: null,
    symbol: tradeData.symbol,
    trades: []
  };
  
  // Find the most recent stats file for this symbol
  const historyDir = path.join(process.cwd(), 'history');
  let mostRecentStatsFile = null;
  let mostRecentTime = 0;
  
  if (fs.existsSync(historyDir)) {
    const files = fs.readdirSync(historyDir);
    for (const file of files) {
      if (file.startsWith('trading_stats_') && file.endsWith('.json')) {
        const filePath = path.join(historyDir, file);
        const fileStat = fs.statSync(filePath);
        
        // Check if this is the most recent file
        if (fileStat.mtimeMs > mostRecentTime) {
          try {
            // Read the file to check if it's for the same symbol
            const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!fileData.symbol || fileData.symbol === tradeData.symbol) {
              mostRecentStatsFile = filePath;
              mostRecentTime = fileStat.mtimeMs;
            }
          } catch (error) {
            console.warn(`Error reading stats file ${file}: ${error.message}`);
          }
        }
      }
    }
  }
  
  // Load existing stats if available
  if (mostRecentStatsFile && fs.existsSync(mostRecentStatsFile)) {
    try {
      stats = JSON.parse(fs.readFileSync(mostRecentStatsFile, 'utf8'));
    } catch (error) {
      console.warn(`Error reading stats file: ${error.message}`);
    }
  }
  
  // Update stats with new trade data
  stats.totalTrades++;
  stats.lastTradeDate = new Date().toISOString();
  stats.symbol = tradeData.symbol;
  if (!stats.startDate) {
    stats.startDate = stats.lastTradeDate;
  }
  
  // Calculate profit/loss
  if (tradeData.sellPrice && tradeData.buyPrice && tradeData.quantity) {
    const profit = (parseFloat(tradeData.sellPrice) - parseFloat(tradeData.buyPrice)) * parseFloat(tradeData.quantity);
    
    if (profit > 0) {
      stats.successfulTrades++;
      stats.totalProfit += profit;
    } else {
      stats.failedTrades++;
      stats.totalLoss += Math.abs(profit);
    }
    
    stats.netProfit = stats.totalProfit - stats.totalLoss;
    stats.winRate = (stats.successfulTrades / stats.totalTrades) * 100;
    
    // Add trade summary to trades array (limit to last 100 trades)
    stats.trades.unshift({
      date: stats.lastTradeDate,
      symbol: tradeData.symbol,
      buyPrice: tradeData.buyPrice,
      sellPrice: tradeData.sellPrice,
      quantity: tradeData.quantity,
      profit: profit.toFixed(8)
    });
    
    // Keep only the last 100 trades
    if (stats.trades.length > 100) {
      stats.trades = stats.trades.slice(0, 100);
    }
  }
  
  // Save updated stats
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
  console.log(`Trading statistics updated: ${stats.totalTrades} trades, ${stats.netProfit.toFixed(8)} net profit`);
}

// Main trading loop
async function tradingLoop() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nTrading Loop\n');
      console.log('Description: Create a complete trading loop that buys and sells with configurable parameters\n');
      console.log('Usage:');
      console.log('  node trading-loop.js --buyAmount 10 --profit 0.001 --cycles 3');
      console.log('  node trading-loop.js --symbol ETHUSDT --buyAmount 20 --profitPercent 1.5 --stopLoss 0.5');
      console.log('  node trading-loop.js --config trading-config.json\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (default: BTCUSDT)');
      console.log('  --buyAmount       Amount to spend in quote currency for buying (default: 10)');
      console.log('  --profit          Target profit amount in quote currency (default: 0.001)');
      console.log('  --profitPercent   Target profit as percentage (alternative to --profit)');
      console.log('  --stopLoss        Stop loss amount in quote currency (optional)');
      console.log('  --stopLossPercent Stop loss as percentage (optional)');
      console.log('  --trailingStop    Enable trailing stop loss (default: false)');
      console.log('  --trailingPercent Trailing stop distance as percentage (default: 0.5)');
      console.log('  --priceDropThreshold      Absolute price drop to trigger order cancellation (default: 0)');
      console.log('  --priceDropThresholdPercentage  Percentage drop from highest price to trigger order cancellation (default: 1.0)');
      console.log('  --cycles          Number of trading cycles to run (default: infinite)');
      console.log('  --delay           Delay between cycles in seconds (default: 5)');
      console.log('  --skipBalanceCheck Skip checking account balance before trading (default: false)');
      console.log('  --config          Path to JSON configuration file');
      console.log('  --saveConfig      Save current parameters to config file (default: false)');
      console.log('  --configPath      Path to save configuration (default: ./trading-config.json)');
      console.log('  --logLevel        Logging level: minimal, normal, verbose (default: normal)');
      console.log('  --dryRun          Simulate trading without placing real orders (default: false)');
      console.log('  --forceDryRun     Automatically switch to dry run mode if minimum requirements not met (default: false)');
      return;
    }
    
    // Load configuration from file if specified
    let config = {};
    if (args.config) {
      const loadedConfig = loadConfig(args.config);
      if (loadedConfig) {
        config = loadedConfig;
        console.log(`Loaded configuration from: ${args.config}`);
      } else {
        console.log('Failed to load configuration, using command line arguments');
      }
    }
    
    // Merge command line arguments with loaded config (command line takes precedence)
    const options = { ...config, ...args };
    
    // Set default parameters
    const symbol = options.symbol || 'BTCUSDT';
    let buyAmount = options.buyAmount || '10'; // Changed to let so it can be modified
    const maxCycles = options.cycles ? parseInt(options.cycles) : Infinity;
    const delay = options.delay ? parseInt(options.delay) * 1000 : 5000;
    const skipBalanceCheck = options.skipBalanceCheck || false;
    let dryRun = options.dryRun || false;
    const forceDryRun = options.forceDryRun || false;
    const logLevel = options.logLevel || 'normal';
    
    // Extract quote currency (e.g., USDT) and base currency (e.g., BTC) from symbol
    const quoteCurrency = symbol.replace(/BTC|ETH|BNB|XRP|ADA|DOT|SOL|DOGE|AVAX|MATIC/, '');
    const baseCurrency = symbol.replace(quoteCurrency, '');
    
    // Set up profit settings
    const profitSettings = {
      type: options.profitPercent ? 'percent' : 'fixed',
      value: options.profitPercent || options.profit || '0.001'
    };
    
    // Ensure minimum buy amount is at least 10 USDT to meet Binance's requirements
    // Check if the buy amount is below the minimum notional value (10 USDT)
    const minimumOrderValue = 10; // Binance typically requires minimum 10 USDT equivalent
    
    if (parseFloat(buyAmount) < minimumOrderValue && quoteCurrency === 'USDT') {
      console.log(`Buy amount ${buyAmount} USDT is below minimum requirement of ${minimumOrderValue} USDT`);
      
      // Check if we have enough balance to meet the minimum requirement
      if (!skipBalanceCheck) {
        try {
          const balanceResult = await executeCommand('node', [
            'account-info.js',
            '--balance'
          ]);
          
          const quoteMatch = new RegExp(`${quoteCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
          if (quoteMatch) {
            const quoteBalance = parseFloat(quoteMatch[1]);
            console.log(`Available ${quoteCurrency} balance: ${quoteBalance}`);
            
            if (quoteBalance >= minimumOrderValue) {
              console.log(`Using available balance of ${quoteBalance.toFixed(2)} ${quoteCurrency} (up to ${minimumOrderValue} ${quoteCurrency}) to meet minimum requirements`);
              buyAmount = Math.min(quoteBalance, minimumOrderValue).toFixed(2);
            } else if (quoteBalance < minimumOrderValue && quoteBalance >= parseFloat(buyAmount)) {
              console.log(`Warning: Available balance (${quoteBalance.toFixed(2)} ${quoteCurrency}) is below minimum requirement but above requested amount.`);
              console.log(`Switching to dry run mode to prevent order failure due to minimum notional value requirements.`);
              dryRun = true;
            } else {
              console.log(`Warning: Available balance (${quoteBalance.toFixed(2)} ${quoteCurrency}) is below both minimum requirement and requested amount.`);
              if (forceDryRun) {
                console.log(`Switching to dry run mode due to insufficient funds.`);
                dryRun = true;
                buyAmount = minimumOrderValue.toString();
              } else {
                console.log(`Please deposit more funds or reduce the buy amount.`);
                throw new Error(`Insufficient balance for trading. Available: ${quoteBalance.toFixed(2)} ${quoteCurrency}, Required: ${minimumOrderValue} ${quoteCurrency}`);
              }
            }
          }
        } catch (error) {
          if (error.message.includes('Insufficient balance')) {
            throw error; // Re-throw the specific error
          }
          console.warn(`Error checking balance: ${error.message}`);
          console.log(`Setting buy amount to ${minimumOrderValue} ${quoteCurrency} to meet minimum requirements`);
          buyAmount = minimumOrderValue.toString();
        }
      } else {
        console.log(`Setting buy amount to ${minimumOrderValue} ${quoteCurrency} to meet minimum requirements`);
        buyAmount = minimumOrderValue.toString();
      }
    }
    
    // Set up stop loss settings
    const stopLossSettings = {
      enabled: !!(options.stopLoss || options.stopLossPercent),
      type: options.stopLossPercent ? 'percent' : 'fixed',
      value: options.stopLossPercent || options.stopLoss || '0'
    };
    
    // Set up trailing stop settings
    const trailingStopSettings = {
      enabled: options.trailingStop || false,
      percent: options.trailingPercent || '0.5'
    };
    
    // Set up price drop threshold settings
    const priceDropSettings = {
      enabled: !!(options.priceDropThreshold || options.priceDropThresholdPercentage),
      absolute: options.priceDropThreshold || '0',
      percentage: options.priceDropThresholdPercentage || '1.0'
    };
    
    // Save configuration if requested
    if (options.saveConfig) {
      const configPath = options.configPath || './trading-config.json';
      const configToSave = {
        symbol,
        buyAmount,
        profit: options.profit,
        profitPercent: options.profitPercent,
        stopLoss: options.stopLoss,
        stopLossPercent: options.stopLossPercent,
        trailingStop: trailingStopSettings.enabled,
        trailingPercent: trailingStopSettings.percent,
        priceDropThreshold: options.priceDropThreshold,
        priceDropThresholdPercentage: options.priceDropThresholdPercentage,
        cycles: options.cycles,
        delay: options.delay,
        skipBalanceCheck,
        logLevel,
        dryRun
      };
      
      saveConfig(configToSave, configPath);
    }
    
    // Log configuration based on log level
    if (logLevel !== 'minimal') {
      console.log('\n=== Trading Loop Started ===');
      console.log(`Symbol: ${symbol}`);
      console.log(`Buy Amount: ${buyAmount} ${quoteCurrency}`);
      
      if (profitSettings.type === 'percent') {
        console.log(`Profit Target: ${profitSettings.value}%`);
      } else {
        console.log(`Profit Target: ${profitSettings.value} ${quoteCurrency}`);
      }
      
      if (stopLossSettings.enabled) {
        if (stopLossSettings.type === 'percent') {
          console.log(`Stop Loss: ${stopLossSettings.value}%`);
        } else {
          console.log(`Stop Loss: ${stopLossSettings.value} ${quoteCurrency}`);
        }
      }
      
      if (trailingStopSettings.enabled) {
        console.log(`Trailing Stop: Enabled (${trailingStopSettings.percent}%)`);
      }
      
      if (priceDropSettings.enabled) {
        if (options.priceDropThreshold) {
          console.log(`Price Drop Threshold: ${priceDropSettings.absolute} ${quoteCurrency}`);
        }
        if (options.priceDropThresholdPercentage) {
          console.log(`Price Drop Threshold Percentage: ${priceDropSettings.percentage}%`);
        }
      }
      
      console.log(`Max Cycles: ${maxCycles === Infinity ? 'Infinite' : maxCycles}`);
      console.log(`Delay Between Cycles: ${delay / 1000} seconds`);
      console.log(`Skip Balance Check: ${skipBalanceCheck}`);
      console.log(`Dry Run: ${dryRun}`);
      console.log(`Log Level: ${logLevel}`);
      console.log('============================\n');
    }
    
    // Check account balance if not skipped
    if (!skipBalanceCheck) {
      console.log('Checking account balance...');
      const balanceResult = await executeCommand('node', [
        'account-info.js',
        '--balance'
      ]);
      
      // Extract base currency (BTC) balance from output first
      const baseMatch = new RegExp(`${baseCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
      let availableBalance = null;
      
      if (baseMatch) {
        availableBalance = parseFloat(baseMatch[1]);
        console.log(`Available ${baseCurrency} balance: ${availableBalance}`);
        
        // Store base currency balance for later use
        options.baseBalance = availableBalance;
        
        // Check if we have enough base currency for a minimum viable trade
        // For BTC, we need at least 0.0005 BTC (approximately $40 at current prices)
        // This ensures we meet Binance's minimum notional value requirement
        const minBaseQuantity = 0.0005; // Minimum quantity to trade
        
        // Always check if we can buy BTC with USDT if we don't have enough BTC
        // This is a critical change - we ALWAYS prefer to buy new BTC with USDT
        // rather than using existing BTC balance if it's below the minimum
        console.log(`Checking if we have enough ${baseCurrency} for trading...`);
        if (availableBalance < minBaseQuantity) {
          console.log(`Insufficient ${baseCurrency} balance for trading. Required: ${minBaseQuantity}, Available: ${availableBalance}`);
          console.log(`Will buy ${baseCurrency} with ${quoteCurrency} instead.`);
          options.skipBuyStep = false; // Force buying with USDT
        } else {
          // We have enough base currency, skip buying
          console.log(`Using existing ${baseCurrency} balance for trading.`);
          options.skipBuyStep = true;
        }
      } else {
        console.log(`Could not determine ${baseCurrency} balance. Will check ${quoteCurrency} balance...`);
      }
      
      // If we don't have enough base currency, check quote currency (USDT)
      if (!options.skipBuyStep) {
        const quoteMatch = new RegExp(`${quoteCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
        if (quoteMatch) {
          const quoteBalance = parseFloat(quoteMatch[1]);
          console.log(`Available ${quoteCurrency} balance: ${quoteBalance}`);
          
          // Check if we have enough quote currency to buy
          if (quoteBalance >= parseFloat(buyAmount)) {
            console.log(`Will buy ${baseCurrency} using ${buyAmount} ${quoteCurrency}.`);
            // We'll proceed with buying
          } else {
            console.log(`Insufficient ${quoteCurrency} balance. Required: ${buyAmount}, Available: ${quoteBalance}`);
            
            // Instead of throwing an error, try to use what we have available
            if (quoteBalance >= 10) { // Ensure we have at least the minimum notional value
              console.log(`\nWill use available balance of ${quoteBalance.toFixed(2)} ${quoteCurrency} instead of requested ${buyAmount} ${quoteCurrency}.`);
              buyAmount = quoteBalance.toFixed(2);
            } else {
              console.log(`\nAvailable balance (${quoteBalance.toFixed(2)} ${quoteCurrency}) is below minimum required amount (10 ${quoteCurrency}).`);
              console.log(`Please deposit more funds or reduce the buy amount.`);
              throw new Error(`Insufficient balance for trading. Not enough ${baseCurrency} or ${quoteCurrency}.`);
            }
          }
        } else {
          console.log(`Could not determine ${quoteCurrency} balance. Proceeding with caution...`);
        }
      }
    }
    
    let cycle = 1;
    
    while (cycle <= maxCycles) {
      // Create a timestamp in readable format
      const timestamp = new Date().toISOString();
      
      if (logLevel !== 'minimal') {
        console.log('\n' + '='.repeat(50));
        console.log(`TRADING CYCLE #${cycle} - ${timestamp}`);
        console.log('='.repeat(50) + '\n');
      } else {
        console.log(`\nCycle #${cycle} - ${timestamp}`);
      }
      
      // Refresh account balance at the beginning of each cycle
      if (!skipBalanceCheck) {
        console.log('Refreshing account balance for this cycle...');
        try {
          const balanceResult = await executeCommand('node', [
            'account-info.js',
            '--balance'
          ]);
          
          // Extract base currency (BTC) balance from output
          const baseMatch = new RegExp(`${baseCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
          if (baseMatch) {
            const availableBalance = parseFloat(baseMatch[1]);
            console.log(`Current ${baseCurrency} balance: ${availableBalance}`);
            options.baseBalance = availableBalance;
          }
          
          // Extract quote currency (USDT) balance from output
          const quoteMatch = new RegExp(`${quoteCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
          if (quoteMatch) {
            const quoteBalance = parseFloat(quoteMatch[1]);
            console.log(`Current ${quoteCurrency} balance: ${quoteBalance}`);
            options.quoteBalance = quoteBalance;
          }
        } catch (error) {
          console.warn(`Error refreshing balance: ${error.message}`);
        }
      }
      
      // Initialize trade data for history
      const tradeData = {
        cycle,
        symbol,
        timestamp,
        buyAmount,
        profit: profitSettings.type === 'percent' ? `${profitSettings.value}%` : profitSettings.value
      };
      
      // Step 1: Buy using market order (unless we're skipping this step)
      let buyQuantity = null;
      let buyPrice = null;
      
      if (!options.skipBuyStep) {
        if (logLevel !== 'minimal') {
          console.log('Step 1: Buying using market order');
        }
        
        const buyArgs = [
          'market-buy.js',
          '--symbol', symbol,
          '--amount', buyAmount
        ];
        
        if (!dryRun) {
          buyArgs.push('--confirm');
        } else {
          console.log('[DRY RUN] Would execute market buy');
        }
        
        const buyResult = await executeCommand('node', buyArgs);
        
        // Extract buy quantity and price
        buyQuantity = extractBuyQuantity(buyResult.stdout);
        buyPrice = extractBuyPrice(buyResult.stdout);
        
        if (buyQuantity && buyPrice) {
          console.log(`\nBought ${buyQuantity} ${baseCurrency} at average price of ${buyPrice} ${quoteCurrency}`);
          
          // Update trade data
          tradeData.buyPrice = buyPrice;
          tradeData.quantity = buyQuantity;
          
          // Update the base balance with the newly purchased amount
          // This is crucial for the minimum notional value check later
          if (options.baseBalance) {
            options.baseBalance = (parseFloat(options.baseBalance) + parseFloat(buyQuantity)).toString();
            console.log(`Updated ${baseCurrency} balance: ${options.baseBalance} ${baseCurrency}`);
          } else {
            options.baseBalance = buyQuantity;
          }
        } else {
          console.warn('Could not extract buy quantity or price from output. Using fallback values.');
          
          // Use fallback values
          buyQuantity = options.baseBalance || '0.001';
          
          // Try to get current price from exchange info
          try {
            const priceResult = await executeCommand('node', [
              'exchange-info.js',
              '--symbol', symbol,
              '--price'
            ]);
            
            const priceMatch = priceResult.stdout.match(/Current price:\s+([\d.]+)/);
            buyPrice = priceMatch ? priceMatch[1] : '20000'; // Fallback price
            
            console.log(`Using current price: ${buyPrice} ${quoteCurrency}`);
          } catch (error) {
            console.warn(`Error getting current price: ${error.message}`);
            buyPrice = '20000'; // Default fallback price for BTC
          }
          
          tradeData.buyPrice = buyPrice;
          tradeData.quantity = buyQuantity;
        }
      } else {
        // Skip buy step, use existing balance
        console.log('Skipping buy step, using existing balance');
        
        buyQuantity = options.baseBalance;
        
        // Get current price
        try {
          const priceResult = await executeCommand('node', [
            'exchange-info.js',
            '--symbol', symbol,
            '--price'
          ]);
          
          const priceMatch = priceResult.stdout.match(/Current price:\s+([\d.]+)/);
          buyPrice = priceMatch ? priceMatch[1] : '20000'; // Fallback price
          
          console.log(`Current price: ${buyPrice} ${quoteCurrency}`);
        } catch (error) {
          console.warn(`Error getting current price: ${error.message}`);
          buyPrice = '20000'; // Default fallback price for BTC
        }
        
        tradeData.buyPrice = buyPrice;
        tradeData.quantity = buyQuantity;
      }
      
      // Step 2: Calculate sell price based on profit settings and quantity
      const sellPrice = calculateProfitPrice(buyPrice, profitSettings, buyQuantity);
      
      // Calculate stop loss price if enabled
      const stopLossPrice = calculateStopLossPrice(buyPrice, stopLossSettings);
      
      // Calculate the minimum quantity needed to meet Binance's minimum notional value requirement (10 USDT)
      const minimumOrderValue = 10; // Binance typically requires minimum 10 USDT equivalent
      const minRequiredQuantity = Math.ceil((minimumOrderValue * 1.01 / parseFloat(sellPrice)) * 100000) / 100000;
      
      // Round quantity down to 5 decimal places to comply with Binance LOT_SIZE filter
      // but ensure it's at least the minimum required quantity
      let roundedQuantity = Math.floor(parseFloat(buyQuantity) * 100000) / 100000;
      
      // Initialize finalQuantity with the rounded quantity
      let finalQuantity = roundedQuantity;
      
      // Always use at least the minimum required quantity to ensure orders are at least 10 USDT
      if (roundedQuantity < minRequiredQuantity) {
        console.log(`Increasing quantity from ${roundedQuantity.toFixed(5)} to ${minRequiredQuantity.toFixed(5)} ${baseCurrency} to meet minimum notional value`);
        roundedQuantity = minRequiredQuantity;
        
        // Check if we have enough balance for the minimum required quantity
        if (options.baseBalance && parseFloat(options.baseBalance) < minRequiredQuantity) {
          console.log(`\nInsufficient ${baseCurrency} balance for minimum order: ${options.baseBalance} ${baseCurrency}`);
          console.log(`Required: ${minRequiredQuantity.toFixed(5)} ${baseCurrency}`);
          console.log(`Attempting to buy more ${baseCurrency} with ${quoteCurrency}...`);
          
          // Set allowBuyWithQuote to true to ensure we buy BTC with USDT
          options.allowBuyWithQuote = true;
          
          // Check if we're in dry run mode
          if (dryRun) {
            console.log(`In dry run mode - simulating with minimum required quantity`);
            finalQuantity = minRequiredQuantity; // Use minRequiredQuantity instead of adjustedQuantity
            console.log(`Using simulated quantity: ${finalQuantity.toFixed(5)} ${baseCurrency}`);
          } else {
            // Set flag to buy BTC with USDT and continue
            console.log(`Setting flag to buy ${baseCurrency} with ${quoteCurrency} first...`);
            options.skipBuyStep = false; // Force buying with USDT
          }
        }
      }
      
      // Check if order meets Binance's minimum notional value requirement
      const orderValue = parseFloat(sellPrice) * roundedQuantity;
      
      // Update the final quantity if we've adjusted the rounded quantity
      
      if (orderValue < minimumOrderValue) {
        console.warn(`\nWarning: Order value (${orderValue.toFixed(2)} ${quoteCurrency}) is below Binance's minimum requirement (${minimumOrderValue} ${quoteCurrency})`);
        console.warn(`This may cause a 'Filter failure: NOTIONAL' error when placing the order`);
        
        // Calculate the adjusted quantity needed to meet minimum notional value
        // Add a small buffer (1%) to ensure we meet the requirement
        const adjustedQuantity = Math.ceil((minimumOrderValue * 1.01 / parseFloat(sellPrice)) * 100000) / 100000;
        
        // Check if we have enough balance for the adjusted quantity
        if (options.baseBalance && parseFloat(options.baseBalance) < adjustedQuantity) {
          console.warn(`\nWarning: Insufficient ${baseCurrency} balance to meet minimum order requirements`);
          console.warn(`Required: ${adjustedQuantity.toFixed(5)} ${baseCurrency}, Available: ${options.baseBalance} ${baseCurrency}`);
          
          // Try to buy more BTC with USDT to meet the minimum requirement
          if (!dryRun) {
            console.log(`\nAttempting to buy more ${baseCurrency} with ${quoteCurrency} to meet minimum requirements...`);
            
            try {
              // Check USDT balance first
              const balanceResult = await executeCommand('node', [
                'account-info.js',
                '--balance'
              ]);
              
              const quoteMatch = new RegExp(`${quoteCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
              if (quoteMatch) {
                const quoteBalance = parseFloat(quoteMatch[1]);
                console.log(`Available ${quoteCurrency} balance: ${quoteBalance}`);
                
                if (quoteBalance >= 10) { // Ensure we have at least 10 USDT
                  // Buy more BTC with USDT
                  console.log(`Buying additional ${baseCurrency} with ${quoteBalance.toFixed(2)} ${quoteCurrency}...`);
                  
                  const buyResult = await executeCommand('node', [
                    'market-buy.js',
                    '--symbol', symbol,
                    '--amount', quoteBalance.toFixed(2),
                    '--confirm'
                  ]);
                  
                  // Extract buy quantity
                  const newBtc = extractBuyQuantity(buyResult.stdout);
                  if (newBtc) {
                    console.log(`Successfully bought additional ${newBtc} ${baseCurrency}`);
                    
                    // Update base balance
                    options.baseBalance = (parseFloat(options.baseBalance) + parseFloat(newBtc)).toString();
                    console.log(`Updated ${baseCurrency} balance: ${options.baseBalance} ${baseCurrency}`);
                    
                    // Check if we now have enough
                    if (parseFloat(options.baseBalance) >= adjustedQuantity) {
                      console.log(`Now have sufficient ${baseCurrency} for trading!`);
                      finalQuantity = adjustedQuantity;
                      tradeData.quantity = finalQuantity;
                      return finalQuantity;
                    }
                  }
                }
              }
            } catch (error) {
              console.warn(`Error buying additional ${baseCurrency}: ${error.message}`);
            }
            
            // If we get here, we still don't have enough BTC
            console.log(`\nOptions:`);
            console.log(`1. Deposit more ${baseCurrency} to your account`);
            console.log(`2. Use a different trading pair with lower minimum requirements`);
            console.log(`3. Use the --dryRun flag to simulate trading without placing real orders`);
            
            // Automatically switch to dry run mode for this cycle if forceDryRun is enabled
            if (options.forceDryRun) {
              console.log(`\nAutomatically switching to dry run mode for this cycle...`);
              dryRun = true;
            } else {
              throw new Error(`Insufficient ${baseCurrency} balance to meet minimum order requirements`);
            }
          }
          
          if (dryRun) {
            console.log(`\n[DRY RUN] Proceeding with simulation using available balance: ${options.baseBalance} ${baseCurrency}`);
            // In dry run mode, we'll just use what we have for demonstration
            finalQuantity = Math.min(roundedQuantity, parseFloat(options.baseBalance));
            console.log(`Using maximum available quantity: ${finalQuantity.toFixed(5)} ${baseCurrency}`);
            console.log(`Note: This is below Binance's minimum notional value and would fail in a real trade`);
          }
        } else {
          // We have enough balance or balance check was skipped
          console.log(`Consider increasing your buy amount to at least ${minimumOrderValue} ${quoteCurrency}`);
          console.log(`Adjusting quantity to meet minimum requirements...`);
          console.log(`Adjusted quantity: ${roundedQuantity.toFixed(5)} → ${adjustedQuantity.toFixed(5)} ${baseCurrency}`);
          
          // Double-check that we don't exceed available balance
          if (options.baseBalance) {
            finalQuantity = Math.min(adjustedQuantity, parseFloat(options.baseBalance));
            if (finalQuantity < adjustedQuantity) {
              console.warn(`Limited by available balance: ${options.baseBalance} ${baseCurrency}`);
              
              // If we still don't have enough for minimum notional, switch to dry run
              const updatedOrderValue = parseFloat(sellPrice) * finalQuantity;
              if (updatedOrderValue < minimumOrderValue && !dryRun) {
                console.warn(`\nWarning: Even with all available balance, order value (${updatedOrderValue.toFixed(2)} ${quoteCurrency}) is below minimum requirement`);
                
                // Try to buy more BTC with USDT
                console.log(`\nAttempting to buy more ${baseCurrency} with ${quoteCurrency} to meet minimum requirements...`);
                
                try {
                  // Check USDT balance
                  const balanceResult = await executeCommand('node', [
                    'account-info.js',
                    '--balance'
                  ]);
                  
                  const quoteMatch = new RegExp(`${quoteCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
                  if (quoteMatch) {
                    const quoteBalance = parseFloat(quoteMatch[1]);
                    console.log(`Available ${quoteCurrency} balance: ${quoteBalance}`);
                    
                    if (quoteBalance >= 10) { // Ensure we have at least 10 USDT
                      // Buy more BTC with USDT
                      console.log(`Buying additional ${baseCurrency} with ${quoteBalance.toFixed(2)} ${quoteCurrency}...`);
                      
                      const buyResult = await executeCommand('node', [
                        'market-buy.js',
                        '--symbol', symbol,
                        '--amount', quoteBalance.toFixed(2),
                        '--confirm'
                      ]);
                      
                      // Extract buy quantity
                      const newBtc = extractBuyQuantity(buyResult.stdout);
                      if (newBtc) {
                        console.log(`Successfully bought additional ${newBtc} ${baseCurrency}`);
                        
                        // Update base balance
                        options.baseBalance = (parseFloat(options.baseBalance) + parseFloat(newBtc)).toString();
                        console.log(`Updated ${baseCurrency} balance: ${options.baseBalance} ${baseCurrency}`);
                        
                        // Check if we now have enough
                        if (parseFloat(options.baseBalance) >= adjustedQuantity) {
                          console.log(`Now have sufficient ${baseCurrency} for trading!`);
                          finalQuantity = adjustedQuantity;
                          tradeData.quantity = finalQuantity;
                          return finalQuantity;
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`Error buying additional ${baseCurrency}: ${error.message}`);
                }
                
                // If we still don't have enough
                console.log(`\nOptions:`);
                console.log(`1. Deposit more ${baseCurrency} to your account`);
                console.log(`2. Use a different trading pair with lower minimum requirements`);
                console.log(`3. Use the --dryRun flag to simulate trading without placing real orders`);
                
                if (options.forceDryRun) {
                  console.log(`\nAutomatically switching to dry run mode for this cycle...`);
                  dryRun = true;
                } else {
                  throw new Error(`Insufficient ${baseCurrency} balance to meet minimum order requirements`);
                }
              }
            } else {
              finalQuantity = adjustedQuantity;
            }
          } else {
            finalQuantity = adjustedQuantity;
          }
          
          tradeData.quantity = finalQuantity; // Update trade data with adjusted quantity
          
          if (dryRun) {
            console.log(`[DRY RUN] Using adjusted quantity for demonstration purposes`);
          }
        }
      }
      
      if (logLevel !== 'minimal') {
        console.log('\nStep 2: Creating sell order');
        console.log(`Buy Price: ${buyPrice} ${quoteCurrency}`);
        console.log(`Sell Price: ${sellPrice} ${quoteCurrency}`);
        
        // Calculate and display the expected profit
        const buyValue = parseFloat(buyPrice) * finalQuantity;
        const sellValue = parseFloat(sellPrice) * finalQuantity;
        const buyFee = buyValue * 0.001; // 0.1% buy fee
        const sellFee = sellValue * 0.001; // 0.1% sell fee
        const netProfit = sellValue - sellFee - (buyValue + buyFee);
        const profitPercentage = (netProfit / buyValue) * 100;
        
        console.log('\nProfit Calculation:');
        console.log(`Buy Value: ${buyValue.toFixed(8)} ${quoteCurrency}`);
        console.log(`Buy Fee (0.1%): ${buyFee.toFixed(8)} ${quoteCurrency}`);
        console.log(`Sell Value: ${sellValue.toFixed(8)} ${quoteCurrency}`);
        console.log(`Sell Fee (0.1%): ${sellFee.toFixed(8)} ${quoteCurrency}`);
        console.log(`Net Profit: ${netProfit.toFixed(8)} ${quoteCurrency} (${profitPercentage.toFixed(2)}%)`);
        console.log(`Total Balance Change: +${netProfit.toFixed(8)} ${quoteCurrency}\n`);
        
        if (stopLossSettings.enabled) {
          console.log(`Stop Loss Price: ${stopLossPrice} ${quoteCurrency}`);
        }
        
        // Show order simulation
        console.log('\nOrder Simulation:');
        const simulationArgs = [
          'order-simulation.js',
          '--symbol', symbol,
          '--side', 'SELL',
          '--price', sellPrice,
          '--quantity', finalQuantity.toFixed(5)
        ];
        
        await executeCommand('node', simulationArgs);
      } else {
        console.log(`Buy: ${buyPrice} → Sell: ${sellPrice} ${stopLossSettings.enabled ? `(Stop: ${stopLossPrice})` : ''}`);
      }
      
      // Step 3: Create limit sell order
      
      const sellArgs = [
        'order-trade.js',
        '--symbol', symbol,
        '--side', 'SELL',
        '--quantity', finalQuantity.toFixed(5),
        '--price', sellPrice
      ];
      
      // Add stop loss if enabled
      if (stopLossSettings.enabled) {
        sellArgs.push('--stopPrice', stopLossPrice);
      }
      
      // Add trailing stop if enabled
      if (trailingStopSettings.enabled) {
        sellArgs.push('--trailingDelta', trailingStopSettings.percent);
      }
      
      if (dryRun) {
        // Add dryRun flag to simulate order without actually placing it
        sellArgs.push('--dryRun');
        console.log('[DRY RUN] Would execute sell order');
      } else {
        sellArgs.push('--confirm');
      }
      
      const sellResult = await executeCommand('node', sellArgs);
      
      // Extract order ID
      const orderId = extractOrderId(sellResult.stdout);
      
      if (orderId) {
        console.log(`\nSell order created with ID: ${orderId}`);
        
        // Update trade data
        tradeData.orderId = orderId;
        tradeData.sellPrice = sellPrice;
        
        // Step 4: Monitor the order until it's filled
        if (logLevel !== 'minimal') {
          console.log('\nStep 4: Monitoring sell order');
        }
        
        if (!dryRun) {
          // Check if price drop monitoring is enabled
          let monitorResult;
          if (priceDropSettings.enabled) {
            console.log(`\nMonitoring order with price drop tracking enabled:`);
            if (options.priceDropThreshold) {
              console.log(`- Absolute price drop threshold: ${priceDropSettings.absolute} ${quoteCurrency}`);
            }
            if (options.priceDropThresholdPercentage) {
              console.log(`- Percentage price drop threshold: ${priceDropSettings.percentage}%`);
            }
            
            monitorResult = await monitorOrderWithPriceTracking(
              symbol, 
              orderId, 
              parseFloat(buyPrice), 
              priceDropSettings
            );
          } else {
            // Regular order monitoring without price tracking
            const monitorArgs = [
              'order-monitor.js',
              '--orderId', orderId,
              '--symbol', symbol
            ];
            
            monitorResult = await executeCommand('node', monitorArgs);
          }
          
          // Check if order was filled
          const filledMatch = monitorResult.stdout.match(/Status: FILLED/i);
          if (filledMatch) {
            console.log('\nSell order has been filled!');
            tradeData.status = 'FILLED';
          } else {
            console.log('\nOrder monitoring completed but order may not be filled');
            tradeData.status = 'UNKNOWN';
          }
        } else {
          console.log('[DRY RUN] Would monitor order until filled');
          tradeData.status = 'SIMULATED';
        }
      } else {
        console.warn('Could not extract order ID from output');
        tradeData.status = 'FAILED';
      }
      
      // Save trade history
      saveToHistory(tradeData);
      
      // Refresh account balance after trade
      if (!options.skipBalanceCheck) {
        console.log(`\nRefreshing account balance after trade...`);
        try {
          const balanceResult = await executeCommand('node', [
            'account-info.js',
            '--balance'
          ]);
          
          // Extract BTC balance
          const btcMatch = balanceResult.stdout.match(/BTC\s+\|\s+([0-9.]+)/);
          if (btcMatch) {
            const availableBtc = btcMatch[1];
            console.log(`Updated BTC balance: ${availableBtc}`);
            options.baseBalance = availableBtc;
          }
          
          // Extract USDT balance
          const usdtMatch = balanceResult.stdout.match(/USDT\s+\|\s+([0-9.]+)/);
          if (usdtMatch) {
            const availableUsdt = usdtMatch[1];
            console.log(`Updated USDT balance: ${availableUsdt}`);
            options.quoteBalance = availableUsdt;
          }
        } catch (error) {
          console.warn(`Error refreshing balance: ${error.message}`);
        }
      }
      
      // Increment cycle counter
      cycle++;
      
      // Break if we've reached the maximum number of cycles
      if (cycle > maxCycles) {
        break;
      }
      
      // Delay before next cycle
      if (logLevel !== 'minimal') {
        console.log(`\nWaiting ${delay / 1000} seconds before next cycle...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    console.log('\n=== Trading Loop Completed ===');
    console.log(`Completed ${cycle - 1} trading cycles`);
    console.log('=============================');
    
  } catch (error) {
    console.error('\nAn error occurred during trading loop:');
    console.error(error.message);
    
    // Try to save error to history
    const errorData = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    };
    
    const historyDir = path.join(process.cwd(), 'history');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir);
    }
    
    const errorFile = path.join(historyDir, `error_${new Date().toISOString().replace(/:/g, '-')}.json`);
    fs.writeFileSync(errorFile, JSON.stringify(errorData, null, 2));
    console.error(`Error details saved to: ${errorFile}`);
  }
}

// Run the trading loop
tradingLoop().catch(error => {
  console.error('An unexpected error occurred:', error);
});
