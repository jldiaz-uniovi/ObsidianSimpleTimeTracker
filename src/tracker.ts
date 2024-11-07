import { moment, MarkdownSectionInformation, ButtonComponent, TextComponent, TFile, MarkdownRenderer, Component, MarkdownRenderChild } from "obsidian";
import { SimpleTimeTrackerSettings } from "./settings";
import { ConfirmModal } from "./confirm-modal";
import { SimpleTimeTrackerPlugin } from "./main";

export interface Tracker {
    entries: Entry[];
}

export interface Entry {
    name: string;
    startTime: string;
    endTime: string;
    subEntries?: Entry[];
    collapsed?: boolean;
}

export async function saveTracker(tracker: Tracker, fileName: string, section: MarkdownSectionInformation): Promise<void> {
    let file = app.vault.getAbstractFileByPath(fileName) as TFile;
    if (!file)
        return;
    let content = await app.vault.read(file);

    // figure out what part of the content we have to edit
    let lines = content.split("\n");
    let prev = lines.filter((_, i) => i <= section.lineStart).join("\n");
    let next = lines.filter((_, i) => i >= section.lineEnd).join("\n");
    // edit only the code block content, leave the rest untouched
    content = `${prev}\n${JSON.stringify(tracker)}\n${next}`;

    await app.vault.modify(file, content);
}

export function loadTracker(json: string): Tracker {
    if (json) {
        try {
            let ret = JSON.parse(json);
            updateLegacyInfo(ret.entries);
            return ret;
        } catch (e) {
            console.log(`Failed to parse Tracker from ${json}`);
        }
    }
    return { entries: [] };
}

export async function loadAllTrackers(fileName: string): Promise<{ section: MarkdownSectionInformation, tracker: Tracker }[]> {
    let file = app.vault.getAbstractFileByPath(fileName);
    let content = (await app.vault.cachedRead(file as TFile)).split("\n");

    let trackers: { section: MarkdownSectionInformation, tracker: Tracker }[] = [];
    let curr: Partial<MarkdownSectionInformation> | undefined;
    for (let i = 0; i < content.length; i++) {
        let line = content[i];
        if (line.trimEnd() == "```simple-time-tracker") {
            curr = { lineStart: i + 1, text: "" };
        } else if (curr) {
            if (line.trimEnd() == "```") {
                curr.lineEnd = i - 1;
                let tracker = loadTracker(curr.text);
                trackers.push({ section: curr as MarkdownSectionInformation, tracker: tracker });
                curr = undefined;
            } else {
                curr.text += `${line}\n`;
            }
        }
    }
    return trackers;
}

type GetFile = () => string;

export function displayTracker(tracker: Tracker, element: HTMLElement, getFile: GetFile, getSectionInfo: () => MarkdownSectionInformation, settings: SimpleTimeTrackerSettings, component: MarkdownRenderChild): void {

    element.addClass("simple-time-tracker-container");
    // add start/stop controls
    let running = isRunning(tracker);
    let btn = new ButtonComponent(element)
        .setClass("clickable-icon")
        .setIcon(`lucide-${running ? "stop" : "play"}-circle`)
        .setTooltip(running ? "End" : "Start")
        .onClick(async () => {
            if (running) {
                endRunningEntry(tracker);
            } else {
                startNewEntry(tracker, newSegmentNameBox.getValue());
            }
            await saveTracker(tracker, getFile(), getSectionInfo());
        });
    btn.buttonEl.addClass("simple-time-tracker-btn");
    let newSegmentNameBox = new TextComponent(element)
        .setPlaceholder("Segment name")
        .setDisabled(running);
    newSegmentNameBox.inputEl.addClass("simple-time-tracker-txt");

    // add timers
    let timer = element.createDiv({ cls: "simple-time-tracker-timers" });
    let currentDiv = timer.createEl("div", { cls: "simple-time-tracker-timer" });
    let current = currentDiv.createEl("span", { cls: "simple-time-tracker-timer-time" });
    currentDiv.createEl("span", { text: "Current" });
    let totalDiv = timer.createEl("div", { cls: "simple-time-tracker-timer" });
    let total = totalDiv.createEl("span", { cls: "simple-time-tracker-timer-time", text: "0s" });
    totalDiv.createEl("span", { text: "Total" });

    if (tracker.entries.length > 0) {
        // add table
        let table = element.createEl("table", { cls: "simple-time-tracker-table" });
        table.createEl("tr").append(
            createEl("th", { text: "Segment" }),
            createEl("th", { text: "Start time" }),
            createEl("th", { text: "End time" }),
            createEl("th", { text: "Duration" }),
            createEl("th"));

        for (let entry of orderedEntries(tracker.entries, settings))
            addEditableTableRow(tracker, entry, table, newSegmentNameBox, running, getFile, getSectionInfo, settings, 0, component);

        // add copy buttons
        let buttons = element.createEl("div", { cls: "simple-time-tracker-bottom" });
        new ButtonComponent(buttons)
            .setButtonText("Copy as item list")
            .onClick(() => navigator.clipboard.writeText(createMarkdownList(tracker, settings)));
        new ButtonComponent(buttons)
            .setButtonText("Copy as table")
            .onClick(() => navigator.clipboard.writeText(createMarkdownTable(tracker, settings)));
        new ButtonComponent(buttons)
            .setButtonText("Copy as CSV")
            .onClick(() => navigator.clipboard.writeText(createCsv(tracker, settings)));
    }


    setCountdownValues(tracker, current, total, currentDiv, settings);
    let intervalId = window.setInterval(() => {
        // we delete the interval timer when the element is removed
        if (!element.isConnected) {
            window.clearInterval(intervalId);
            return;
        }
        setCountdownValues(tracker, current, total, currentDiv, settings);
    }, 1000);
}

