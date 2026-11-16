import { normalizePath, Notice, Plugin, TFile, TFolder } from "obsidian";
import { JournalView, JOURNAL_VIEW_TYPE } from "./JournalView";
import { DEFAULT_SETTINGS, JournalSettingTab, JournalSettings } from "./settings";
import { TradeModal } from "./TradeModal";
import {
  defaultTradeValues,
  parseTradeNote,
  PendingImage,
  serializeTrade,
  TradeTimeframe,
  tradeFileBaseName,
  TradeValues,
  validateTrade,
} from "./trade";

export default class LocalTradingJournalPlugin extends Plugin {
  settings: JournalSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(JOURNAL_VIEW_TYPE, (leaf) => new JournalView(leaf, this));
    this.addRibbonIcon("line-chart", "Open local trading journal", () => void this.activateView());
    this.addCommand({ id: "open-journal", name: "Open trading journal", callback: () => void this.activateView() });
    this.addCommand({ id: "new-trade", name: "New trade", callback: () => this.openTradeModal() });
    this.addSettingTab(new JournalSettingTab(this.app, this));

    this.registerEvent(this.app.vault.on("create", (file) => this.refreshIfJournalFile(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.refreshIfJournalFile(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.refreshIfJournalFile(file)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.isJournalPath(oldPath) || this.isJournalPath(file.path)) this.refreshViews();
      }),
    );
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(JOURNAL_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      if (existing.view instanceof JournalView) await existing.view.refresh();
      return;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: JOURNAL_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  openTradeModal(file: TFile | null = null): void {
    void this.openTradeModalAsync(file).catch((error) => {
      new Notice(error instanceof Error ? error.message : "The trade could not be opened.");
    });
  }

  async saveTrade(values: TradeValues, file: TFile | null, pendingImages: PendingImage[] = []): Promise<void> {
    const validationError = validateTrade(values);
    if (validationError) throw new Error(validationError);
    await this.ensureFolder(this.settings.folder);
    const baseName = file?.basename ?? tradeFileBaseName(values);
    const savedImages = await this.savePendingImages(baseName, pendingImages);
    const nextValues = { ...values, images: [...values.images, ...savedImages] };
    const content = serializeTrade(nextValues);

    if (file) {
      await this.app.vault.modify(file, content);
      new Notice("Trade updated.");
    } else {
      const path = await this.availableTradePath(nextValues);
      await this.app.vault.create(path, content);
      new Notice("Trade added to your local journal.");
    }
    this.refreshViews();
  }

  async deleteTrade(file: TFile): Promise<void> {
    await this.app.fileManager.trashFile(file);
    new Notice("Trade moved to trash.");
    this.refreshViews();
  }

  tradingPlanPath(): string {
    return `${this.settings.folder}/Trading Plan.md`;
  }

  async readTradingPlan(): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(this.tradingPlanPath());
    return file instanceof TFile ? this.app.vault.cachedRead(file) : "";
  }

  async saveTradingPlan(content: string): Promise<void> {
    await this.ensureFolder(this.settings.folder);
    const path = this.tradingPlanPath();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else if (file) {
      throw new Error("The trading-plan path is occupied by a folder.");
    } else {
      await this.app.vault.create(path, content);
    }
  }

  isJournalFile(file: TFile): boolean {
    return file.extension === "md" && this.isJournalPath(file.path);
  }

  isJournalPath(path: string): boolean {
    return path.startsWith(`${this.settings.folder}/`);
  }

