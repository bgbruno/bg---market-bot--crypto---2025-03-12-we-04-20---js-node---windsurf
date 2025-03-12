# Binance Trading Bot

Komplexný nástroj na príkazovom riadku pre obchodovanie a správu objednávok na burze Binance.

## Obsah

- [Inštalácia](#inštalácia)
- [Konfigurácia](#konfigurácia)
- [Dostupné príkazy](#dostupné-príkazy)
  - [account-info](#account-info)
  - [exchange-info](#exchange-info)
  - [order](#order)
  - [order-monitor](#order-monitor)
  - [orders-download](#orders-download)
  - [order-trade](#order-trade)
  - [order-cancel](#order-cancel)
  - [market-buy](#market-buy)
  - [market-price](#market-price)
  - [trading-loop](#trading-loop)
- [Bezpečnostné poznámky](#bezpečnostné-poznámky)
- [Licencia](#licencia)

## Inštalácia

1. Uistite sa, že máte nainštalovaný Node.js
2. Nainštalujte závislosti:
   ```
   npm install
   ```
3. Upravte konfiguračný súbor s vašimi API kľúčmi Binance

## Konfigurácia

Vytvorte súbor `config.js` s nasledujúcim obsahom:

```javascript
module.exports = {
  apiKey: 'VÁŠ_API_KĽÚČ',
  apiSecret: 'VÁŠ_API_SECRET',
  baseUrl: 'https://api.binance.com',
  wsBaseUrl: 'wss://stream.binance.com:9443'
};
```

Pre testovanie môžete použiť testovacie prostredie Binance:

```javascript
module.exports = {
  apiKey: 'VÁŠ_TESTOVACÍ_API_KĽÚČ',
  apiSecret: 'VÁŠ_TESTOVACÍ_API_SECRET',
  baseUrl: 'https://testnet.binance.vision',
  wsBaseUrl: 'wss://testnet.binance.vision'
};
```

## Dostupné príkazy

Všetky príkazy je možné spustiť buď priamo, alebo prostredníctvom rozhrania `app.js`:

```
node app.js <príkaz> [parametre]
```

### account-info

Získa informácie o účte a zostatkoch.

**Použitie:**
```
node app.js account-info
node app.js account-info --min-balance 10
```

**Parametre:**
- `--min-balance` - Minimálny zostatok pre zobrazenie (predvolené: 0)

**Príklad výstupu:**
```
Binance Account Information
---------------------------
Account Status: ACTIVE
Maker Commission: 0.1%
Taker Commission: 0.1%

Balances:
BTC: 0.12345678 (Available: 0.12345678)
ETH: 1.23456789 (Available: 1.23456789)
USDT: 1000.00 (Available: 950.00)
```

### exchange-info

Získa informácie o burze a obchodných pároch.

**Použitie:**
```
node app.js exchange-info
node app.js exchange-info --symbols BTCUSDT,ETHUSDT
```

**Parametre:**
- `--symbols` - Čiarkou oddelený zoznam symbolov na filtrovanie (voliteľné)

**Príklad výstupu:**
```
Binance Exchange Information
---------------------------
Exchange Status: NORMAL
Timezone: UTC
Server Time: 2025-03-12T11:39:31.000Z

Trading Pairs:
BTCUSDT:
  Status: TRADING
  Base Asset: BTC (Precision: 8)
  Quote Asset: USDT (Precision: 8)
  Min Notional: 10.00000000
  Min Quantity: 0.00000100
  Price Precision: 2
```

### order

Získa informácie o konkrétnej objednávke.

**Použitie:**
```
node app.js order --symbol BTCUSDT --orderId 123456789
node app.js order --symbol ETHUSDT --clientOrderId myOrder123
node app.js order --orderId 123456789 --save
```

**Parametre:**
- `--symbol` - Symbol obchodného páru (povinné pre priame vyhľadávanie)
- `--orderId` - ID objednávky na vyhľadanie (povinné, ak nie je zadané clientOrderId)
- `--clientOrderId` - ID klientskej objednávky na vyhľadanie (povinné, ak nie je zadané orderId)
- `--save` - Uložiť detaily objednávky do súboru

**Príklad výstupu:**
```
Order Information
---------------------------
Symbol: BTCUSDT
Order ID: 123456789
Client Order ID: myOrder123
Status: FILLED
Type: LIMIT
Side: BUY
Price: 50000.00
Quantity: 0.001
Executed Quantity: 0.001
Cummulative Quote Quantity: 50.00
Time In Force: GTC
Time: 2025-03-12T11:39:31.000Z
```

### order-monitor

Monitoruje objednávku, kým nie je vyplnená.

**Použitie:**
```
node app.js order-monitor --symbol BTCUSDT --orderId 123456789
node app.js order-monitor --symbol ETHUSDT --clientOrderId myOrder123 --save
node app.js order-monitor --symbol BTCUSDT --orderId 123456789 --save "./data/orders"
```

**Parametre:**
- `--symbol` - Symbol obchodného páru (povinné)
- `--orderId` - ID objednávky na sledovanie (povinné, ak nie je zadané clientOrderId)
- `--clientOrderId` - ID klientskej objednávky na sledovanie (povinné, ak nie je zadané orderId)
- `--save` - Uložiť detaily objednávky do súboru po vyplnení. Môžete zadať cestu: `--save "./data/orders"`

**Príklad výstupu:**
```
Monitoring order BTCUSDT-123456789...
Connecting to WebSocket...
Connected! Waiting for order updates...
Order partially filled: 0.0005 BTC at 50000.00 USDT
Order filled: 0.001 BTC at 50000.00 USDT
Total execution: 0.001 BTC for 50.00 USDT
Order details saved to: ./data/orders/BTCUSDT-123456789.json
```

### orders-download

Stiahne históriu objednávok a uloží ich do formátu CSV, SQLite alebo JSON.

**Použitie:**
```
node app.js orders-download --symbol BTCUSDT --format csv
node app.js orders-download --symbol ETHUSDT --start "2023-01-01" --end "2023-12-31" --format sqlite
node app.js orders-download --symbol BTCUSDT --format json --output ./data
```

**Parametre:**
- `-s, --symbol` - Symbol obchodného páru (napr. BTCUSDT)
- `-f, --start` - Počiatočný dátum (napr. "2023-01-01")
- `-t, --end` - Koncový dátum (napr. "2023-12-31")
- `-l, --limit` - Počet objednávok na stiahnutie (predvolené: 500, max: 1000)
- `-o, --format` - Výstupný formát: 'csv', 'sqlite' alebo 'json' (predvolené: csv)
- `-p, --output` - Výstupná cesta (predvolené: ./orders)

**Príklad výstupu:**
```
Downloading orders for BTCUSDT...
Found 125 orders between 2023-01-01 and 2023-12-31
Saving to CSV file: ./orders/BTCUSDT_2023-01-01_2023-12-31_2025-03-12T11-39-31.csv
Done! Orders saved successfully.
```

### order-trade

Vytvorí a spravuje obchodné objednávky.

**Použitie:**
```
node app.js order-trade --symbol BTCUSDT --side BUY --quantity 0.001 --price 50000
node app.js order-trade --symbol BTCUSDT --side SELL --quantity 0.001 --market
node app.js order-trade --symbol BTCUSDT --side BUY --quoteOrderQty 50 --market
node app.js order-trade --symbol BTCUSDT --side SELL --quantity 0.001 --takeProfit 5
```

**Parametre:**
- `--symbol` - Symbol obchodného páru (povinné)
- `--side` - Strana objednávky: BUY alebo SELL (povinné)
- `--quantity` - Množstvo v základnej mene (napr. BTC)
- `--quoteOrderQty` - Množstvo v kótovanej mene (napr. USDT) - iba pre MARKET objednávky
- `--price` - Cena pre LIMIT objednávky
- `--market` - Vytvoriť MARKET objednávku (predvolené je LIMIT, ak je zadaná cena)
- `--stopPrice` - Stop cena pre STOP_LOSS objednávky
- `--takeProfit` - Percentuálny cieľ zisku (napr. 5 pre 5% zisk)

**Príklad výstupu:**
```
Creating order...
Order created successfully!
Symbol: BTCUSDT
Order ID: 123456789
Client Order ID: myOrder123
Status: NEW
Type: LIMIT
Side: BUY
Price: 50000.00
Quantity: 0.001
Time In Force: GTC
```

### order-cancel

Zruší existujúcu objednávku.

**Použitie:**
```
node app.js order-cancel --symbol BTCUSDT --orderId 123456789
node app.js order-cancel --symbol ETHUSDT --clientOrderId myOrder123
```

**Parametre:**
- `--symbol` - Symbol obchodného páru (povinné)
- `--orderId` - ID objednávky na zrušenie (povinné, ak nie je zadané clientOrderId)
- `--clientOrderId` - ID klientskej objednávky na zrušenie (povinné, ak nie je zadané orderId)

**Príklad výstupu:**
```
Cancelling order...
Order cancelled successfully!
Symbol: BTCUSDT
Order ID: 123456789
Status: CANCELED
```

### market-buy

Vytvorí trhový nákupný príkaz s presnou sumou v quote mene (napr. USDT).

**Použitie:**
```
node app.js market-buy --symbol BTCUSDT --amount 10
node app.js market-buy --symbol ETHUSDT --amount 50 --confirm
```

**Parametre:**
- `--symbol` - Symbol obchodného páru (povinné)
- `--amount` - Suma v quote mene na nákup (povinné)
- `--confirm` - Potvrdenie vykonania objednávky (bez tohto parametra sa zobrazí len náhľad)

**Príklad výstupu:**
```
Buying BTC with USDT
--------------------------------------------------
Symbol:           BTCUSDT
Current Price:    82669.98 USDT
Amount to Spend:  10 USDT
Estimated Qty:    0.00012096 BTC

Executing market buy order...

Order Information:
--------------------------------------------------
Symbol:       BTCUSDT
Order ID:     39281216690
Type:         MARKET
Side:         BUY
Quantity:     0.00012000
Executed:     0.00012000 (100.00%)
Status:       FILLED

Fill Information:
--------------------------------------------------
Total Quantity:    0.00012
Average Price:     82669.98000000
Total Cost:        9.92039760
Total Commission:  0.00000012 BTC
```

### market-price

Získa aktuálnu trhovú cenu pre daný symbol.

**Použitie:**
```
node app.js market-price --symbol BTCUSDT
```

**Parametre:**
- `--symbol` - Symbol obchodného páru (povinné)

**Príklad výstupu:**
```
Current price for BTCUSDT:
Current price: 82788.93000000
```

### trading-loop

Automatizovaný obchodný cyklus, ktorý nakupuje a predáva kryptomenu s cieľovým ziskom.

**Použitie:**
```
node app.js trading-loop --buyAmount 10 --profit 0.001 --cycles 3
node app.js trading-loop --buyAmount 8 --profit 0.002 --cycles 1 --skipBalanceCheck
```

**Parametre:**
- `--buyAmount` - Suma v USDT na nákup (predvolené: 10)
- `--profit` - Cieľový zisk v USDT (predvolené: 0.001)
- `--cycles` - Počet obchodných cyklov (predvolené: 1)
- `--delay` - Oneskorenie medzi cyklami v sekundách (predvolené: 5)
- `--skipBalanceCheck` - Preskočiť kontrolu zostatku (voliteľné)
- `--forceBuy` - Vynútiť nákup BTC aj keď je dostatok BTC na predaj (voliteľné)

**Funkcionality:**
- Kontrola zostatku USDT a BTC pred obchodovaním
- Automatické použitie existujúceho BTC zostatku, ak nie je dostatok USDT
- Presný výpočet cieľovej ceny predaja pre požadovaný zisk
- Monitorovanie predajnej objednávky až do jej vyplnenia
- Detailné záznamy o každom obchodnom cykle

**Príklad výstupu:**
```
=== Trading Loop Started ===
Symbol: BTCUSDT
Buy Amount: 10 USDT
Profit Target: 0.001 USDT
Max Cycles: 1
Delay Between Cycles: 5 seconds
Skip Balance Check: false
============================

Checking account balance...
Available USDT balance: 0.69460247
Insufficient USDT balance. Required: 10, Available: 0.69460247
Will try to use existing BTC balance instead.
Available BTC balance: 0.00072959

================================================================================
=== CYCLE 1 === STARTED AT: 19:48:51 ===
================================================================================

Skipping buy step - using existing BTC balance: 0.00072959
Current price: 82788.93000000

Step 2: Creating sell order with profit target...
Creating take profit order for BTCUSDT
Buy price: 82788.93
Profit amount: 0.001 USDT (net after fees)
Target price: 82964.68000000 (0.21% profit)

Step 3: Showing order prediction...
Order Prediction:
--------------------------------------------------
Symbol:       BTCUSDT
Order ID:     39281255489
Type:         LIMIT
Side:         SELL
Price:        82964.68000000
Current Price: 82794.67
Price Diff:   0.21%
Status:       NEW

Expected Profit:
Gross Profit: 0.0170 USDT
Net Profit:   0.0004 USDT
Percentage:   0.01%

Step 4: Monitoring order until filled...
```

## Bezpečnostné poznámky

1. Váš API kľúč by mal mať iba "read-only" oprávnenia pre bezpečnosť, pokiaľ aktívne neobchodujete.
2. Nikdy nezdieľajte svoje API poverenia.
3. Odporúča sa používať testovacie prostredie Binance pre testovanie pred použitím reálnych finančných prostriedkov.

## Licencia

Tento projekt je licencovaný pod exkluzívnou licenciou - pozrite si súbor [LICENSE.md](LICENSE.md) pre podrobnosti.

 2025 BG Bruno, BG Studio One. Všetky práva vyhradené.