export function getDuration(entry: Entry): number {
    if (entry.subEntries) {
        return getTotalDuration(entry.subEntries);
    } else {
        let endTime = entry.endTime ? moment(entry.endTime) : moment();
        return endTime.diff(moment(entry.startTime));
    }
}

export function getTotalDuration(entries: Entry[]): number {
    let ret = 0;
    for (let entry of entries)
        ret += getDuration(entry);
    return ret;
}

export function isRunning(tracker: Tracker): boolean {
    return !!getRunningEntry(tracker.entries);
}

export function getRunningEntry(entries: Entry[]): Entry {
    for (let entry of entries) {
        // if this entry has sub entries, check if one of them is running
        if (entry.subEntries) {
            let running = getRunningEntry(entry.subEntries);
            if (running)
                return running;
        } else {
            // if this entry has no sub entries and no end time, it's running
            if (!entry.endTime)
                return entry;
        }
    }
    return null;
}

export class TemplateProcessor {
    constructor(public variables: Record<string, any>) {
    }

    setVariable(name: string, value: any) {
        this.variables[name] = value;
    }

    evalPart(expr: string) {
        // avoid direct eval
        const evaluated = new Function(...Object.keys(this.variables), `return ${expr};`)(...Object.values(this.variables));
        if (evaluated === undefined) {
            throw Error(`The expression "${expr}" cannot be evaluated.`);
        }
        return evaluated;
    }

    evalTemplate(template: string) {
        return template.replace(/{{(.*?)}}/g, (match, expr) => this.evalPart(expr));
    }
}



class MyEntry {
    name: string;
    start: string;
    end: string;
    duration: number;
    subentries: MyEntry[];

    constructor(name:string, start:string, end:string, duration:number, subentries:MyEntry[] = []) {
      this.name = name;
      this.start = start;
      this.end = end;
      this.duration = duration;
      this.subentries = subentries;
    }
  }

function processJson(entries: Entry[]): MyEntry[] {
    const entriesList = [];
    for (const entry of entries) {
        const subentries = entry.subEntries ? processJson(entry.subEntries) : [];

        const start = entry.startTime ? entry.startTime : (subentries[0] ? subentries[0].start : null);
        const end = entry.endTime ? entry.endTime : (subentries[subentries.length - 1] ? subentries[subentries.length - 1].end : null);
        const duration = moment(end).diff(moment(start));
        entriesList.push(new MyEntry(entry.name, start, end, duration, subentries));
    }
    return entriesList;
}

function convertEntriesToMarkdown(entriesList: MyEntry[], settings: SimpleTimeTrackerSettings, level = 0): string[] {
    const markdownLines = [];
    for (const entry of entriesList) {
        let t = new TemplateProcessor(variables = {
            start: formatTimestamp(entry.start, settings),
            end: formatTimestamp(entry.end, settings),
            duration: formatDuration(entry.duration, settings),
            description: entry.name
        });
        markdownLines.push(`${"    ".repeat(level)}- ${t.evalTemplate(settings.itemTemplate)}`);
        if (entry.subentries.length > 0) {
            markdownLines.push(...convertEntriesToMarkdown(entry.subentries, settings, level + 1));
        }
    }
    return markdownLines;
}


