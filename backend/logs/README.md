# Logs Directory

This directory contains application logs.

## Log Files

- **app.log** - General application logs including request bodies, info messages
- **error.log** - Error logs with stack traces and error details

## Viewing Logs

### Windows (PowerShell)
```powershell
# View all logs
Get-Content logs\app.log

# View last 50 lines
Get-Content logs\app.log -Tail 50

# View errors
Get-Content logs\error.log

# Watch logs in real-time
Get-Content logs\app.log -Wait -Tail 20
```

### Windows (CMD)
```cmd
# View all logs
type logs\app.log

# View errors
type logs\error.log
```

### Using Notepad
Simply open `logs/app.log` or `logs/error.log` in Notepad or any text editor.

## Log Format

Each log entry includes:
- Timestamp in ISO format
- Log level (INFO, ERROR, etc.)
- Message
- Additional data (if any)

Example:
```
[2025-01-19T10:30:45.123Z] REQUEST BODY - POST /api/auth/register
BODY: {
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

