/**
 * Exchange Info Module
 * 
 * This module provides functionality to fetch Binance exchange information
 * such as available trading pairs.
 */

const axios = require('axios');
const config = require('./config');

/**
 * Get all trading pairs from Binance
 * @returns {Promise<string[]>} Array of symbol names
 */
async function getExchangeInfo() {
  try {
    const response = await axios.get(`${config.baseUrl}/api/v3/exchangeInfo`);
    return response.data.symbols.map(symbol => symbol.symbol);
  } catch (error) {
    console.error('Error fetching exchange info:', error.response ? error.response.data : error.message);
    return [];
  }
}

// If this file is run directly (not imported as a module)
if (require.main === module) {
  // Run the main function
  (async () => {
    try {
      const args = process.argv.slice(2);
      
      // Show help if --help flag is provided
      if (args.includes('--help') || args.includes('-h')) {
        console.log('\nBinance Exchange Information\n');
        console.log('Description: Get exchange information and trading pairs\n');
        console.log('Usage:');
        console.log('  node exchange_info.js');
        console.log('  node exchange_info.js --symbols BTCUSDT,ETHUSDT\n');
        console.log('Parameters:');
        console.log('  --symbols         Comma-separated list of symbols to filter (optional)');
        console.log('\nAlternatively, you can use the app.js interface:');
        console.log('  node app.js exchange-info');
        return;
      }
      
      console.log('Fetching all trading pairs from Binance...');
      
      if (config.apiKey === 'YOUR_API_KEY' || config.apiSecret === 'YOUR_API_SECRET') {
        console.error('Warning: Using default API keys. Some functionality may be limited.');
      }
      
      try {
        const symbols = await getExchangeInfo();
        console.log(`\nFound ${symbols.length} trading pairs:`);
        
        // // Display symbols in a formatted way (5 per line)
        // const columns = 1;
        // for (let i = 0; i < symbols.length; i += columns) {
        //   const row = symbols.slice(i, i + columns);
        //   console.log(row.map(s => s.padEnd(12)).join(' '));
        // }
        
        // Display some statistics
        const btcPairs = symbols.filter(s => s.endsWith('BTC')).length;
        const usdtPairs = symbols.filter(s => s.endsWith('USDT')).length;
        const busdPairs = symbols.filter(s => s.endsWith('BUSD')).length;
        
        console.log(`\nStatistics:`);
        console.log(`- BTC pairs: ${btcPairs}`);
        console.log(`- USDT pairs: ${usdtPairs}`);
        console.log(`- BUSD pairs: ${busdPairs}`);
        
      } catch (error) {
        console.error('Error:', error.message);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  })();
}

module.exports = { getExchangeInfo };
