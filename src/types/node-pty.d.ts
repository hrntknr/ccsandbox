// Re-export types from @lydell/node-pty
declare module '@lydell/node-pty' {
  export function spawn(
    file: string,
    args: string[] | string,
    options: IPtyForkOptions
  ): IPty;

  export interface IPtyForkOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: { [key: string]: string | undefined };
    encoding?: string | null;
  }

  export interface IPty {
    readonly pid: number;
    readonly cols: number;
    readonly rows: number;
    readonly process: string;
    onData: IEvent<string>;
    onExit: IEvent<{ exitCode: number; signal?: number }>;
    resize(columns: number, rows: number): void;
    clear(): void;
    write(data: string): void;
    kill(signal?: string): void;
    pause(): void;
    resume(): void;
  }

  export interface IEvent<T> {
    (listener: (e: T) => void): IDisposable;
  }

  export interface IDisposable {
    dispose(): void;
  }
}
