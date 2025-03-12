/**
 * Profit Calculator
 * 
 * This module calculates the expected profit from a trade,
 * taking into account buy price, sell price, and trading fees.
 */

/**
 * Calculate profit from a trade
 * @param {Object} options - Trade options
 * @param {number} options.buyPrice - Buy price
 * @param {number} options.sellPrice - Sell price
 * @param {number} options.quantity - Quantity of the asset
 * @param {number} options.buyFee - Buy fee rate (e.g., 0.001 for 0.1%)
 * @param {number} options.sellFee - Sell fee rate (e.g., 0.001 for 0.1%)
 * @returns {Object} Profit information
 */
function calculateProfit(options) {
  const {
    buyPrice,
    sellPrice,
    quantity,
    buyFee = 0.001,
    sellFee = 0.001
  } = options;
  
  // Calculate costs
  const totalBuyAmount = buyPrice * quantity;
  const buyFeeAmount = totalBuyAmount * buyFee;
  
  const totalSellAmount = sellPrice * quantity;
  const sellFeeAmount = totalSellAmount * sellFee;
  
  // Calculate profit
  const grossProfit = totalSellAmount - totalBuyAmount;
  const netProfit = grossProfit - buyFeeAmount - sellFeeAmount;
  const profitPercentage = (netProfit / totalBuyAmount) * 100;
  
  return {
    buyAmount: totalBuyAmount,
    sellAmount: totalSellAmount,
    buyFeeAmount,
    sellFeeAmount,
    totalFees: buyFeeAmount + sellFeeAmount,
    grossProfit,
    netProfit,
    profitPercentage
  };
}

/**
 * Calculate profit from an open order
 * @param {Object} order - Order information
 * @param {number} currentPrice - Current price of the asset
 * @param {number} buyFee - Buy fee rate (e.g., 0.001 for 0.1%)
 * @param {number} sellFee - Sell fee rate (e.g., 0.001 for 0.1%)
 * @returns {Object} Profit information
 */
function calculateOrderProfit(order, currentPrice, buyFee = 0.001, sellFee = 0.001) {
  // For a sell order, the buy price is the price at which the asset was acquired
  // If we don't know the buy price, we can use the current market price as an approximation
  const buyPrice = order.buyPrice || currentPrice;
  
  return calculateProfit({
    buyPrice,
    sellPrice: parseFloat(order.price),
    quantity: parseFloat(order.origQty),
    buyFee,
    sellFee
  });
}

/**
 * Format profit information for display
 * @param {Object} profitInfo - Profit information from calculateProfit
 * @param {string} symbol - Trading pair symbol
 * @returns {string} Formatted profit information
 */
function formatProfitInfo(profitInfo, symbol = 'BTCUSDT') {
  const baseAsset = symbol.slice(0, -4);
  const quoteAsset = symbol.slice(-4);
  
  return `
Profit Information:
  Buy Amount: ${profitInfo.buyAmount.toFixed(2)} ${quoteAsset}
  Sell Amount: ${profitInfo.sellAmount.toFixed(2)} ${quoteAsset}
  
  Buy Fee: ${profitInfo.buyFeeAmount.toFixed(4)} ${quoteAsset}
  Sell Fee: ${profitInfo.sellFeeAmount.toFixed(4)} ${quoteAsset}
  Total Fees: ${profitInfo.totalFees.toFixed(4)} ${quoteAsset}
  
  Gross Profit: ${profitInfo.grossProfit.toFixed(2)} ${quoteAsset}
  Net Profit: ${profitInfo.netProfit.toFixed(2)} ${quoteAsset}
  Profit Percentage: ${profitInfo.profitPercentage.toFixed(2)}%
`;
}

// Allow direct execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    buyPrice: parseFloat(args[0] || 30000),
    sellPrice: parseFloat(args[1] || 31000),
    quantity: parseFloat(args[2] || 0.01),
    buyFee: parseFloat(args[3] || 0.001),
    sellFee: parseFloat(args[4] || 0.001)
  };
  
  const profitInfo = calculateProfit(options);
  console.log(formatProfitInfo(profitInfo));
}

module.exports = {
  calculateProfit,
  calculateOrderProfit,
  formatProfitInfo
};
