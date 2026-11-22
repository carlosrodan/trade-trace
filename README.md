# TradeTrace

An independent, fully local Obsidian plugin for manual trade notes, screenshots, a calendar, and RR performance metrics. It has no online account system, cloud sync, broker imports, AI integration, analytics, update checks, or other network features.

## Features

### Trade defaults

Set the account name, symbol, and risk amount in dollars under **Settings → TradeTrace**. New trades use these values automatically and display them as read-only information. Existing trades keep the values they were saved with.

The timeframe dropdown supports 1 m, 5 m, and 15 m. A new trade inherits the entry date and timeframe from the most recent trade while using the current clock time. With no previous trades, it uses the current date and 5 m.

### Trade form

- Entry date and time in **DD/MM/YY HH:mm** format with 24-hour time, plus **Now** and calendar buttons. The calendar button opens the native date-time picker and synchronizes the formatted text field. Markdown storage retains the existing internal date format for compatibility.
- Optional duration and timeframe.
- Long/short direction dropdown, defaulting to Long.
- Optional entry price, exit price, RR, and maximum RR. RR can be entered by itself while both prices remain blank.
- Read-only Profit / Loss, calculated as **RR × risk amount**. If RR is blank and both prices are present, it uses **exit − entry** for Long or **entry − exit** for Short. The price-based fallback represents one unit of the symbol because there is no position-size field. The field updates live and is saved in the note.
- Checkbox for whether the trading plan was followed.
- Rating from 1 to 5 stars.
- Notes and pasted screenshots.
- Previous/next image carousel with image removal.

While the trade modal is open, paste screenshots with Ctrl+V (Cmd+V on macOS); the images field does not need to be focused. Clipboard images exposed as either browser clipboard items or files are supported. Pasted images are stored in `Trading Journal/attachments/` and embedded in the trade note. Removing an image from a trade removes its reference from that note but does not delete the image file from the vault.

### Calendar and metrics

The main journal view contains a monthly calendar with one entry per trade. Select a calendar entry to edit it. Use the arrow buttons to change months or **Today** to return to the current month.

Yearly, monthly, and ISO-week tables each show:

- Total trades
- Win rate
- Trades won
- Total RR
- Maximum consecutive winning trades (`Const. trades +`)
- Maximum consecutive losing trades (`Const. trades -`)

A positive RR is a win and a negative RR is a loss. Win rate uses trades with an RR value as its denominator. Blank RR and 0R trades count toward total trades but reset both streaks.

### Trade log and gallery

Use the **Trade log / Gallery** buttons at the top of the main page to switch displays. Trade log mode shows trades as rows, including their direction. Gallery mode shows one card per trade with symbol, direction, entry time, and RR. Trades with multiple images have previous/next controls and an image counter in their own card. Click an image to edit its trade. Trades without images remain available in trade log mode.

### Trading plan

The settings panel contains a trading-plan editor. **Save trading plan** writes `Trading Journal/Trading Plan.md`, which can also be edited directly in Obsidian.

### Open the journal

Click the line-chart button in Obsidian’s left ribbon. The command palette also provides **Open trading journal** and **New trade** commands.

## Install manually

1. Run `npm install` and `npm run build` in this directory.
2. Create `.obsidian/plugins/local-trading-journal/` inside your vault.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Restart Obsidian or reload plugins, then enable **TradeTrace** under **Settings → Community plugins**.
5. Open the plugin settings and configure your account name, symbol, risk amount, and trading plan.

You can also copy this whole directory into `.obsidian/plugins/local-trading-journal/` after building.

## Storage

Trades are ordinary Markdown notes stored in `Trading Journal/` by default:

```markdown
---
type: local-trading-journal-trade
schemaVersion: 2
accountName: "Main account"
symbol: "AAPL"
riskAmount: 100
entryTime: "2026-11-16T09:30"
duration: "45m"
direction: long
timeframe: 5m
entry: 100
exit: null
rr: 2
profitLoss: 200
maxRR: 3.5
followedPlan: true
rating: 4
images: ["Trading Journal/attachments/example.png"]
---
# AAPL Long

## Notes

Waited for confirmation and followed the plan.

## Images

![[Trading Journal/attachments/example.png]]
```

Entry and exit prices are not used to calculate RR; enter the RR you want to record. Existing notes from earlier versions can still be read. Notes without a direction default to Long and are upgraded to the current fields when edited.

## Privacy

The plugin only reads and writes files in your Obsidian vault and its own local settings. It contains no remote requests, external accounts, tracking, or sync code. Your vault backup or Obsidian Sync settings remain separate and under your control.

## Development

```sh
npm install
npm run typecheck
npm run build
```

`npm run dev` rebuilds `main.js` when source files change. The plugin has no runtime package dependencies; `obsidian` is supplied by Obsidian.

This is an original implementation and is not affiliated with Journalit.
