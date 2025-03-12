# Changelog

Všetky významné zmeny v projekte Binance Trading Bot sú dokumentované v tomto súbore.

## [Unreleased]

## [1.0.0] - 2025-03-12

### Pridané
- **2025-03-12 12:46:29** - Pridaná exkluzívna licencia a komplexná dokumentácia README s príkladmi príkazov
- **2025-03-12 12:45:31** - Pridaný skript `order-cancel.js` pre zrušenie existujúcich objednávok
- **2025-03-12 12:44:37** - Pridaný skript `order-trade.js` pre vytváranie a správu obchodných objednávok
- **2025-03-12 09:15:13** - Pridaná podpora pre export dát v JSON formáte
- **2025-03-12 09:15:13** - Pridaný časový údaj do názvov exportovaných súborov pre lepšiu identifikáciu
- **2025-03-12 07:49:53** - Pridaný skript `orders-download.js` pre sťahovanie histórie objednávok
- **2025-03-12 07:49:53** - Pridaný konfiguračný súbor `config.js` pre centralizovanú správu API kľúčov
- **2025-03-12 07:49:24** - Nakonfigurovaný Git LFS pre adresáre `chat` a `data`
- **2025-03-12 07:11:50** - Vytvorený modulárny Binance trading bot s vylepšeným systémom pomocníka

### Zmenené
- **2025-03-12 12:45:31** - Premenovaný súbor `order_monitor.js` na `order-monitor.js` pre konzistentnú konvenciu pomenovania
- **2025-03-12 12:44:37** - Premenovaný súbor `exchange_info.js` na `exchange-info.js` pre konzistentnú konvenciu pomenovania
- **2025-03-12 12:42:40** - Premenovaný súbor `account_info.js` na `account-info.js` pre konzistentnú konvenciu pomenovania
- **2025-03-12 12:42:40** - Aktualizovaný súbor `app.js` s odkazmi na premenované súbory
- **2025-03-12 09:21:23** - Zmenená prípona súboru SQLite z `.db` na `.sqlite` pre lepšiu identifikáciu
- **2025-03-12 09:15:13** - Aktualizovaný skript `orders-download.js` s podporou pre JSON export
- **2025-03-12 07:49:53** - Aktualizovaný súbor `app.js` s novým príkazom `orders-download`
- **2025-03-12 07:49:53** - Aktualizované súbory `package.json` a `package-lock.json` s novými závislosťami

### Odstránené
- **2025-03-12 09:15:13** - Odstránený súbor `data/orders_BTCUSDT_2025-03-12.db` a nahradený verziou s časovou značkou

## Detaily zmien podľa commitov

### Commit 3b92ec7 - 2025-03-12 12:46:29
**Add comprehensive README, LICENSE and update file naming convention**
- Pridané:
  - `LICENSE.md` - Exkluzívna licencia pre softvér
  - `order-cancel.js` - Skript pre zrušenie objednávok
  - `order-trade.js` - Skript pre vytváranie a správu obchodných objednávok
- Zmenené:
  - `README.md` - Komplexná dokumentácia s príkladmi príkazov
  - `exchange-info.js` - Aktualizovaný obsah súboru
  - `order-monitor.js` - Aktualizovaný obsah súboru

### Commit 233c19a - 2025-03-12 12:45:31
**Rename order_monitor.js to order-monitor.js for consistent naming convention**
- Premenované:
  - `order_monitor.js` → `order-monitor.js` (100% zhoda obsahu)

### Commit 2534c9d - 2025-03-12 12:44:37
**Rename exchange_info.js to exchange-info.js for consistent naming convention**
- Premenované:
  - `exchange_info.js` → `exchange-info.js` (100% zhoda obsahu)

### Commit c8927bf - 2025-03-12 12:42:40
**Rename account_info.js to account-info.js for consistent naming convention**
- Premenované:
  - `account_info.js` → `account-info.js` (100% zhoda obsahu)
- Zmenené:
  - `app.js` - Aktualizované referencie na premenovaný súbor

### Commit 79a4609 - 2025-03-12 09:21:23
**Change SQLite file extension from .db to .sqlite for better identification**
- Pridané:
  - `data/orders_BTCUSDT_2025-03-12_08-21-06.sqlite` - Nový formát súboru SQLite
- Zmenené:
  - `orders-download.js` - Aktualizovaná prípona súboru z `.db` na `.sqlite`

### Commit d58e8ae - 2025-03-12 09:15:13
**Add JSON export support and include time in exported filenames**
- Pridané:
  - `data/orders_BTCUSDT_2025-03-12_08-14-12.json` - Príklad exportu v JSON formáte
  - `data/orders_BTCUSDT_2025-03-12_08-14-27.db` - Príklad exportu v SQLite formáte s časovou značkou
- Premenované:
  - `data/orders_BTCUSDT_2025-03-12.csv` → `data/orders_BTCUSDT_2025-03-12_08-14-23.csv` (100% zhoda obsahu)
- Odstránené:
  - `data/orders_BTCUSDT_2025-03-12.db` - Nahradený verziou s časovou značkou
- Zmenené:
  - `orders-download.js` - Pridaná podpora pre JSON export a časové značky v názvoch súborov

### Commit 9cd3c16 - 2025-03-12 07:49:53
**Add orders-download.js script and update existing files**
- Pridané:
  - `config.js` - Konfiguračný súbor pre API kľúče
  - `data/orders_BTCUSDT_2025-03-12.csv` - Príklad exportu v CSV formáte
  - `data/orders_BTCUSDT_2025-03-12.db` - Príklad exportu v SQLite formáte
  - `orders-download.js` - Skript pre sťahovanie histórie objednávok
- Zmenené:
  - `app.js` - Pridaný nový príkaz `orders-download`
  - `package-lock.json` - Aktualizované závislosti
  - `package.json` - Aktualizované závislosti

### Commit 9125476 - 2025-03-12 07:49:24
**Configure Git LFS for chat and data directories**
- Zmenené:
  - `.gitignore` - Aktualizované pravidlá pre ignorovanie súborov

### Commit 59cb8ca - 2025-03-12 07:11:50
**Initial commit: Modular Binance trading bot with improved help system**
- Pridané:
  - `.gitattributes` - Konfigurácia Git atribútov
  - `.gitignore` - Pravidlá pre ignorovanie súborov
  - `README.md` - Základná dokumentácia
  - `account_info.js` - Skript pre získanie informácií o účte
  - `app.js` - Hlavný skript pre spustenie príkazov
  - `exchange_info.js` - Skript pre získanie informácií o burze
  - `order.js` - Skript pre získanie informácií o objednávke
  - `order_monitor.js` - Skript pre monitorovanie objednávky
  - `package-lock.json` - Zámok závislostí
  - `package.json` - Definícia projektu a závislostí
  - Adresár `chat` s históriou konverzácií

## Autor

© 2025 BG Bruno, BG Studio One. Všetky práva vyhradené.
