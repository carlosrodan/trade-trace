import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type LocalTradingJournalPlugin from "./main";
import { calculateMetricRows, MetricPeriod } from "./metrics";
import { formatEntryTime, formatProfitLoss, formatRR, nowInputValue, parseTradeNote, Trade, tradeDateKey } from "./trade";

export const JOURNAL_VIEW_TYPE = "local-trading-journal-view";

type TradeSectionMode = "log" | "gallery";

export class JournalView extends ItemView {
  private refreshSequence = 0;
  private trades: Trade[] = [];
  private calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  private tradeSectionMode: TradeSectionMode = "log";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: LocalTradingJournalPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return JOURNAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Trading journal";
  }

  getIcon(): string {
    return "line-chart";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("local-trading-journal-view");
    this.addAction("plus", "New trade", () => this.plugin.openTradeModal());
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.refreshSequence += 1;
  }

  async refresh(): Promise<void> {
    const sequence = ++this.refreshSequence;
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: "Loading local trades…" });

    const files = this.app.vault.getMarkdownFiles().filter((file) => this.plugin.isJournalFile(file));
    const trades = (
      await Promise.all(files.map(async (file) => parseTradeNote(await this.app.vault.cachedRead(file), file)))
    ).filter((trade): trade is Trade => trade !== null);

    if (sequence !== this.refreshSequence) return;
    trades.sort((a, b) => b.entryTime.localeCompare(a.entryTime) || b.file.path.localeCompare(a.file.path));
    this.trades = trades;
    this.render();
  }

  private render(): void {
    this.contentEl.empty();
    const header = this.contentEl.createDiv({ cls: "local-trading-journal-header" });
    const heading = header.createDiv({ cls: "local-trading-journal-header-main" });
    heading.createEl("h2", { text: "Trading journal" });
    const newButton = heading.createEl("button", { text: "New trade", cls: "mod-cta" });
    newButton.addEventListener("click", () => this.plugin.openTradeModal());
    header.createEl("p", {
      text: `${this.plugin.settings.accountName} · ${this.plugin.settings.symbol || "No symbol configured"} · $${this.plugin.settings.riskAmount.toFixed(2)} risk`,
      cls: "local-trading-journal-account-summary",
    });

    if (this.trades.length === 0) {
      const empty = this.contentEl.createDiv({ cls: "local-trading-journal-empty" });
      empty.createEl("strong", { text: "No trades yet" });
      empty.createEl("span", { text: " Configure your defaults in settings, then add your first trade." });
    }

    this.renderTradeSection(this.contentEl.createDiv());

    this.contentEl.createEl("h2", { text: "Calendar" });
    this.renderCalendar(this.contentEl.createDiv({ cls: "local-trading-journal-calendar" }));

    this.contentEl.createEl("h2", { text: "Metrics" });
    this.contentEl.createEl("p", {
      text: "Win rate includes trades with an RR value. Blank and 0R trades do not count as wins; they reset consecutive win/loss streaks.",
      cls: "local-trading-journal-metric-note",
    });
    this.renderMetricSection("Yearly", "year");
    this.renderMetricSection("Monthly", "month");
    this.renderMetricSection("Weekly", "week");
    this.contentEl.createEl("p", {
      text: `Stored locally in ${this.plugin.settings.folder}/`,
      cls: "local-trading-journal-footer",
    });
  }

  private renderCalendar(container: HTMLElement): void {
    container.empty();
    const year = this.calendarMonth.getFullYear();
    const month = this.calendarMonth.getMonth();
    const navigation = container.createDiv({ cls: "local-trading-journal-calendar-nav" });
    const previous = navigation.createEl("button", { text: "←", attr: { "aria-label": "Previous month" } });
    previous.addEventListener("click", () => {
      this.calendarMonth = new Date(year, month - 1, 1);
      this.renderCalendar(container);
    });
    navigation.createEl("strong", {
      text: this.calendarMonth.toLocaleDateString("en", { month: "long", year: "numeric" }),
    });
    const today = navigation.createEl("button", { text: "Today" });
    today.addEventListener("click", () => {
      this.calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      this.renderCalendar(container);
    });
    const next = navigation.createEl("button", { text: "→", attr: { "aria-label": "Next month" } });
    next.addEventListener("click", () => {
      this.calendarMonth = new Date(year, month + 1, 1);
      this.renderCalendar(container);
    });

    const grid = container.createDiv({ cls: "local-trading-journal-calendar-grid" });
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      grid.createDiv({ text: day, cls: "local-trading-journal-calendar-weekday" });
    }
    const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const firstCell = new Date(year, month, 1 - firstOffset);
    const todayKey = nowInputValue().slice(0, 10);

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index);
      const key = localDateKey(date);
      const cell = grid.createDiv({ cls: "local-trading-journal-calendar-day" });
      if (date.getMonth() !== month) cell.addClass("is-other-month");
      if (key === todayKey) cell.addClass("is-today");
      cell.createDiv({ text: String(date.getDate()), cls: "local-trading-journal-calendar-date" });
      const dayTrades = this.trades.filter((trade) => tradeDateKey(trade) === key);
      for (const trade of dayTrades) {
        const outcome = trade.rr === null ? "neutral" : trade.rr > 0 ? "positive" : trade.rr < 0 ? "negative" : "neutral";
        const button = cell.createEl("button", {
          text: `${trade.symbol} ${formatRR(trade.rr)}`,
          cls: `local-trading-journal-calendar-trade is-${outcome}`,
          attr: { title: `${formatEntryTime(trade.entryTime)} · ${trade.accountName}` },
        });
        button.addEventListener("click", () => this.plugin.openTradeModal(trade.file));
      }
    }
  }

  private renderMetricSection(title: string, period: MetricPeriod): void {
    const section = this.contentEl.createEl("details", { cls: "local-trading-journal-metrics" });
    section.open = true;
    section.createEl("summary", { text: title });
    const rows = calculateMetricRows(this.trades, period);
    if (rows.length === 0) {
      section.createEl("p", { text: "No trades in this breakdown.", cls: "local-trading-journal-metric-note" });
      return;
    }
    const wrapper = section.createDiv({ cls: "local-trading-journal-table-wrapper" });
    const table = wrapper.createEl("table", { cls: "local-trading-journal-table" });
    const header = table.createTHead().insertRow();
    for (const label of ["Period", "Total trades", "Win rate", "Trades won", "Total RR", "Const. trades +", "Const. trades -"]) {
      header.createEl("th", { text: label });
    }
    const body = table.createTBody();
    for (const row of rows) {
      const cells = body.insertRow();
      cells.createEl("td", { text: row.period });
      cells.createEl("td", { text: String(row.totalTrades) });
      cells.createEl("td", { text: row.winRate === null ? "—" : `${row.winRate.toFixed(1)}%` });
      cells.createEl("td", { text: String(row.tradesWon) });
      cells.createEl("td", { text: formatRR(row.totalRR), cls: rrClass(row.totalRR) });
      cells.createEl("td", { text: String(row.maxWinStreak) });
      cells.createEl("td", { text: String(row.maxLossStreak) });
    }
  }

  private renderTradeSection(container: HTMLElement): void {
    container.empty();
    const header = container.createDiv({ cls: "local-trading-journal-trade-section-header" });
    header.createEl("h2", { text: "Trades" });
    const toggle = header.createDiv({ cls: "local-trading-journal-view-toggle", attr: { role: "group", "aria-label": "Trade display" } });
    this.addViewToggleButton(toggle, container, "log", "Trade log");
    this.addViewToggleButton(toggle, container, "gallery", "Gallery");

    const content = container.createDiv();
    if (this.trades.length === 0) {
      content.createEl("p", { text: "No trades to display.", cls: "local-trading-journal-metric-note" });
    } else if (this.tradeSectionMode === "log") {
      this.renderTradeLog(content);
    } else {
      this.renderGallery(content);
    }
  }

  private addViewToggleButton(parent: HTMLElement, container: HTMLElement, mode: TradeSectionMode, label: string): void {
    const selected = this.tradeSectionMode === mode;
    const button = parent.createEl("button", {
      text: label,
      cls: selected ? "is-active" : "",
      attr: { "aria-pressed": String(selected) },
    });
    button.addEventListener("click", () => {
      this.tradeSectionMode = mode;
      this.renderTradeSection(container);
    });
  }

  private renderTradeLog(container: HTMLElement): void {
    const wrapper = container.createDiv({ cls: "local-trading-journal-table-wrapper" });
    const table = wrapper.createEl("table", { cls: "local-trading-journal-table" });
    const header = table.createTHead().insertRow();
    for (const label of ["Account", "Symbol", "Risk", "Entry time", "Duration", "Timeframe", "Side", "RR", "PnL", "Max RR", "Plan", "Rating", "Images", ""]) {
      header.createEl("th", { text: label });
    }
    const body = table.createTBody();
    for (const trade of this.trades) {
      const row = body.insertRow();
      row.createEl("td", { text: trade.accountName });
      row.createEl("td", { text: trade.symbol, cls: "local-trading-journal-symbol" });
      row.createEl("td", { text: `$${trade.riskAmount.toFixed(2)}` });
      row.createEl("td", { text: formatEntryTime(trade.entryTime) });
      row.createEl("td", { text: trade.duration || "—" });
      row.createEl("td", { text: trade.timeframe });
      row.createEl("td", { text: trade.direction === "long" ? "Long" : "Short" });
      row.createEl("td", { text: formatRR(trade.rr), cls: trade.rr === null ? "" : rrClass(trade.rr) });
      row.createEl("td", {
        text: formatProfitLoss(trade.profitLoss),
        cls: trade.profitLoss === null ? "" : rrClass(trade.profitLoss),
      });
      row.createEl("td", { text: formatRR(trade.maxRR) });
      row.createEl("td", { text: trade.followedPlan ? "Yes" : "No" });
      row.createEl("td", { text: "★".repeat(trade.rating), attr: { "aria-label": `${trade.rating} out of 5` } });
      row.createEl("td", { text: String(trade.images.length) });
      const actions = row.createEl("td", { cls: "local-trading-journal-actions" });
      const openButton = actions.createEl("button", { text: "Open", attr: { "aria-label": `Open ${trade.symbol} note` } });
      openButton.addEventListener("click", () => void this.app.workspace.getLeaf("tab").openFile(trade.file));
      const editButton = actions.createEl("button", { text: "Edit", attr: { "aria-label": `Edit ${trade.symbol} trade` } });
      editButton.addEventListener("click", () => this.plugin.openTradeModal(trade.file));
    }
  }

  private renderGallery(container: HTMLElement): void {
    const tradesWithImages = this.trades.filter((trade) => trade.images.length > 0);
    if (tradesWithImages.length === 0) {
      container.createDiv({
        text: "No trade images yet. Paste screenshots into a trade to build your gallery.",
        cls: "local-trading-journal-empty",
      });
      return;
    }

    const grid = container.createDiv({ cls: "local-trading-journal-gallery" });
    for (const trade of tradesWithImages) {
      const card = grid.createDiv({ cls: "local-trading-journal-gallery-card" });
      let imageIndex = 0;
      const renderCard = (): void => {
        card.empty();
        const imagePath = trade.images[imageIndex];
        const imageButton = card.createEl("button", {
          cls: "local-trading-journal-gallery-image-button",
          attr: { "aria-label": `Edit ${trade.symbol} trade from ${formatEntryTime(trade.entryTime)}` },
        });
        imageButton.addEventListener("click", () => this.plugin.openTradeModal(trade.file));
        const imageFile = this.app.vault.getAbstractFileByPath(imagePath);
        if (imageFile instanceof TFile) {
          imageButton.createEl("img", {
            attr: {
              src: this.app.vault.getResourcePath(imageFile),
              alt: `${trade.symbol} trade screenshot ${imageIndex + 1}`,
              loading: "lazy",
            },
          });
        } else {
          imageButton.createDiv({ text: "Image not found", cls: "local-trading-journal-gallery-missing" });
        }

        const controls = card.createDiv({ cls: "local-trading-journal-gallery-carousel-controls" });
        const previous = controls.createEl("button", { text: "←", attr: { "aria-label": `Previous ${trade.symbol} image` } });
        previous.disabled = trade.images.length <= 1;
        previous.addEventListener("click", () => {
          imageIndex = (imageIndex - 1 + trade.images.length) % trade.images.length;
          renderCard();
        });
        controls.createEl("span", { text: `${imageIndex + 1} / ${trade.images.length}` });
        const next = controls.createEl("button", { text: "→", attr: { "aria-label": `Next ${trade.symbol} image` } });
        next.disabled = trade.images.length <= 1;
        next.addEventListener("click", () => {
          imageIndex = (imageIndex + 1) % trade.images.length;
          renderCard();
        });

        const details = card.createDiv({ cls: "local-trading-journal-gallery-details" });
        const title = details.createDiv({ cls: "local-trading-journal-gallery-title" });
        title.createEl("strong", { text: `${trade.symbol} · ${trade.direction === "long" ? "Long" : "Short"}` });
        title.createEl("span", { text: formatRR(trade.rr), cls: trade.rr === null ? "" : rrClass(trade.rr) });
        details.createDiv({ text: formatEntryTime(trade.entryTime), cls: "local-trading-journal-gallery-meta" });
        details.createDiv({
          text: `P/L ${formatProfitLoss(trade.profitLoss)}`,
          cls: `local-trading-journal-gallery-meta ${trade.profitLoss === null ? "" : rrClass(trade.profitLoss)}`,
        });
      };
      renderCard();
    }
  }
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function rrClass(rr: number): string {
  return rr > 0 ? "local-trading-journal-positive" : rr < 0 ? "local-trading-journal-negative" : "";
}
