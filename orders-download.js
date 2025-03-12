#!/usr/bin/env node

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const sqlite3 = require('sqlite3').verbose();

// Import config if it exists
let config;
try {
  config = require('./config');
} catch (error) {
  console.error('Config file not found. Please create a config.js file with apiKey, apiSecret, and baseUrl.');
  process.exit(1);
}

// Default parameters
const DEFAULT_PARAMS = {
  symbol: null,     // Optional: specific trading pair
  startTime: null,  // Optional: start time in milliseconds
  endTime: null,    // Optional: end time in milliseconds
  limit: 500,       // Default: 500 (max allowed by Binance)
  format: 'csv',    // Default output format: 'csv', 'sqlite', or 'json'
  output: './orders' // Default output path
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const params = { ...DEFAULT_PARAMS };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (arg === '--symbol' || arg === '-s') {
      params.symbol = args[++i];
    } else if (arg === '--start' || arg === '-f') {
      params.startTime = new Date(args[++i]).getTime();
      if (isNaN(params.startTime)) {
        console.error(`Invalid start time: ${args[i]}`);
        process.exit(1);
      }
    } else if (arg === '--end' || arg === '-t') {
      params.endTime = new Date(args[++i]).getTime();
      if (isNaN(params.endTime)) {
        console.error(`Invalid end time: ${args[i]}`);
        process.exit(1);
      }
    } else if (arg === '--limit' || arg === '-l') {
      params.limit = parseInt(args[++i], 10);
      if (isNaN(params.limit) || params.limit <= 0) {
        console.error(`Invalid limit: ${args[i]}`);
        process.exit(1);
      }
    } else if (arg === '--format' || arg === '-o') {
      const format = args[++i].toLowerCase();
      if (format !== 'csv' && format !== 'sqlite' && format !== 'json') {
        console.error(`Invalid format: ${format}. Must be 'csv', 'sqlite', or 'json'`);
        process.exit(1);
      }
      params.format = format;
    } else if (arg === '--output' || arg === '-p') {
      params.output = args[++i];
    }
  }

  return params;
}

// Show help information
function showHelp() {
  console.log(`
Usage: node orders-download.js [OPTIONS]

Options:
  -h, --help                Show this help message
  -s, --symbol SYMBOL       Trading pair symbol (e.g., BTCUSDT)
  -f, --start DATE          Start date (e.g., "2023-01-01")
  -t, --end DATE            End date (e.g., "2023-12-31")
  -l, --limit NUMBER        Number of orders to fetch (default: 500, max: 1000)
  -o, --format FORMAT       Output format: 'csv', 'sqlite', or 'json' (default: csv)
  -p, --output PATH         Output path (default: ./orders)

Examples:
  node orders-download.js --symbol BTCUSDT --format csv
  node orders-download.js --symbol ETHUSDT --start "2023-01-01" --end "2023-12-31" --format sqlite
  node orders-download.js --symbol BTCUSDT --format json --output ./data
  `);
}

// Create Binance API signature
function createSignature(queryString, apiSecret) {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}

