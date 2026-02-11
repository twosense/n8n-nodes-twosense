# n8n-nodes-twosense

This is an n8n community node that lets you use [Twosense](https://twosense.ai) events in your n8n workflows.

Twosense provides continuous authentication and behavioral biometrics to secure access to your applications.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Trigger](#trigger)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Requirements](#requirements)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

The Twosense node provides the following actions:

### Get Twosense Events

Fetch Twosense events within a specific time range for batch processing or historical analysis.

- Requires start time and optional end time parameters
- Returns all events within the specified period
- Automatically handles pagination when there are many events

### Get Twosense Session Information

Retrieve detailed information about a specific Twosense session by its ID.

- Requires session ID (UUID format)
- Returns structured data with `found` indicator:
  - `found: true` → Session data (startTime, userId, device, ipAddress)
  - `found: false` → Reason why session wasn't found
- No exceptions thrown - use IF node to branch on `found` field

### Get Twosense Trust Score

Get the current Twosense trust score and trust level for a specific user.

- Requires username in `DOMAIN\username` format (or UPN if using Entra ID)
- Returns structured data with `found` indicator:
  - `found: true` → Trust score data (trustScore 0-100, trustLevel high/medium/low, timestamp, device)
  - `found: false, reason: 'user_not_found'` → User doesn't exist in system
  - `found: false, reason: 'no_recent_score'` → No score within last 60 minutes
- No exceptions thrown - use IF node to branch on `found` field

**Features:**
- Automatic OAuth2 token management and refresh
- Pagination support for event operations

## Trigger

### On New Twosense Event

The **Twosense Trigger** node polls for new Twosense events and triggers your workflow automatically when new events are detected.

- Uses n8n's built-in polling mechanism (configure the interval in the trigger settings)
- Maintains cursor state between runs to only return new events
- Ideal for monitoring and real-time alerting workflows

## Credentials

This node requires Twosense API credentials. You'll need to provide:

- **API Base URL** - Your Twosense API endpoint (e.g., `https://webapi.twosense.ai`)
- **Client ID** - Your OAuth2 client ID
- **Client Secret** - Your OAuth2 client secret

Contact your Twosense administrator to obtain these credentials.

## Requirements

### Database Configuration

**Important:** For reliable state persistence, this node requires n8n to be configured with **PostgreSQL** as the database backend.

### Real-Time Event Monitoring Workflow

1. Add the **On New Twosense Event** Trigger node to your workflow
2. Configure the polling interval in the trigger settings (e.g., every 5 minutes)
3. Configure your Twosense API credentials
4. Connect downstream nodes to process the events

### Historical Event Analysis Workflow

1. Add the **Get Twosense Events** node
2. Set the **Start Time** and optional **End Time**
3. Connect downstream nodes to analyze the historical data

### Trust Score Check Workflow

1. Add the **Get Twosense Trust Score** node
2. Enter the **Username** (format: `DOMAIN\username`)
3. Use an **IF** node to branch on the `found` field:
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

1. Add the **Get Twosense Session Information** node
2. Enter the **Session ID** (UUID)
3. Use an **IF** node to branch on the `found` field:
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

Events returned from **Get Twosense Events** and the **Twosense Trigger** include:
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

## Resources

- [Twosense](https://twosense.ai)
- [Twosense API Documentation](https://twosense.readme.io)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [n8n documentation](https://docs.n8n.io/)

## License

[MIT](LICENSE.md)