export function createMarkdownList(tracker: Tracker, settings: SimpleTimeTrackerSettings): string {
    const entriesList = processJson(tracker.entries);
    const markdownLines = convertEntriesToMarkdown(entriesList, settings);
    markdownLines.unshift(`**Total** ${formatDuration(getTotalDuration(tracker.entries), settings)}`);
    return markdownLines.join("\n");
}

export function createMarkdownTable(tracker: Tracker, settings: SimpleTimeTrackerSettings): string {
    let table = [settings.tableHeaders];
    for (let entry of orderedEntries(tracker.entries, settings))
        table.push(...createTableSection(entry, settings));
    table.push(["**Total**", "", "", `**${formatDuration(getTotalDuration(tracker.entries), settings)}**`]);

    let ret = "";
    // calculate the width every column needs to look neat when monospaced
    let widths = Array.from(Array(4).keys()).map(i => Math.max(...table.map(a => a[i].length)));
    for (let r = 0; r < table.length; r++) {
        // add separators after first row
        if (r == 1)
            ret += "| " + Array.from(Array(4).keys()).map(i => "-".repeat(widths[i])).join(" | ") + " |\n";

        let row: string[] = [];
        for (let i = 0; i < 4; i++)
            row.push(table[r][i].padEnd(widths[i], " "));
        ret += "| " + row.join(" | ") + " |\n";
    }
    return ret;
}

export function createCsv(tracker: Tracker, settings: SimpleTimeTrackerSettings): string {
    let ret = "";
    for (let entry of orderedEntries(tracker.entries, settings)) {
        for (let row of createTableSection(entry, settings))
            ret += row.join(settings.csvDelimiter) + "\n";
    }
    return ret;
}

export function orderedEntries(entries: Entry[], settings: SimpleTimeTrackerSettings): Entry[] {
    return settings.reverseSegmentOrder ? entries.slice().reverse() : entries;
}

export function formatTimestamp(timestamp: string, settings: SimpleTimeTrackerSettings): string {
    return moment(timestamp).format(settings.timestampFormat);
}

export function formatDuration(totalTime: number, settings: SimpleTimeTrackerSettings): string {
    let ret = "";
    let duration = moment.duration(totalTime);
    let hours = settings.fineGrainedDurations ? duration.hours() : Math.floor(duration.asHours());

    if (settings.timestampDurations) {
        if (settings.fineGrainedDurations) {
            let days = Math.floor(duration.asDays());
            if (days > 0)
                ret += days + ".";
        }
        ret += `${hours.toString().padStart(2, "0")}:${duration.minutes().toString().padStart(2, "0")}:${duration.seconds().toString().padStart(2, "0")}`;
    } else {
        if (settings.fineGrainedDurations) {
            let years = Math.floor(duration.asYears());
            if (years > 0)
                ret += years + "y ";
            if (duration.months() > 0)
                ret += duration.months() + "M ";
            if (duration.days() > 0)
                ret += duration.days() + "d ";
        }
        if (hours > 0)
            ret += hours + "h ";
        if (duration.minutes() > 0)
            ret += duration.minutes() + "m ";
        ret += duration.seconds() + "s";
    }
    return ret;
}


function startSubEntry(entry: Entry, name: string): void {
    // if this entry is not split yet, we add its time as a sub-entry instead
    if (!entry.subEntries) {
        entry.subEntries = [{ ...entry, name: `Part 1` }];
        entry.startTime = null;
        entry.endTime = null;
    }

    if (!name)
        name = `Part ${entry.subEntries.length + 1}`;
    entry.subEntries.push({ name: name, startTime: moment().toISOString(), endTime: null, subEntries: undefined });
}

function startNewEntry(tracker: Tracker, name: string): void {
    if (!name)
        name = `Segment ${tracker.entries.length + 1}`;
    let entry: Entry = { name: name, startTime: moment().toISOString(), endTime: null, subEntries: undefined };
    tracker.entries.push(entry);
}

function endRunningEntry(tracker: Tracker): void {
    let entry = getRunningEntry(tracker.entries);
    entry.endTime = moment().toISOString();
}

