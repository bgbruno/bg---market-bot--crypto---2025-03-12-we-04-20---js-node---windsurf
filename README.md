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
  - [orders-open](#orders-open)
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

### orders-open

Zobrazí všetky aktuálne otvorené objednávky na Binance.

**Použitie:**
```
node orders-open.js
node orders-open.js --symbol BTCUSDT
```

**Parametre:**
- `--symbol` - Symbol obchodného páru (voliteľné)
- `--help` - Zobrazí nápovedu

**Príklad výstupu:**
```
Fetching open orders for BTCUSDT...

Found 1 open order:
--------------------------------------------------
Symbol:       BTCUSDT
Order ID:     39281216690
Client ID:    web_1234567890
Type:         LIMIT
Side:         SELL
Price:        83830.51
Quantity:     0.00059000
Executed:     0.00000000 (0.00%)
Status:       NEW
Time:         12.3.2025, 23:45:12
```

### trading-loop

Automatizovaný obchodný cyklus, ktorý nakupuje a predáva kryptomenu s cieľovým ziskom.

**Použitie:**
```
node trading-loop.js --symbol BTCUSDT --buyAmount 10 --profit 0.01 --cycles 3
node trading-loop.js --symbol ETHUSDT --buyAmount 10 --profitPercent 0.5 --stopLoss 5 --cycles 1 --dryRun
node trading-loop.js --config config.json
node trading-loop.js --symbol BTCUSDT --buyAmount 10 --profit 0.01 --saveConfig config.json
```

**Parametre:**
- `--symbol` - Obchodný pár (predvolene BTCUSDT)
- `--buyAmount` - Suma na nákup v quote mene (predvolene 10)
- `--profit` - Cieľový zisk v quote mene (predvolene 0.001)
- `--profitPercent` - Alternatívne môžete zadať zisk ako percentuálnu hodnotu
- `--stopLoss` - Voliteľná stop-loss hodnota v quote mene
- `--stopLossPercent` - Alternatívne môžete zadať stop-loss ako percentuálnu hodnotu
- `--trailingStop` - Aktivuje trailing stop-loss (predvolene false)
- `--trailingPercent` - Vzdialenosť trailing stopu ako percento (predvolene 0.5%)
- `--cycles` - Počet obchodných cyklov (predvolene nekonečno)
- `--delay` - Oneskorenie medzi cyklami v sekundách (predvolene 5)
- `--skipBalanceCheck` - Preskočí kontrolu zostatku pred obchodovaním (predvolene false)
- `--dryRun` - Simuluje obchodovanie bez zadávania skutočných príkazov (predvolene false)
- `--logLevel` - Úroveň logovania: minimal, normal, verbose (predvolene normal)
- `--config` - Cesta k JSON konfiguračnému súboru
- `--saveConfig` - Uloží aktuálne parametre do konfiguračného súboru

**Funkcionality:**
- Kontrola zostatku účtu pred obchodovaním
- Automatické použitie existujúceho zostatku kryptomeny, ak je dostupný
- Presný výpočet cieľovej ceny predaja pre požadovaný zisk
- Podpora pre stop-loss a trailing stop-loss pre riadenie rizika
- Monitorovanie predajnej objednávky až do jej vyplnenia
- Detailné záznamy o každom obchodnom cykle v adresári `history`
- Ukladanie kumulatívnych obchodných štatistík s časovou značkou
- Možnosť simulácie obchodovania v režime "dry run"
- Flexibilné nastavenie úrovne logovania

**Príklad výstupu:**
```
=== Trading Loop Started ===
Symbol: BTCUSDT
Buy Amount: 10 USDT
Profit Target: 0.01 USDT
Max Cycles: 1
Delay Between Cycles: 1 seconds
Skip Balance Check: false
Dry Run: false
Log Level: normal
============================

Checking account balance...
Available USDT balance: 15.59824826
Available BTC balance: 0.00014935

==================================================
TRADING CYCLE #1 - 2025-03-12T19:36:24.406Z
==================================================

Step 1: Buying using market order
Bought 0.00012 BTC at average price of 82822.75000000 USDT

Step 2: Creating sell order
Buy Price: 82822.75000000 USDT
Sell Price: 82822.76 USDT

Sell order created with ID: 39283476276

Step 4: Monitoring sell order
Sell order has been filled!

Trade history saved to: history/trade_2025-03-12T19-36-31.323Z.json
Trading statistics updated: 1 trades, 0.00000120 net profit

=== Trading Loop Completed ===
Completed 1 trading cycles
=============================
```

## Bezpečnostné poznámky

1. Váš API kľúč by mal mať iba "read-only" oprávnenia pre bezpečnosť, pokiaľ aktívne neobchodujete.
2. Nikdy nezdieľajte svoje API poverenia.
3. Odporúča sa používať testovacie prostredie Binance pre testovanie pred použitím reálnych finančných prostriedkov.

## Licencia

Tento projekt je licencovaný pod exkluzívnou licenciou - pozrite si súbor [LICENSE.md](LICENSE.md) pre podrobnosti.

 2025 BG Bruno, BG Studio One. Všetky práva vyhradené.
