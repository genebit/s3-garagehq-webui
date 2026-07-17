package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Logger struct {
	mu   sync.Mutex
	file *os.File
	out  io.Writer
	path string
}

var Log *Logger

func InitLogger() {
	path := GetEnv("LOGS_PATH", "/data/logs/app.log")
	Log = &Logger{path: path, out: os.Stdout}

	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			fmt.Fprintln(os.Stderr, "cannot create log dir:", err)
			return
		}
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot open log file:", err)
		return
	}
	Log.file = f
}

// emit writes a tab-separated "timestamp\tlevel\tmessage[\tcontextJSON]" line to
// stdout and the log file. Newlines in the message are flattened to keep one
// entry per line.
func (l *Logger) emit(level, msg, context string) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	line := fmt.Sprintf(
		"%s\t%s\t%s",
		time.Now().Format(time.RFC3339),
		level,
		strings.ReplaceAll(strings.TrimRight(msg, "\n"), "\n", " "),
	)
	if context != "" {
		line += "\t" + context
	}
	line += "\n"

	io.WriteString(l.out, line)
	if l.file != nil {
		io.WriteString(l.file, line)
	}
}

func (l *Logger) write(level, msg string) {
	l.emit(level, msg, "")
}

// Event logs a message with structured context (serialized as JSON) so the log
// viewer can show extra footprint details like ip and user agent.
func (l *Logger) Event(level, msg string, fields map[string]interface{}) {
	context := ""
	if len(fields) > 0 {
		if b, err := json.Marshal(fields); err == nil {
			context = string(b)
		}
	}
	l.emit(level, msg, context)
}

func (l *Logger) Info(args ...interface{}) {
	l.write("INFO", strings.TrimSpace(fmt.Sprintln(args...)))
}

func (l *Logger) Warn(args ...interface{}) {
	l.write("WARN", strings.TrimSpace(fmt.Sprintln(args...)))
}

func (l *Logger) Error(args ...interface{}) {
	l.write("ERROR", strings.TrimSpace(fmt.Sprintln(args...)))
}

func (l *Logger) LogPath() string { return l.path }

// stdlibWriter adapts the logger as an io.Writer so the standard log package's
// output is captured into the same file/stream as INFO entries.
type stdlibWriter struct{ l *Logger }

func (w stdlibWriter) Write(p []byte) (int, error) {
	w.l.write("INFO", strings.TrimRight(string(p), "\n"))
	return len(p), nil
}

func (l *Logger) StdlibWriter() io.Writer { return stdlibWriter{l} }