function removeEntry(entries: Entry[], toRemove: Entry): boolean {
    if (entries.contains(toRemove)) {
        entries.remove(toRemove);
        return true;
    } else {
        for (let entry of entries) {
            if (entry.subEntries && removeEntry(entry.subEntries, toRemove)) {
                // if we only have one sub entry remaining, we can merge back into our main entry
                if (entry.subEntries.length == 1) {
                    let single = entry.subEntries[0];
                    entry.startTime = single.startTime;
                    entry.endTime = single.endTime;
                    entry.subEntries = undefined;
                }
                return true;
            }
        }
    }
    return false;
}

function setCountdownValues(tracker: Tracker, current: HTMLElement, total: HTMLElement, currentDiv: HTMLDivElement, settings: SimpleTimeTrackerSettings): void {
    let running = getRunningEntry(tracker.entries);
    if (running && !running.endTime) {
        current.setText(formatDuration(getDuration(running), settings));
        currentDiv.hidden = false;
    } else {
        currentDiv.hidden = true;
    }
    total.setText(formatDuration(getTotalDuration(tracker.entries), settings));
}

function formatEditableTimestamp(timestamp: string, settings: SimpleTimeTrackerSettings): string {
    return moment(timestamp).format(settings.editableTimestampFormat);
}

function unformatEditableTimestamp(formatted: string, settings: SimpleTimeTrackerSettings): string {
    return moment(formatted, settings.editableTimestampFormat).toISOString();
}

function updateLegacyInfo(entries: Entry[]): void {
    for (let entry of entries) {
        // in 0.1.8, timestamps were changed from unix to iso
        if (entry.startTime && !isNaN(+entry.startTime))
            entry.startTime = moment.unix(+entry.startTime).toISOString();
        if (entry.endTime && !isNaN(+entry.endTime))
            entry.endTime = moment.unix(+entry.endTime).toISOString();

        // in 1.0.0, sub-entries were made optional
        if (entry.subEntries == null || !entry.subEntries.length)
            entry.subEntries = undefined;

        if (entry.subEntries)
            updateLegacyInfo(entry.subEntries);
    }
}


function createTableSection(entry: Entry, settings: SimpleTimeTrackerSettings): string[][] {
    let ret = [[
        entry.name,
        entry.startTime ? formatTimestamp(entry.startTime, settings) : "",
        entry.endTime ? formatTimestamp(entry.endTime, settings) : "",
        entry.endTime || entry.subEntries ? formatDuration(getDuration(entry), settings) : ""]];
    if (entry.subEntries) {
        for (let sub of orderedEntries(entry.subEntries, settings))
            ret.push(...createTableSection(sub, settings));
    }
    return ret;
}

