
GOOS ?= $(if $(strip $(TARGETOS)),$(TARGETOS),$(shell go env GOOS))
GOARCH ?= $(if $(strip $(TARGETARCH)),$(TARGETARCH),$(shell go env GOARCH))

build:
	CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) go build -o main -tags="prod" main.go

run:
	go run main.go
