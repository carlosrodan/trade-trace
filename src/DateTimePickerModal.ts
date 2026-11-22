import { App, Modal, Notice, Setting } from "obsidian";
import { nowInputValue } from "./trade";

export class DateTimePickerModal extends Modal {
  private date: string;
  private hour: string;
  private minute: string;

  constructor(
    app: App,
    initialValue: string,
    private readonly onSelect: (value: string) => void,
  ) {
    super(app);
    const value = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(initialValue) ? initialValue : nowInputValue();
    this.date = value.slice(0, 10);
    this.hour = value.slice(11, 13);
    this.minute = value.slice(14, 16);
  }

  onOpen(): void {
    this.titleEl.setText("Choose date and time");

    new Setting(this.contentEl).setName("Date").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.date).onChange((value) => (this.date = value));
    });

    const time = new Setting(this.contentEl).setName("Time").setDesc("24-hour time.");
    time.addDropdown((dropdown) => {
      for (let hour = 0; hour < 24; hour += 1) {
        const value = String(hour).padStart(2, "0");
        dropdown.addOption(value, value);
      }
      dropdown.setValue(this.hour).onChange((value) => (this.hour = value));
    });
    time.controlEl.createSpan({ text: ":" });
    time.addDropdown((dropdown) => {
      for (let minute = 0; minute < 60; minute += 1) {
        const value = String(minute).padStart(2, "0");
        dropdown.addOption(value, value);
      }
      dropdown.setValue(this.minute).onChange((value) => (this.minute = value));
    });

    new Setting(this.contentEl).addButton((button) =>
      button.setButtonText("Set date and time").setCta().onClick(() => {
        if (!this.date) {
          new Notice("Choose a date.");
          return;
        }
        this.onSelect(`${this.date}T${this.hour}:${this.minute}`);
        this.close();
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
