export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
};

export type LogsResponse = {
  entries: LogEntry[];
  total: number;
  counts: Record<string, number>;
  file: string;
  size: number;
};
