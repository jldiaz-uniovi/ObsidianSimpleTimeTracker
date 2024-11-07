export const defaultSettings: SimpleTimeTrackerSettings = {
    timestampFormat: "YY-MM-DD HH:mm:ss",
    editableTimestampFormat: "YYYY-MM-DD HH:mm:ss",
    csvDelimiter: ",",
    itemTemplate: "**{{start}}** ({{duration}}) - {{description}}",
    tableHeaders: ["Segment", "Star time", "End time", "Duration"],
    fineGrainedDurations: true,
    reverseSegmentOrder: false,
    timestampDurations: false
};

export interface SimpleTimeTrackerSettings {

    timestampFormat: string;
    editableTimestampFormat: string;
    csvDelimiter: string;
    itemTemplate: string;
    tableHeaders: Array<string>;
    fineGrainedDurations: boolean;
    reverseSegmentOrder: boolean;
    timestampDurations: boolean;
}

