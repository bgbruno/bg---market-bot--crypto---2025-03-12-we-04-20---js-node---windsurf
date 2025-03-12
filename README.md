# Binance Orders Fetcher

This script fetches all orders from your Binance account using the Binance API.

## Setup

1. Make sure you have Node.js installed
2. Install dependencies:
   ```
   npm install
   ```
3. Edit `get_binance_orders.js` and replace `YOUR_API_KEY` and `YOUR_API_SECRET` with your Binance API credentials
4. By default, the script fetches orders for BTC, ETH, and BNB trading pairs. You can modify the `symbols` array in the script to include other trading pairs.

## Usage

Run the script with:

```
node get_binance_orders.js
```

Or use the npm script:

```
npm start
```

## Output

The script will:
1. Fetch orders for each specified trading pair
2. Display a summary of the orders found
3. Save all orders to a JSON file with a timestamp in the filename
4. Show a sample of the orders in the console

## Security Note

Your API key should have "read-only" permissions for security. Never share your API credentials.
