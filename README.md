# n8n-nodes-twosense

This is an n8n community node that lets you use [Twosense](https://twosense.ai) in your n8n workflows.

Twosense provides continuous authentication and behavioral biometrics to secure access to your applications.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Requirements](#requirements)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

The Twosense node provides access to three resources, each with specific operations:

### Events

**Get Historical**
- Fetch events within a specific time range
- Requires start time and optional end time parameters
- Returns all events within the specified period
- Useful for batch processing or historical analysis

**Get Real-Time**
- Continuously fetch new events since the last execution
- Maintains cursor state between runs to only return new events
- First execution initializes the cursor to current time (no events returned)
- Subsequent executions return events since last run
- Ideal for monitoring and real-time alerting workflows

### Session

**Get**
- Retrieve detailed information about a specific session
- Requires session ID (UUID format)
- Returns structured data with `found` indicator:
  - `found: true` → Session data (startTime, userId, device, ipAddress)
  - `found: false` → Reason why session wasn't found
- No exceptions thrown - use IF node to branch on `found` field

### Trust Score

**Get**
- Get the current trust score for a user
- Requires username in `DOMAIN\username` format (or UPN if using Entra ID)
- Returns structured data with `found` indicator:
  - `found: true` → Trust score data (trustScore 0-100, trustLevel high/medium/low, timestamp, device)
  - `found: false, reason: 'user_not_found'` → User doesn't exist in system
  - `found: false, reason: 'no_recent_score'` → No score within last 60 minutes
- No exceptions thrown - use IF node to branch on `found` field

**Features:**
- Automatic OAuth2 token management and refresh
- Pagination support for event operations
- State persistence for real-time event polling

## Credentials

This node requires Twosense API credentials. You'll need to provide:

- **API Base URL** - Your Twosense API endpoint (e.g., `https://webapi.twosense.ai`)
- **Client ID** - Your OAuth2 client ID
- **Client Secret** - Your OAuth2 client secret

Contact your Twosense administrator to obtain these credentials.

## Compatibility

Tested with n8n version 1.0+

## Requirements

### Database Configuration

**Important:** For reliable state persistence, this node requires n8n to be configured with **PostgreSQL** as the database backend.

#### Why PostgreSQL?

n8n's default SQLite database has known issues with state persistence ([n8n issue #6564](https://github.com/n8n-io/n8n/issues/6564)) that can cause:
- Events to be refetched on every execution (duplicates)
- State data to fail to persist 12-50% of the time

PostgreSQL provides reliable state persistence and is recommended for production n8n deployments.

#### Setting Up n8n with PostgreSQL

**Docker Compose Example:**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    restart: always
    environment:
      POSTGRES_DB: n8n
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: n8n_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  n8n:
    image: n8nio/n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: n8n_password
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres

volumes:
  postgres_data:
  n8n_data:
```

See the [n8n PostgreSQL documentation](https://docs.n8n.io/hosting/configuration/environment-variables/database/) for more details.

#### Using SQLite (Not Recommended)

If you must use SQLite, be aware that:
- Events may be duplicated across executions
- State persistence is unreliable
- The node will still function but may refetch all events periodically

## Usage

### Real-Time Event Monitoring Workflow

1. Add a **Schedule Trigger** to poll at your desired interval (e.g., every 5 minutes)
2. Add the **Twosense** node
3. Select **Resource**: Events
4. Select **Operation**: Get Real-Time
5. Configure your Twosense API credentials
6. Connect downstream nodes to process the events

**First Run Behavior:**
On the first execution, the cursor is set to the current time and no events are returned. Subsequent executions will fetch only new events since the last run.

### Historical Event Analysis Workflow

1. Add the **Twosense** node
2. Select **Resource**: Events
3. Select **Operation**: Get Historical
4. Set the **Start Time** and optional **End Time**
5. Connect downstream nodes to analyze the historical data

### Trust Score Check Workflow

1. Add the **Twosense** node
2. Select **Resource**: Trust Score
3. Select **Operation**: Get
4. Enter the **Username** (format: `DOMAIN\username`)
5. Use an **IF** node to branch on the `found` field:
   - `found: true` → Trust score found (includes `trustScore`, `trustLevel`, `device`, etc.)
   - `found: false, reason: 'user_not_found'` → User doesn't exist
   - `found: false, reason: 'no_recent_score'` → No score within 60 minutes

**Trust Score Response Examples:**

Success (200):
```json
{
  "found": true,
  "username": "DOMAIN\\user",
  "timestamp": "2026-02-03T10:30:00Z",
  "trustScore": 85,
  "trustLevel": "high",
  "device": "LAPTOP-12345"
}
```

User not found (404):
```json
{
  "found": false,
  "reason": "user_not_found",
  "username": "DOMAIN\\user",
  "statusCode": 404,
  "message": "User not found in Twosense system"
}
```

No recent score (204):
```json
{
  "found": false,
  "reason": "no_recent_score",
  "username": "DOMAIN\\user",
  "statusCode": 204,
  "message": "No trust score within the last 60 minutes"
}
```

### Session Information Lookup

1. Add the **Twosense** node
2. Select **Resource**: Session
3. Select **Operation**: Get
4. Enter the **Session ID** (UUID)
5. Use an **IF** node to branch on the `found` field:
   - `found: true` → Session found (includes `startTime`, `userId`, `device`, `ipAddress`)
   - `found: false, reason: 'session_not_found'` → Session doesn't exist

**Session Response Examples:**

Success (200):
```json
{
  "found": true,
  "startTime": "2026-02-03T14:15:22Z",
  "userId": "bd5fe96641d7eabd81505f604b870a8895f68166f96c525b21f87ceb49dab522",
  "device": "DESKTOP-12345",
  "ipAddress": "203.0.113.45"
}
```

Session not found (404):
```json
{
  "found": false,
  "reason": "session_not_found",
  "sessionId": "82299c01-aec1-4b41-015f-a876cb22255d",
  "statusCode": 404
}
```

### Event Data Structure

Events returned from **Get Historical** and **Get Real-Time** include:
- `uuid` - Unique event identifier
- `timestamp` - When the event occurred
- `published` - When the event was published (used for cursor tracking)
- `username` - Associated user
- `device` - Device name
- `ipAddress` - Client IP address
- `eventType` - Type of event (e.g., `user.trust_level_change`, `user.auth`)
- `result` - Event result
- `reason` - Event reason
- `action` - Action taken
- `application` - Application name

### Pagination

Event operations automatically handle pagination when there are many events to fetch. All events will be retrieved and returned in a single execution.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Twosense](https://twosense.ai)
- [n8n documentation](https://docs.n8n.io/)

## License

[MIT](LICENSE.md)
