export type SaveState = "saved-local" | "syncing" | "saved-server" | "error";

/** Local writes continue after a conflict; remote writes stop until the user reconciles it. */
export class SerialSaveQueue<T> {
    private tail: Promise<void> = Promise.resolve();
    private latest?: T;
    private revision = 0;
    private failure: unknown;
    constructor(
        private currentVersion: number,
        private persistLocal: (value: T, version: number) => Promise<void>,
        private send: (value: T, version: number) => Promise<number>,
        private onState?: (state: SaveState) => void,
    ) {}
    get version() {
        return this.currentVersion;
    }
    enqueue(value: T): Promise<void> {
        this.latest = value;
        const revision = ++this.revision;
        const local = this.persist(value);
        void local.catch(() => {});
        const task = this.tail.then(async () => {
            try {
                await local;
                if (this.failure) throw this.failure;
                this.onState?.("syncing");
                this.currentVersion = await this.send(
                    value,
                    this.currentVersion,
                );
                await this.persist(this.latest!);
                if (revision === this.revision) this.onState?.("saved-server");
            } catch (error) {
                this.failure = error;
                this.onState?.("error");
                throw error;
            }
        });
        this.tail = task.catch(() => {});
        return task;
    }
    private persist(value: T) {
        // Register immediately: the account store serializes writes and drains them when closed.
        return this.persistLocal(value, this.currentVersion).then(() => {
            this.onState?.("saved-local");
        });
    }
    async flush(): Promise<void> {
        // An edit can arrive while a previous save is finishing.
        let observed: Promise<void>;
        do {
            observed = this.tail;
            await observed;
        } while (observed !== this.tail);
        if (this.failure) throw this.failure;
    }
}
