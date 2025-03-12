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
}

// Main trading loop
async function tradingLoop() {
  try {
    const args = parseArgs();
    
    // Show help if --help flag is provided
    if (args.help || args.h) {
      console.log('\nTrading Loop\n');
      console.log('Description: Create a complete trading loop that buys and sells BTC with a profit target\n');
      console.log('Usage:');
      console.log('  node trading-loop.js --buyAmount 10 --profit 0.001 --cycles 3\n');
      console.log('Parameters:');
      console.log('  --symbol          Trading pair symbol (default: BTCUSDT)');
      console.log('  --buyAmount       Amount to spend in USDT for buying BTC (default: 10)');
      console.log('  --profit          Target profit amount in USDT (default: 0.001)');
      console.log('  --cycles          Number of trading cycles to run (default: infinite)');
      console.log('  --delay           Delay between cycles in seconds (default: 5)');
      console.log('  --skipBalanceCheck Skip checking account balance before trading (default: false)');
      return;
    }
    
    // Set default parameters
    const symbol = args.symbol || 'BTCUSDT';
    const buyAmount = args.buyAmount || '10';
    const profit = args.profit || '0.001';
    const maxCycles = args.cycles ? parseInt(args.cycles) : Infinity;
    const delay = args.delay ? parseInt(args.delay) * 1000 : 5000;
    const skipBalanceCheck = args.skipBalanceCheck || false;
    
    console.log('\n=== Trading Loop Started ===');
    console.log(`Symbol: ${symbol}`);
    console.log(`Buy Amount: ${buyAmount} USDT`);
    console.log(`Profit Target: ${profit} USDT`);
    console.log(`Max Cycles: ${maxCycles === Infinity ? 'Infinite' : maxCycles}`);
    console.log(`Delay Between Cycles: ${delay / 1000} seconds`);
    console.log(`Skip Balance Check: ${skipBalanceCheck}`);
    console.log('============================\n');
    
    // Check account balance if not skipped
    if (!skipBalanceCheck) {
      console.log('Checking account balance...');
      const balanceResult = await executeCommand('node', [
        'account-info.js',
        '--balance'
      ]);
      
      // Extract USDT balance from output
      const usdtMatch = balanceResult.stdout.match(/USDT\s+\|\s+([0-9.]+)/);
      if (usdtMatch) {
        const usdtBalance = parseFloat(usdtMatch[1]);
        console.log(`Available USDT balance: ${usdtBalance}`);
        
        // Check if we have enough USDT
        if (usdtBalance < parseFloat(buyAmount)) {
          console.log(`Insufficient USDT balance. Required: ${buyAmount}, Available: ${usdtBalance}`);
          console.log('Will try to use existing BTC balance instead.');
          args.skipBuyStep = true;
        }
      } else {
        console.log('Could not determine USDT balance. Proceeding anyway...');
      }
      
      // Extract BTC balance from output
      const btcMatch = balanceResult.stdout.match(/BTC\s+\|\s+([0-9.]+)/);
      if (btcMatch) {
        const btcBalance = parseFloat(btcMatch[1]);
        console.log(`Available BTC balance: ${btcBalance}`);
        
        // Store BTC balance for later use
        args.btcBalance = btcBalance;
        
        // If we need to skip buy step due to insufficient USDT, check if we have enough BTC
        if (args.skipBuyStep) {
          const minBtcQuantity = 0.00009; // Minimum quantity to trade
          if (btcBalance < minBtcQuantity) {
            throw new Error(`Insufficient BTC balance for trading. Required: ${minBtcQuantity}, Available: ${btcBalance}`);
          }
        }
      } else {
        console.log('Could not determine BTC balance. Proceeding anyway...');
      }
    }
    
    let cycle = 1;
    
    while (cycle <= maxCycles) {
      // Create a timestamp in readable format
      const timestamp = new Date();
      const formattedTime = timestamp.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      });
      
      // Create a full-width underline for better visibility
      const fullWidthLine = '='.repeat(80);
      
      console.log(`\n${fullWidthLine}`);
      console.log(`=== CYCLE ${cycle} === STARTED AT: ${formattedTime} ===`);
      console.log(`${fullWidthLine}\n`);
      
      const startTime = new Date();
      
      // Define minimum BTC quantity for trading (adjust as needed)
      const minBtcQuantity = 0.00009; // Minimum quantity to trade
      let quantity;
      let buyPrice;
      
      // Check if we have enough BTC to skip the buy step
      if ((args.skipBuyStep || (args.btcBalance && args.btcBalance >= minBtcQuantity)) && !args.forceBuy) {
        console.log(`\nSkipping buy step - using existing BTC balance: ${args.btcBalance}`);
        
        // Use available BTC balance (limited to a reasonable amount)
        quantity = Math.min(args.btcBalance, 0.0001).toFixed(5);
        
        // Get current price as buy price reference
        console.log('\nGetting current price as reference...');
        const priceResult = await executeCommand('node', [
          'market-price.js',
          '--symbol', symbol
        ]);
        
        // Extract current price
        const priceMatch = priceResult.stdout.match(/Current price:\s+([\d.]+)/i);
        if (priceMatch) {
          buyPrice = priceMatch[1];
          console.log(`Current price: ${buyPrice}`);
        } else {
          // Fallback to a default price query
          const response = await executeCommand('node', [
            'exchange-info.js',
            '--symbol', symbol,
            '--price'
          ]);
          
          const fallbackMatch = response.stdout.match(/Price:\s+([\d.]+)/i);
          buyPrice = fallbackMatch ? fallbackMatch[1] : '0';
          console.log(`Current price (fallback): ${buyPrice}`);
        }
        
        // Update BTC balance for next cycle
        args.btcBalance -= parseFloat(quantity);
      } else {
        // Step 1: Buy BTC with USDT using market order
        console.log('\nStep 1: Buying BTC with USDT...');
        const buyResult = await executeCommand('node', [
          'market-buy.js',
          '--symbol', symbol,
          '--amount', buyAmount,
          '--confirm'
        ]);
        
        // Extract the quantity of BTC bought
        quantity = extractBuyQuantity(buyResult.stdout);
        
        if (!quantity) {
          throw new Error('Could not extract bought quantity from output');
        }
        
        // Extract the actual buy price
        buyPrice = extractBuyPrice(buyResult.stdout);
        
        console.log(`\nBought ${quantity} BTC for ${buyAmount} USDT at price ${buyPrice || 'unknown'}`);
      }
      
      // Step 2: Create sell order with profit target
      console.log('\nStep 2: Creating sell order with profit target...');
      
      // Build command arguments
      const orderArgs = [
        'order-trade.js',
        '--symbol', symbol,
        '--side', 'SELL',
        '--quantity', quantity,
        '--takeProfitExplicit', profit,
        '--takeProfitSymbol', 'USDT'
      ];
      
      // Add buy price if available
      if (buyPrice) {
        orderArgs.push('--buyPrice', buyPrice);
      }
      
      const orderResult = await executeCommand('node', orderArgs);
      
      // Extract order ID
      const orderId = extractOrderId(orderResult.stdout);
      
      if (!orderId) {
        throw new Error('Could not extract order ID from output');
      }
      
      // Step 3: Show order prediction
      console.log('\nStep 3: Showing order prediction...');
      await executeCommand('node', [
        'order-prediction.js',
        '--symbol', symbol,
        '--orderId', orderId
      ]);
      
      // Step 4: Monitor order until filled
      console.log('\nStep 4: Monitoring order until filled...');
      await executeCommand('node', [
        'order-monitor.js',
        '--symbol', symbol,
        '--orderId', orderId,
        '--save'
      ]);
      
      // Calculate cycle duration
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000; // in seconds
      const endFormattedTime = endTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      });
      
      // Save trade history
      const tradeData = {
        cycle,
        symbol,
        buyAmount,
        quantity,
        profit,
        orderId,
        startTime: startTime.toISOString(),
        startTimeFormatted: formattedTime,
        endTime: endTime.toISOString(),
        endTimeFormatted: endFormattedTime,
        duration: `${duration.toFixed(2)} seconds`
      };
      
      saveToHistory(tradeData);
      
      console.log(`\n${fullWidthLine}`);
      console.log(`=== CYCLE ${cycle} === COMPLETED AT: ${endFormattedTime} ===`);
      console.log(`=== DURATION: ${duration.toFixed(2)} seconds ===`);
      console.log(`${fullWidthLine}`);
      
      // Wait before starting next cycle
      if (cycle < maxCycles) {
        console.log(`\nWaiting ${delay / 1000} seconds before starting next cycle...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      cycle++;
    }
    
    console.log('\n=== Trading Loop Completed ===');
    
  } catch (error) {
    console.error('\nError in trading loop:', error.message);
    process.exit(1);
  }
}

// Run the trading loop
tradingLoop().catch(error => {
  console.error('An unexpected error occurred:', error);
});
