export declare const FLOW_VERSION = 1;
export declare function streamFailure(message: any, code?: string): Error & {
    code: string;
};
export declare function positiveInteger(value: any, name: any, allowZero?: boolean): any;
/** A single waiter/timer per writer, with cumulative acknowledgements. */
export declare class StreamWindow {
    #private;
    constructor(windowSize: any, timeout: any);
    start(): void;
    close(): void;
    sent(): void;
    get hasCredit(): boolean;
    acknowledge(message: any): void;
    fail(error: any): void;
    ready(): Promise<void>;
    credit(): Promise<void>;
    ended(): Promise<void>;
}