  cleanFolderPath(value: string): string {
    const cleaned = normalizePath(value.trim().replace(/^\/+|\/+$/g, ""));
    return cleaned === "." || cleaned === "/" ? DEFAULT_SETTINGS.folder : cleaned;
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(JOURNAL_VIEW_TYPE)) {
      if (leaf.view instanceof JournalView) void leaf.view.refresh();
    }
  }

  async loadSettings(): Promise<void> {
    const stored: unknown = await this.loadData();
    if (typeof stored === "object" && stored !== null) {
      const data = stored as Partial<JournalSettings>;
      this.settings = {
        folder: typeof data.folder === "string" ? this.cleanFolderPath(data.folder) : DEFAULT_SETTINGS.folder,
        accountName: typeof data.accountName === "string" ? data.accountName : DEFAULT_SETTINGS.accountName,
        symbol: typeof data.symbol === "string" ? data.symbol : DEFAULT_SETTINGS.symbol,
        riskAmount: typeof data.riskAmount === "number" && Number.isFinite(data.riskAmount) && data.riskAmount > 0
          ? data.riskAmount
          : DEFAULT_SETTINGS.riskAmount,
      };
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async openTradeModalAsync(file: TFile | null): Promise<void> {
    let values: TradeValues;
    if (file) {
      const trade = parseTradeNote(await this.app.vault.cachedRead(file), file);
      if (!trade) {
        new Notice("This note is not a valid Local Trading Journal trade.");
        return;
      }
      values = {
        accountName: trade.accountName,
        symbol: trade.symbol,
        riskAmount: trade.riskAmount,
        entryTime: trade.entryTime,
        duration: trade.duration,
        direction: trade.direction,
        timeframe: trade.timeframe,
        entry: trade.entry,
        exit: trade.exit,
        rr: trade.rr,
        profitLoss: trade.profitLoss,
        maxRR: trade.maxRR,
        followedPlan: trade.followedPlan,
        rating: trade.rating,
        notes: trade.notes,
        images: trade.images,
      };
    } else {
      values = defaultTradeValues({
        accountName: this.settings.accountName,
        symbol: this.settings.symbol,
        riskAmount: this.settings.riskAmount,
        timeframe: await this.previousTimeframe(),
      });
    }

    new TradeModal(this.app, file, values, {
      onSave: (nextValues, existingFile, images) => this.saveTrade(nextValues, existingFile, images),
      onDelete: (existingFile) => this.deleteTrade(existingFile),
    }).open();
  }

  private async previousTimeframe(): Promise<TradeTimeframe> {
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.isJournalFile(file));
    const trades = (
      await Promise.all(files.map(async (file) => parseTradeNote(await this.app.vault.cachedRead(file), file)))
    ).filter((trade): trade is NonNullable<typeof trade> => trade !== null);
    trades.sort((a, b) => b.entryTime.localeCompare(a.entryTime));
    return trades[0]?.timeframe ?? "5m";
  }

  private async savePendingImages(baseName: string, images: PendingImage[]): Promise<string[]> {
    if (images.length === 0) return [];
    const folder = `${this.settings.folder}/attachments`;
    await this.ensureFolder(folder);
    const paths: string[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const extension = imageExtension(images[index].name);
      const basePath = `${folder}/${baseName}-image-${index + 1}`;
      let path = `${basePath}.${extension}`;
      let suffix = 1;
      while (this.app.vault.getAbstractFileByPath(path)) {
        path = `${basePath}-${suffix}.${extension}`;
        suffix += 1;
      }
      await this.app.vault.createBinary(path, images[index].data);
      paths.push(path);
    }
    return paths;
  }

  private async availableTradePath(values: TradeValues): Promise<string> {
    const baseName = tradeFileBaseName(values);
    let suffix = 0;
    let path = `${this.settings.folder}/${baseName}.md`;
    while (this.app.vault.getAbstractFileByPath(path)) {
      suffix += 1;
      path = `${this.settings.folder}/${baseName}-${suffix}.md`;
    }
    return path;
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`Cannot create journal folder: ${current} is a file.`);
      await this.app.vault.createFolder(current);
    }
  }

  private refreshIfJournalFile(file: unknown): void {
    if (file instanceof TFile && this.isJournalFile(file)) this.refreshViews();
  }
}

function imageExtension(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension && ["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension) ? extension : "png";
}
