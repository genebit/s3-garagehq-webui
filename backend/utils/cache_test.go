package utils

import (
	"sync"
	"testing"
	"time"
)

func TestCacheSweepRemovesExpiredEntries(t *testing.T) {
	c := &CacheManager{cache: &sync.Map{}}
	c.Set("old", "value", -time.Second)
	c.Set("fresh", "value", time.Minute)

	c.Sweep()

	if _, ok := c.cache.Load("old"); ok {
		t.Error("expired entry was not removed")
	}
	if c.Get("fresh") == nil {
		t.Error("unexpired entry was removed")
	}
}
