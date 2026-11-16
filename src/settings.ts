import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LocalTradingJournalPlugin from "./main";

export interface JournalSettings {
  folder: string;
  accountName: string;
  symbol: string;
  riskAmount: number;
}

export const DEFAULT_SETTINGS: JournalSettings = {
  folder: "Trading Journal",
  accountName: "Main account",
  symbol: "",
  riskAmount: 100,
};

export class JournalSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: LocalTradingJournalPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    void this.render();
  }

  private async render(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Local Trading Journal" });
    containerEl.createEl("p", {
      text: "New trades use the account, symbol, and risk below. Those values are read-only in the trade form.",
      cls: "setting-item-description",
    });

    new Setting(containerEl).setName("Account name").addText((text) =>
      text.setValue(this.plugin.settings.accountName).onChange(async (value) => {
        this.plugin.settings.accountName = value.trim();
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      }),
    );

    new Setting(containerEl).setName("Symbol").addText((text) =>
      text.setPlaceholder("AAPL").setValue(this.plugin.settings.symbol).onChange(async (value) => {
        this.plugin.settings.symbol = value.trim().toUpperCase();
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      }),
    );

    new Setting(containerEl).setName("Risk amount ($)").addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = "any";
      text.setValue(String(this.plugin.settings.riskAmount)).onChange(async (value) => {
        const riskAmount = Number(value);
        if (!Number.isFinite(riskAmount) || riskAmount < 0) return;
        this.plugin.settings.riskAmount = riskAmount;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      });
    });

    new Setting(containerEl)
      .setName("Journal folder")
      .setDesc("Folder for trade notes, images, and your trading plan.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.folder)
          .setValue(this.plugin.settings.folder)
          .onChange(async (value) => {
            this.plugin.settings.folder = this.plugin.cleanFolderPath(value);
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          }),
      );

    containerEl.createEl("h3", { text: "Trading plan" });
    containerEl.createEl("p", {
      text: `Saved as ${this.plugin.tradingPlanPath()}. You can also edit the note directly.`,
      cls: "setting-item-description",
    });
    const plan = await this.plugin.readTradingPlan();
    let draft = plan;
    new Setting(containerEl).setClass("local-trading-journal-plan-setting").addTextArea((text) => {
      text.setPlaceholder("Write your entries, exits, risk rules, and conditions here.");
      text.setValue(plan).onChange((value) => (draft = value));
      text.inputEl.rows = 14;
      text.inputEl.addClass("local-trading-journal-plan-input");
    });
    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Save trading plan").setCta().onClick(async () => {
        try {
          await this.plugin.saveTradingPlan(draft);
          new Notice("Trading plan saved.");
        } catch (error) {
          new Notice(error instanceof Error ? error.message : "The trading plan could not be saved.");
        }
      }),
    );
  }
}
