# Test Fixture Go Project

This is a test fixture Go project designed to test MCP (Model Context Protocol) tools against real Go code.

## Structure

```
test-fixtures/
├── go.mod                 # Go module definition
├── main.go               # Main HTTP server entry point
├── cmd/cli/              # CLI tool command
├── internal/
│   ├── handlers/         # HTTP request handlers
│   └── models/          # Data models (including intentionally broken code)
└── pkg/utils/           # Utility functions
```

## Features

### Working Code
- HTTP server with Gin framework
- RESTful API endpoints for user management
- Environment variable utilities
- In-memory user storage
- Health check endpoint

### Intentionally Broken Code
The `internal/models/broken.go` file contains intentional issues for testing:
- Unused variables
- Unreachable code
- Potential nil pointer dereference
- Division by zero
- Undefined function calls
- Unexported fields that should be exported

## API Endpoints

- `GET /api/v1/health` - Health check
- `GET /api/v1/users/:id` - Get user by ID
- `POST /api/v1/users` - Create new user
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user

## Usage

### Run the server
```bash
go run main.go
```

### Run the CLI tool
```bash
go run cmd/cli/main.go list
go run cmd/cli/main.go create "John Doe" "john@example.com"
```

## Testing MCP Tools

This project is designed to test various MCP tools:

- **list_files_code**: Explore the directory structure
- **read_file_code**: Read Go source files
- **create_file_code**: Create new Go files
- **get_diagnostics_code**: See Go compiler errors and warnings
- **search_symbols_code**: Find functions, structs, and variables
- **get_symbol_definition_code**: Get definitions of Go symbols
- **execute_shell_command_code**: Run Go commands (build, test, etc.)