function addEditableTableRow(tracker: Tracker, entry: Entry, table: HTMLTableElement, newSegmentNameBox: TextComponent, trackerRunning: boolean, getFile: GetFile, getSectionInfo: () => MarkdownSectionInformation, settings: SimpleTimeTrackerSettings, indent: number, component: MarkdownRenderChild): void {
    let entryRunning = getRunningEntry(tracker.entries) == entry;
    let row = table.createEl("tr");

    let nameField = new EditableField(row, indent, entry.name);
    let startField = new EditableTimestampField(row, (entry.startTime), settings);
    let endField = new EditableTimestampField(row, (entry.endTime), settings);

    row.createEl("td", { text: entry.endTime || entry.subEntries ? formatDuration(getDuration(entry), settings) : "" });

    renderNameAsMarkdown(nameField.label, getFile, component);

    let expandButton = new ButtonComponent(nameField.label)
        .setClass("clickable-icon")
        .setClass("simple-time-tracker-expand-button")
        .setIcon(`chevron-${entry.collapsed ? "left" : "down"}`)
        .onClick(async () => {
            if (entry.collapsed) {
                entry.collapsed = undefined;
            } else {
                entry.collapsed = true;
            }
            await saveTracker(tracker, getFile(), getSectionInfo());
        });
    if (!entry.subEntries)
        expandButton.buttonEl.style.visibility = "hidden";

    let entryButtons = row.createEl("td");
    entryButtons.addClass("simple-time-tracker-table-buttons");
    new ButtonComponent(entryButtons)
        .setClass("clickable-icon")
        .setIcon(`lucide-play`)
        .setTooltip("Continue")
        .setDisabled(trackerRunning)
        .onClick(async () => {
            startSubEntry(entry, newSegmentNameBox.getValue());
            await saveTracker(tracker, getFile(), getSectionInfo());
        });
    let editButton = new ButtonComponent(entryButtons)
        .setClass("clickable-icon")
        .setTooltip("Edit")
        .setIcon("lucide-pencil")
        .onClick(async () => {
            if (nameField.editing()) {
                entry.name = nameField.endEdit();
                expandButton.buttonEl.style.display = null;
                startField.endEdit();
                entry.startTime = startField.getTimestamp();
                if (!entryRunning) {
                    endField.endEdit();
                    entry.endTime = endField.getTimestamp();
                }
                await saveTracker(tracker, getFile(), getSectionInfo());
                editButton.setIcon("lucide-pencil");

                renderNameAsMarkdown(nameField.label, getFile, component);
            } else {
                nameField.beginEdit(entry.name);
                expandButton.buttonEl.style.display = "none";
                // only allow editing start and end times if we don't have sub entries
                if (!entry.subEntries) {
                    startField.beginEdit(entry.startTime);
                    if (!entryRunning)
                        endField.beginEdit(entry.endTime);
                }
                editButton.setIcon("lucide-check");
            }
        });
    new ButtonComponent(entryButtons)
        .setClass("clickable-icon")
        .setTooltip("Remove")
        .setIcon("lucide-trash")
        .setDisabled(entryRunning)
        .onClick(async () => {

            const confirmed = await showConfirm("Are you sure you want to delete this entry?");

            if (!confirmed) {
                return;
            }

            removeEntry(tracker.entries, entry);
            await saveTracker(tracker, getFile(), getSectionInfo());
        });

    if (entry.subEntries && !entry.collapsed) {
        for (let sub of orderedEntries(entry.subEntries, settings))
            addEditableTableRow(tracker, sub, table, newSegmentNameBox, trackerRunning, getFile, getSectionInfo, settings, indent + 1, component);
    }
}

function showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
        const modal = new ConfirmModal(app, message, resolve);
        modal.open();
    });
}

function renderNameAsMarkdown(label: HTMLSpanElement, getFile: GetFile, component: Component): void {
    // we don't have to wait here since async code only occurs when a file needs to be loaded (like a linked image)
    void MarkdownRenderer.renderMarkdown(label.innerHTML, label, getFile(), component);
    // rendering wraps it in a paragraph
    label.innerHTML = label.querySelector("p").innerHTML;
}


class EditableField {
    cell: HTMLTableCellElement;
    label: HTMLSpanElement;
    box: TextComponent;

    constructor(row: HTMLTableRowElement, indent: number, value: string) {
        this.cell = row.createEl("td");
        this.label = this.cell.createEl("span", { text: value });
        this.label.style.marginLeft = `${indent}em`;
        this.box = new TextComponent(this.cell).setValue(value);
        this.box.inputEl.addClass("simple-time-tracker-input");
        this.box.inputEl.hide();
    }

    editing(): boolean {
        return this.label.hidden;
    }

    beginEdit(value: string): void {
        this.label.hidden = true;
        this.box.setValue(value);
        this.box.inputEl.show();
    }

    endEdit(): string {
        const value = this.box.getValue();
        this.label.setText(value);
        this.box.inputEl.hide();
        this.label.hidden = false;
        return value;
    }
}

class EditableTimestampField extends EditableField {
    settings: SimpleTimeTrackerSettings;

    constructor(row: HTMLTableRowElement, value: string, settings: SimpleTimeTrackerSettings) {
        super(row, 0, value ? formatTimestamp(value, settings) : "");
        this.settings = settings;
    }

    beginEdit(value: string): void {
        super.beginEdit(value ? formatEditableTimestamp(value, this.settings) : "");
    }

    endEdit(): string {
        const value = this.box.getValue();
        let displayValue = value;
        if (value) {
            const timestamp = unformatEditableTimestamp(value, this.settings);
            displayValue = formatTimestamp(timestamp, this.settings);
        }
        this.label.setText(displayValue);
        this.box.inputEl.hide();
        this.label.hidden = false;
        return value;
    }

    getTimestamp(): string {
        if (this.box.getValue()) {
            return unformatEditableTimestamp(this.box.getValue(), this.settings);
        } else {
            return null;
        }
    }
}