// Fetch orders from Binance API
async function fetchOrders(params) {
  const { apiKey, apiSecret, baseUrl } = config;
  const endpoint = '/api/v3/allOrders';
  
  // Build query parameters
  const queryParams = new URLSearchParams();
  if (params.symbol) queryParams.append('symbol', params.symbol);
  if (params.startTime) queryParams.append('startTime', params.startTime);
  if (params.endTime) queryParams.append('endTime', params.endTime);
  if (params.limit) queryParams.append('limit', params.limit);
  
  // Add timestamp for signature
  queryParams.append('timestamp', Date.now());
  
  // Create signature
  const signature = createSignature(queryParams.toString(), apiSecret);
  queryParams.append('signature', signature);
  
  // Make API request
  try {
    const response = await axios.get(`${baseUrl}${endpoint}?${queryParams.toString()}`, {
      headers: {
        'X-MBX-APIKEY': apiKey
      }
    });
    
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error(`Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// Save orders to CSV file
async function saveToCSV(orders, outputPath, symbol) {
  if (!orders || orders.length === 0) {
    console.log('No orders to save.');
    return;
  }
  
  // Create output directory if it doesn't exist
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Define CSV file path with date and time
  const now = new Date();
  const dateTimeStr = now.toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
  
  const fileName = symbol ? 
    `${outputPath}_${symbol}_${dateTimeStr}.csv` : 
    `${outputPath}_all_${dateTimeStr}.csv`;
  
  // Define CSV header
  const csvWriter = createObjectCsvWriter({
    path: fileName,
    header: [
      { id: 'symbol', title: 'Symbol' },
      { id: 'orderId', title: 'Order ID' },
      { id: 'orderListId', title: 'Order List ID' },
      { id: 'clientOrderId', title: 'Client Order ID' },
      { id: 'price', title: 'Price' },
      { id: 'origQty', title: 'Original Quantity' },
      { id: 'executedQty', title: 'Executed Quantity' },
      { id: 'cummulativeQuoteQty', title: 'Cumulative Quote Quantity' },
      { id: 'status', title: 'Status' },
      { id: 'timeInForce', title: 'Time In Force' },
      { id: 'type', title: 'Type' },
      { id: 'side', title: 'Side' },
      { id: 'stopPrice', title: 'Stop Price' },
      { id: 'icebergQty', title: 'Iceberg Quantity' },
      { id: 'time', title: 'Time' },
      { id: 'updateTime', title: 'Update Time' },
      { id: 'isWorking', title: 'Is Working' },
      { id: 'origQuoteOrderQty', title: 'Original Quote Order Quantity' }
    ]
  });
  
  // Format dates in orders
  const formattedOrders = orders.map(order => {
    return {
      ...order,
      time: new Date(order.time).toISOString(),
      updateTime: new Date(order.updateTime).toISOString()
    };
  });
  
  // Write to CSV
  await csvWriter.writeRecords(formattedOrders);
  console.log(`CSV file saved to: ${fileName}`);
  console.log(`Total orders saved: ${orders.length}`);
}

// Save orders to SQLite database
async function saveToSQLite(orders, outputPath, symbol) {
  if (!orders || orders.length === 0) {
    console.log('No orders to save.');
    return;
  }
  
  // Create output directory if it doesn't exist
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Define SQLite database file path with date and time
  const now = new Date();
  const dateTimeStr = now.toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
  
  const dbFileName = symbol ? 
    `${outputPath}_${symbol}_${dateTimeStr}.db` : 
    `${outputPath}_all_${dateTimeStr}.db`;
  
  // Create and connect to SQLite database
  const db = new sqlite3.Database(dbFileName);
  
  // Create orders table
  const createTablePromise = new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        symbol TEXT,
        orderId INTEGER PRIMARY KEY,
        orderListId INTEGER,
        clientOrderId TEXT,
        price TEXT,
        origQty TEXT,
        executedQty TEXT,
        cummulativeQuoteQty TEXT,
        status TEXT,
        timeInForce TEXT,
        type TEXT,
        side TEXT,
        stopPrice TEXT,
        icebergQty TEXT,
        time INTEGER,
        updateTime INTEGER,
        isWorking INTEGER,
        origQuoteOrderQty TEXT,
        time_iso TEXT,
        updateTime_iso TEXT
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Insert orders into database
  const insertOrdersPromise = createTablePromise.then(() => {
    return new Promise((resolve, reject) => {
      // Begin transaction
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Prepare insert statement
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO orders (
            symbol, orderId, orderListId, clientOrderId, price, origQty, executedQty,
            cummulativeQuoteQty, status, timeInForce, type, side, stopPrice, icebergQty,
            time, updateTime, isWorking, origQuoteOrderQty, time_iso, updateTime_iso
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        // Insert each order
        orders.forEach(order => {
          stmt.run(
            order.symbol,
            order.orderId,
            order.orderListId,
            order.clientOrderId,
            order.price,
            order.origQty,
            order.executedQty,
            order.cummulativeQuoteQty,
            order.status,
            order.timeInForce,
            order.type,
            order.side,
            order.stopPrice,
            order.icebergQty,
            order.time,
            order.updateTime,
            order.isWorking ? 1 : 0,
            order.origQuoteOrderQty,
            new Date(order.time).toISOString(),
            new Date(order.updateTime).toISOString()
          );
        });
        
        // Finalize statement
        stmt.finalize();
        
        // Commit transaction
        db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  });
  
  // Wait for database operations to complete
  try {
    await insertOrdersPromise;
    console.log(`SQLite database saved to: ${dbFileName}`);
    console.log(`Total orders saved: ${orders.length}`);
  } catch (error) {
    console.error(`Error saving to SQLite: ${error.message}`);
  } finally {
    // Close database connection
    db.close();
  }
}

// Save orders to JSON file
async function saveToJSON(orders, outputPath, symbol) {
  if (!orders || orders.length === 0) {
    console.log('No orders to save.');
    return;
  }
  
  // Create output directory if it doesn't exist
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Define JSON file path with date and time
  const now = new Date();
  const dateTimeStr = now.toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];
  
  const fileName = symbol ? 
    `${outputPath}_${symbol}_${dateTimeStr}.json` : 
    `${outputPath}_all_${dateTimeStr}.json`;
  
  // Format dates in orders
  const formattedOrders = orders.map(order => {
    return {
      ...order,
      time_iso: new Date(order.time).toISOString(),
      updateTime_iso: new Date(order.updateTime).toISOString()
    };
  });
  
  // Write to JSON file
  fs.writeFileSync(fileName, JSON.stringify(formattedOrders, null, 2));
  console.log(`JSON file saved to: ${fileName}`);
  console.log(`Total orders saved: ${orders.length}`);
}

// Main function
async function main() {
  // Parse command line arguments
  const params = parseArgs();
  
  // Fetch orders from Binance API
  console.log('Fetching orders from Binance API...');
  console.log(`Parameters: ${JSON.stringify(params, null, 2)}`);
  
  const orders = await fetchOrders(params);
  console.log(`Fetched ${orders.length} orders.`);
  
  // Save orders to specified format
  if (params.format === 'csv') {
    await saveToCSV(orders, params.output, params.symbol);
  } else if (params.format === 'sqlite') {
    await saveToSQLite(orders, params.output, params.symbol);
  } else if (params.format === 'json') {
    await saveToJSON(orders, params.output, params.symbol);
  }
}

// Run main function
main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
