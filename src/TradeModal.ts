import { App, Modal, Notice, Setting, TextComponent, TFile } from "obsidian";
import {
  calculateProfitLoss,
  formatEntryTime,
  formatProfitLoss,
  nowInputValue,
  parseEntryTimeInput,
  PendingImage,
  TradeTimeframe,
  TradeValues,
  validateTrade,
} from "./trade";

interface TradeModalCallbacks {
  onSave: (values: TradeValues, file: TFile | null, images: PendingImage[]) => Promise<void>;
  onDelete: (file: TFile) => Promise<void>;
}

export class TradeModal extends Modal {
  private values: TradeValues;
  private pendingImages: PendingImage[] = [];
  private carouselIndex = 0;
  private carouselEl!: HTMLElement;
  private errorEl!: HTMLElement;
  private saveButton!: HTMLButtonElement;
  private profitLossInput: TextComponent | null = null;
  private confirmingDelete = false;

  constructor(
    app: App,
    private readonly file: TFile | null,
    initialValues: TradeValues,
    private readonly callbacks: TradeModalCallbacks,
  ) {
    super(app);
    this.values = { ...initialValues, images: [...initialValues.images] };
  }

  onOpen(): void {
    this.titleEl.setText(this.file ? "Edit trade" : "New trade");
    this.contentEl.addClass("local-trading-journal-modal");
    document.addEventListener("paste", this.handlePaste, true);

    const defaults = this.contentEl.createDiv({ cls: "local-trading-journal-trade-defaults" });
    this.addDefaultValue(defaults, "Account", this.values.accountName || "Not configured");
    this.addDefaultValue(defaults, "Symbol", this.values.symbol || "Not configured");
    this.addDefaultValue(defaults, "Risk", `$${this.values.riskAmount.toFixed(2)}`);

    const entryTimeSetting = new Setting(this.contentEl)
      .setName("Entry time")
      .setDesc("DD/MM/YY, 24-hour time.");
    let setEntryTime = (value: string): void => {
      this.values.entryTime = value;
    };
    entryTimeSetting.addText((text) => {
      text.inputEl.type = "text";
      text.inputEl.maxLength = 14;
      text.inputEl.spellcheck = false;
      text.setPlaceholder("DD/MM/YY HH:mm")
        .setValue(formatEntryTime(this.values.entryTime))
        .onChange((value) => (this.values.entryTime = parseEntryTimeInput(value) ?? value));
      setEntryTime = (value) => {
        this.values.entryTime = value;
        text.setValue(formatEntryTime(value));
      };
    });
    entryTimeSetting.addButton((button) =>
      button.setButtonText("Now").onClick(() => setEntryTime(nowInputValue())),
    );

    new Setting(this.contentEl).setName("Duration").addText((text) =>
      text.setPlaceholder("45m").setValue(this.values.duration).onChange((value) => (this.values.duration = value)),
    );

    new Setting(this.contentEl).setName("Direction").addDropdown((dropdown) =>
      dropdown
        .addOption("long", "Long")
        .addOption("short", "Short")
        .setValue(this.values.direction)
        .onChange((value) => {
          this.values.direction = value === "short" ? "short" : "long";
          this.updateProfitLoss();
        }),
    );

    new Setting(this.contentEl).setName("Timeframe").addDropdown((dropdown) =>
      dropdown
        .addOption("1m", "1 m")
        .addOption("5m", "5 m")
        .addOption("15m", "15 m")
        .setValue(this.values.timeframe)
        .onChange((value) => (this.values.timeframe = value as TradeTimeframe)),
    );

    this.addNumberSetting("Entry price", "entry", "Optional");
    this.addNumberSetting("Exit price", "exit", "Optional");
    this.addNumberSetting("RR", "rr", "Can be used without prices");
    this.addNumberSetting("Max RR", "maxRR", "Optional");
    new Setting(this.contentEl)
      .setName("Profit / Loss")
      .setDesc("Calculated from RR × risk, or from entry/exit prices when RR is blank.")
      .addText((text) => {
        this.profitLossInput = text;
        text.setDisabled(true);
        this.updateProfitLoss();
      });

    new Setting(this.contentEl).setName("Followed trading plan").addToggle((toggle) =>
      toggle.setValue(this.values.followedPlan).onChange((value) => (this.values.followedPlan = value)),
    );

    new Setting(this.contentEl).setName("Rating").addDropdown((dropdown) => {
      for (let rating = 1; rating <= 5; rating += 1) {
        dropdown.addOption(String(rating), `${rating} ${"★".repeat(rating)}`);
      }
      dropdown.setValue(String(this.values.rating)).onChange((value) => (this.values.rating = Number(value)));
    });

    this.contentEl.createEl("h3", { text: "Images" });
    this.contentEl.createEl("p", {
      text: "Paste one or more screenshots anywhere in this form. Images are saved inside your vault when the trade is saved.",
      cls: "setting-item-description",
    });
    this.carouselEl = this.contentEl.createDiv({ cls: "local-trading-journal-carousel" });
    this.renderCarousel();

    new Setting(this.contentEl).setName("Notes").setClass("local-trading-journal-notes-setting").addTextArea((text) => {
      text.setPlaceholder("What happened? What did you learn?");
      text.setValue(this.values.notes).onChange((value) => (this.values.notes = value));
      text.inputEl.rows = 6;
    });

    this.errorEl = this.contentEl.createDiv({ cls: "local-trading-journal-error", attr: { role: "alert" } });
    const buttons = new Setting(this.contentEl).setClass("local-trading-journal-buttons");
    if (this.file) {
      const file = this.file;
      buttons.addButton((button) => {
        button.setButtonText("Delete").setWarning().onClick(async () => {
          if (!this.confirmingDelete) {
            this.confirmingDelete = true;
            button.setButtonText("Click again to confirm delete");
            return;
          }
          button.setDisabled(true);
          try {
            await this.callbacks.onDelete(file);
            this.close();
          } catch (error) {
            button.setDisabled(false);
            new Notice(errorMessage(error));
          }
        });
      });
    }
    buttons.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
    buttons.addButton((button) => {
      this.saveButton = button.buttonEl;
      button.setButtonText(this.file ? "Save changes" : "Add trade").setCta().onClick(async () => {
        const validationError = validateTrade(this.values);
        if (validationError) {
          this.errorEl.setText(validationError);
          return;
        }
        this.errorEl.setText("");
        this.saveButton.disabled = true;
        try {
          await this.callbacks.onSave({ ...this.values, images: [...this.values.images] }, this.file, this.pendingImages);
          this.close();
        } catch (error) {
          this.saveButton.disabled = false;
          new Notice(errorMessage(error));
        }
      });
    });
  }

