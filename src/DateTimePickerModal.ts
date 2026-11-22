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

    const dateSetting = new Setting(this.contentEl)
      .setName("Date")
      .setDesc("DD/MM/YYYY.")
      .setClass("trade-trace-date-picker-setting");
    const picker = dateSetting.controlEl.createEl("input", {
      cls: "trade-trace-native-date-picker",
      attr: { type: "date", "aria-hidden": "true", tabindex: "-1" },
    });
    picker.value = this.date;
    let setDate = (value: string): void => {
      this.date = value;
      picker.value = value;
    };
    picker.addEventListener("change", () => {
      if (picker.value) setDate(picker.value);
    });
    dateSetting.addText((text) => {
      text.inputEl.type = "text";
      text.inputEl.maxLength = 10;
      text.inputEl.spellcheck = false;
      text.setPlaceholder("DD/MM/YYYY").setValue(formatDateInput(this.date)).onChange((value) => {
        const parsed = parseDateInput(value);
        this.date = parsed ?? value;
        if (parsed) picker.value = parsed;
      });
      setDate = (value) => {
        this.date = value;
        picker.value = value;
        text.setValue(formatDateInput(value));
      };
    });
    dateSetting.addButton((button) =>
      button.setIcon("calendar").setTooltip("Choose date").onClick(() => {
        try {
          picker.showPicker();
        } catch {
          picker.focus();
          picker.click();
        }
      }),
    );

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
        if (!isValidCanonicalDate(this.date)) {
          new Notice("Enter a valid date in DD/MM/YYYY format.");
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

function formatDateInput(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function parseDateInput(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const date = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidCanonicalDate(date) ? date : null;
}

function isValidCanonicalDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
