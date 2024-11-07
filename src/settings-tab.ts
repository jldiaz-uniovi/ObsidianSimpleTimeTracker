import {App, PluginSettingTab, Setting} from "obsidian";
import SimpleTimeTrackerPlugin from "./main";
import {defaultSettings} from "./settings";

export class SimpleTimeTrackerSettingsTab extends PluginSettingTab {

    plugin: SimpleTimeTrackerPlugin;

    constructor(app: App, plugin: SimpleTimeTrackerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();
        this.containerEl.createEl("h2", {text: "Super Simple Time Tracker Settings"});

        new Setting(this.containerEl)
            .setName("Timestamp Display Format")
            .setDesc(createFragment(f => {
                f.createSpan({text: "The way that timestamps in time tracker tables should be displayed. Uses "});
                f.createEl("a", {text: "moment.js", href: "https://momentjs.com/docs/#/parsing/string-format/"});
                f.createSpan({text: " syntax."});
            }))
            .addText(t => {
                t.setValue(String(this.plugin.settings.timestampFormat));
                t.onChange(async v => {
                    this.plugin.settings.timestampFormat = v.length ? v : defaultSettings.timestampFormat;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(this.containerEl)
            .setName("CSV Delimiter")
            .setDesc("The delimiter character that should be used when copying a tracker table as CSV. For example, some languages use a semicolon instead of a comma.")
            .addText(t => {
                t.setValue(String(this.plugin.settings.csvDelimiter));
                t.onChange(async v => {
                    this.plugin.settings.csvDelimiter = v.length ? v : defaultSettings.csvDelimiter;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(this.containerEl)
            .setName("Item Template")
            .setDesc("The template that should be used for each item in the markdown exported list. Use {{start}}, {{end}}, {{duration}} and {{description}} as placeholders.")
            .setHeading();

        new Setting(this.containerEl)
            .addTextArea(t => {
                t.setValue(String(this.plugin.settings.itemTemplate));
                t.inputEl.cols = 80;
                t.onChange(async v => {
                    this.plugin.settings.itemTemplate = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(this.containerEl)
            .setName("Table headers")
            .setDesc("The text in the headers of the markdown exported table (set to empty to recover default values).")
            .setHeading();

        for (let i = 0; i < 4; i++) {
            new Setting(this.containerEl)
                .addText(t => {
                    t.setValue(String(this.plugin.settings.tableHeaders[i]));
                    t.onChange(async v => {
                        this.plugin.settings.tableHeaders[i] = v.length ? v : defaultSettings.tableHeaders[i];
                        await this.plugin.saveSettings();
                    });
                });
        }

        new Setting(this.containerEl)
            .setName("Fine-Grained Durations")
            .setDesc("Whether durations should include days, months and years. If this is disabled, additional time units will be displayed as part of the hours.")
            .addToggle(t => {
                t.setValue(this.plugin.settings.fineGrainedDurations);
                t.onChange(async v => {
                    this.plugin.settings.fineGrainedDurations = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(this.containerEl)
            .setName("Timestamp Durations")
            .setDesc("Whether durations should be displayed in a timestamp format (12:15:01) rather than the default duration format (12h 15m 1s).")
            .addToggle(t => {
                t.setValue(this.plugin.settings.timestampDurations);
                t.onChange(async v => {
                    this.plugin.settings.timestampDurations = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(this.containerEl)
            .setName("Display Segments in Reverse Order")
            .setDesc("Whether older tracker segments should be displayed towards the bottom of the tracker, rather than the top.")
            .addToggle(t => {
                t.setValue(this.plugin.settings.reverseSegmentOrder);
                t.onChange(async v => {
                    this.plugin.settings.reverseSegmentOrder = v;
                    await this.plugin.saveSettings();
                });
            });

        // this.containerEl.createEl("hr");
        // this.containerEl.createEl("p", { text: "Need help using the plugin? Feel free to join the Discord server!" });
        // this.containerEl.createEl("a", { href: "https://link.ellpeck.de/discordweb" }).createEl("img", {
        //     attr: { src: "https://ellpeck.de/res/discord-wide.png" },
        //     cls: "simple-time-tracker-settings-image"
        // });
        // this.containerEl.createEl("p", { text: "If you like this plugin and want to support its development, you can do so through my website by clicking this fancy image!" });
        // this.containerEl.createEl("a", { href: "https://ellpeck.de/support" }).createEl("img", {
        //     attr: { src: "https://ellpeck.de/res/generalsupport-wide.png" },
        //     cls: "simple-time-tracker-settings-image"
        // });
    }
}