  onClose(): void {
    document.removeEventListener("paste", this.handlePaste, true);
    for (const image of this.pendingImages) URL.revokeObjectURL(image.previewUrl);
    this.contentEl.empty();
  }

  private readonly handlePaste = (event: ClipboardEvent): void => {
    if (!this.containerEl.isConnected) return;
    void this.addPastedImages(event);
  };

  private async addPastedImages(event: ClipboardEvent): Promise<void> {
    const isSupportedImage = (file: File): boolean =>
      /^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
    const itemImages = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null && isSupportedImage(file));
    const fileImages = Array.from(event.clipboardData?.files ?? []).filter(isSupportedImage);
    const images = itemImages.length > 0 ? itemImages : fileImages;
    if (images.length === 0) return;
    event.preventDefault();
    event.stopPropagation();

    try {
      for (const image of images) {
        this.pendingImages.push({
          name: image.name || "pasted-image.png",
          data: await image.arrayBuffer(),
          previewUrl: URL.createObjectURL(image),
        });
      }
      this.carouselIndex = this.values.images.length + this.pendingImages.length - 1;
      this.renderCarousel();
      new Notice(`${images.length} image${images.length === 1 ? "" : "s"} ready to save.`);
    } catch {
      new Notice("The pasted image could not be read.");
    }
  }

  private renderCarousel(): void {
    this.carouselEl.empty();
    const total = this.values.images.length + this.pendingImages.length;
    if (total === 0) {
      this.carouselEl.createDiv({ text: "No images yet. Paste a screenshot to add one.", cls: "local-trading-journal-carousel-empty" });
      return;
    }
    this.carouselIndex = Math.max(0, Math.min(this.carouselIndex, total - 1));
    const stage = this.carouselEl.createDiv({ cls: "local-trading-journal-carousel-stage" });
    const existing = this.carouselIndex < this.values.images.length;
    let alt = "Trade screenshot";

    if (existing) {
      const path = this.values.images[this.carouselIndex];
      const imageFile = this.app.vault.getAbstractFileByPath(path);
      if (imageFile instanceof TFile) {
        stage.createEl("img", { attr: { src: this.app.vault.getResourcePath(imageFile), alt } });
      } else {
        stage.createDiv({ text: `Image not found: ${path}`, cls: "local-trading-journal-carousel-empty" });
      }
    } else {
      const image = this.pendingImages[this.carouselIndex - this.values.images.length];
      stage.createEl("img", { attr: { src: image.previewUrl, alt } });
    }

    const controls = this.carouselEl.createDiv({ cls: "local-trading-journal-carousel-controls" });
    const previous = controls.createEl("button", { text: "←", attr: { "aria-label": "Previous image" } });
    previous.disabled = total <= 1;
    previous.addEventListener("click", () => {
      this.carouselIndex = (this.carouselIndex - 1 + total) % total;
      this.renderCarousel();
    });
    controls.createEl("span", { text: `${this.carouselIndex + 1} / ${total}` });
    const next = controls.createEl("button", { text: "→", attr: { "aria-label": "Next image" } });
    next.disabled = total <= 1;
    next.addEventListener("click", () => {
      this.carouselIndex = (this.carouselIndex + 1) % total;
      this.renderCarousel();
    });
    const remove = controls.createEl("button", { text: "Remove", cls: "mod-warning" });
    remove.addEventListener("click", () => this.removeCurrentImage());
  }

  private removeCurrentImage(): void {
    if (this.carouselIndex < this.values.images.length) {
      this.values.images.splice(this.carouselIndex, 1);
    } else {
      const pendingIndex = this.carouselIndex - this.values.images.length;
      const [removed] = this.pendingImages.splice(pendingIndex, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
    }
    this.renderCarousel();
  }

  private addDefaultValue(parent: HTMLElement, label: string, value: string): void {
    const item = parent.createDiv();
    item.createEl("span", { text: label });
    item.createEl("strong", { text: value });
  }

  private addNumberSetting(name: string, key: "entry" | "exit" | "rr" | "maxRR", placeholder: string): void {
    new Setting(this.contentEl).setName(name).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.step = "any";
      if (key !== "rr") text.inputEl.min = "0";
      const value = this.values[key];
      text.setPlaceholder(placeholder).setValue(value === null ? "" : String(value)).onChange((input) => {
        this.values[key] = input.trim() === "" ? null : Number(input);
        if (key !== "maxRR") this.updateProfitLoss();
      });
    });
  }

  private updateProfitLoss(): void {
    this.values.profitLoss = calculateProfitLoss(this.values);
    this.profitLossInput?.setValue(formatProfitLoss(this.values.profitLoss));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The trade could not be saved.";
}
