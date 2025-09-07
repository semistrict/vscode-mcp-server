.PHONY: build run test clean lint

# Build the main server
build:
	go build -o bin/server main.go

# Build the CLI tool
build-cli:
	go build -o bin/cli cmd/cli/main.go

# Run the server
run:
	go run main.go

# Run the CLI
run-cli:
	go run cmd/cli/main.go

# Run tests
test:
	go test ./...

# Clean build artifacts
clean:
	rm -rf bin/

# Lint the code
lint:
	golangci-lint run

# Format the code
fmt:
	go fmt ./...

# Tidy dependencies
tidy:
	go mod tidy

# Check for issues (useful for testing diagnostics)
check:
	go vet ./...
	go build ./...