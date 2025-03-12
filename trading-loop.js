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
  
  if (profitSettings.type === 'fixed') {
    // Fixed profit amount in quote currency
    if (quantity) {
      // Calculate the price increase needed to achieve the target profit based on quantity
      const profitValue = parseFloat(profitSettings.value);
      const priceIncrease = profitValue / parseFloat(quantity);
      return (price + priceIncrease).toFixed(2);
    } else {
      // Fallback to simple addition if quantity is not provided
      return (price + parseFloat(profitSettings.value)).toFixed(2);
    }
  } else if (profitSettings.type === 'percent') {
    // Percentage profit
    const profitPercent = parseFloat(profitSettings.value) / 100;
    return (price * (1 + profitPercent)).toFixed(2);
  }
  
  // Default to fixed profit with quantity adjustment if available
  if (quantity) {
    const profitValue = parseFloat(profitSettings.value);
    const priceIncrease = profitValue / parseFloat(quantity);
    return (price + priceIncrease).toFixed(2);
  } else {
    return (price + parseFloat(profitSettings.value)).toFixed(2);
  }
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
      console.log('  --cycles          Number of trading cycles to run (default: infinite)');
      console.log('  --delay           Delay between cycles in seconds (default: 5)');
      console.log('  --skipBalanceCheck Skip checking account balance before trading (default: false)');
      console.log('  --config          Path to JSON configuration file');
      console.log('  --saveConfig      Save current parameters to config file (default: false)');
      console.log('  --configPath      Path to save configuration (default: ./trading-config.json)');
      console.log('  --logLevel        Logging level: minimal, normal, verbose (default: normal)');
      console.log('  --dryRun          Simulate trading without placing real orders (default: false)');
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
    const buyAmount = options.buyAmount || '10';
    const maxCycles = options.cycles ? parseInt(options.cycles) : Infinity;
    const delay = options.delay ? parseInt(options.delay) * 1000 : 5000;
    const skipBalanceCheck = options.skipBalanceCheck || false;
    const dryRun = options.dryRun || false;
    const logLevel = options.logLevel || 'normal';
    
    // Extract quote currency (e.g., USDT) and base currency (e.g., BTC) from symbol
    const quoteCurrency = symbol.replace(/BTC|ETH|BNB|XRP|ADA|DOT|SOL|DOGE|AVAX|MATIC/, '');
    const baseCurrency = symbol.replace(quoteCurrency, '');
    
    // Set up profit settings
    const profitSettings = {
      type: options.profitPercent ? 'percent' : 'fixed',
      value: options.profitPercent || options.profit || '0.001'
    };
    
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
      
      // Extract quote currency balance from output
      const quoteMatch = new RegExp(`${quoteCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
      if (quoteMatch) {
        const quoteBalance = parseFloat(quoteMatch[1]);
        console.log(`Available ${quoteCurrency} balance: ${quoteBalance}`);
        
        // Check if we have enough quote currency
        if (quoteBalance < parseFloat(buyAmount)) {
          console.log(`Insufficient ${quoteCurrency} balance. Required: ${buyAmount}, Available: ${quoteBalance}`);
          console.log(`Will try to use existing ${baseCurrency} balance instead.`);
          options.skipBuyStep = true;
        }
      } else {
        console.log(`Could not determine ${quoteCurrency} balance. Proceeding anyway...`);
      }
      
      // Extract base currency balance from output
      const baseMatch = new RegExp(`${baseCurrency}\\s+\\|\\s+([0-9.]+)`).exec(balanceResult.stdout);
      if (baseMatch) {
        const baseBalance = parseFloat(baseMatch[1]);
        console.log(`Available ${baseCurrency} balance: ${baseBalance}`);
        
        // Store base currency balance for later use
        options.baseBalance = baseBalance;
        
        // If we need to skip buy step due to insufficient quote currency, check if we have enough base currency
        if (options.skipBuyStep) {
          const minBaseQuantity = 0.00009; // Minimum quantity to trade
          if (baseBalance < minBaseQuantity) {
            throw new Error(`Insufficient ${baseCurrency} balance for trading. Required: ${minBaseQuantity}, Available: ${baseBalance}`);
          }
        }
      } else {
        console.log(`Could not determine ${baseCurrency} balance. Proceeding anyway...`);
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
      
      if (logLevel !== 'minimal') {
        console.log('\nStep 2: Creating sell order');
        console.log(`Buy Price: ${buyPrice} ${quoteCurrency}`);
        console.log(`Sell Price: ${sellPrice} ${quoteCurrency}`);
        
        if (stopLossSettings.enabled) {
          console.log(`Stop Loss Price: ${stopLossPrice} ${quoteCurrency}`);
        }
        
        // Show order prediction
        console.log('\nOrder Prediction:');
        const predictionArgs = [
          'order-prediction.js',
          '--symbol', symbol,
          '--price', sellPrice,
          '--side', 'SELL',
          '--quantity', roundedQuantity.toFixed(5)
        ];
        
        await executeCommand('node', predictionArgs);
      } else {
        console.log(`Buy: ${buyPrice} → Sell: ${sellPrice} ${stopLossSettings.enabled ? `(Stop: ${stopLossPrice})` : ''}`);
      }
      
      // Step 3: Create limit sell order
      // Round quantity down to 5 decimal places to comply with Binance LOT_SIZE filter
      // and ensure we don't exceed available balance
      const roundedQuantity = Math.floor(parseFloat(buyQuantity) * 100000) / 100000;
      
      const sellArgs = [
        'order-trade.js',
        '--symbol', symbol,
        '--side', 'SELL',
        '--quantity', roundedQuantity.toFixed(5),
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
      
      if (!dryRun) {
        sellArgs.push('--confirm');
      } else {
        console.log('[DRY RUN] Would execute sell order');
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
          const monitorArgs = [
            'order-monitor.js',
            '--orderId', orderId,
            '--symbol', symbol
          ];
          
          const monitorResult = await executeCommand('node', monitorArgs);
          
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
