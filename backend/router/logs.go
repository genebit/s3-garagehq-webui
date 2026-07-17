package router

import (
	"encoding/json"
	"khairul169/garage-webui/utils"
	"net/http"
	"os"
	"strconv"
	"strings"
)

type Logs struct{}

type LogEntry struct {
	Timestamp string                 `json:"timestamp"`
	Level     string                 `json:"level"`
	Message   string                 `json:"message"`
	Context   map[string]interface{} `json:"context,omitempty"`
}

var knownLevels = map[string]bool{
	"INFO":  true,
	"WARN":  true,
	"ERROR": true,
	"DEBUG": true,
}

func parseLogLine(line string) LogEntry {
	parts := strings.SplitN(line, "\t", 4)
	if len(parts) >= 3 && knownLevels[parts[1]] {
		entry := LogEntry{Timestamp: parts[0], Level: parts[1], Message: parts[2]}
		if len(parts) == 4 {
			var ctx map[string]interface{}
			if err := json.Unmarshal([]byte(parts[3]), &ctx); err == nil {
				entry.Context = ctx
			}
		}
		return entry
	}
	return LogEntry{Timestamp: "", Level: "INFO", Message: line}
}

func (c *Logs) GetAll(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	search := strings.ToLower(strings.TrimSpace(query.Get("search")))
	level := strings.ToUpper(strings.TrimSpace(query.Get("level")))

	page, err := strconv.Atoi(query.Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	limit, err := strconv.Atoi(query.Get("limit"))
	if err != nil || limit < 1 {
		limit = 100
	}

	path := utils.Log.LogPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			utils.ResponseSuccess(w, map[string]interface{}{
				"entries": []LogEntry{},
				"total":   0,
				"counts":  map[string]int{},
				"file":    path,
				"size":    0,
			})
			return
		}
		utils.ResponseError(w, err)
		return
	}

	content := strings.TrimRight(string(data), "\n")
	var entries []LogEntry
	if content != "" {
		for _, line := range strings.Split(content, "\n") {
			entries = append(entries, parseLogLine(line))
		}
	}

	// Apply the free-text search first, then compute per-level counts so the
	// filter buttons reflect the current search.
	counts := map[string]int{"INFO": 0, "WARN": 0, "ERROR": 0, "DEBUG": 0}
	filtered := make([]LogEntry, 0, len(entries))
	for _, e := range entries {
		if search != "" && !strings.Contains(strings.ToLower(e.Message), search) {
			continue
		}
		counts[e.Level]++
		if level != "" && level != "ALL" && e.Level != level {
			continue
		}
		filtered = append(filtered, e)
	}

	// Newest first.
	for i, j := 0, len(filtered)-1; i < j; i, j = i+1, j-1 {
		filtered[i], filtered[j] = filtered[j], filtered[i]
	}

	total := len(filtered)
	start := (page - 1) * limit
	if start > total {
		start = total
	}
	end := start + limit
	if end > total {
		end = total
	}

	pageEntries := filtered[start:end]
	if pageEntries == nil {
		pageEntries = []LogEntry{}
	}

	utils.ResponseSuccess(w, map[string]interface{}{
		"entries": pageEntries,
		"total":   total,
		"counts":  counts,
		"file":    path,
		"size":    len(data),
	})
}
