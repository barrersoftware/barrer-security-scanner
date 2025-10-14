# Custom Scanning Policies Plugin

Define, schedule, and execute custom security scanning policies with compliance templates.

## Features

- 🔄 **Policy Management** - Create, update, and manage security policies
- 📋 **10 Compliance Templates** - Pre-built templates for industry standards
- ⏰ **Scheduled Execution** - Cron-based automatic policy runs
- 📊 **Compliance Tracking** - Track scores and trends over time
- 🏢 **Multi-Tenant** - Complete tenant isolation
- 📈 **Trend Analysis** - Historical compliance data

## Compliance Templates

### Industry Standards
- **PCI-DSS 3.2.1** - Payment Card Industry Data Security Standard
- **HIPAA** - Health Insurance Portability and Accountability Act
- **SOC 2 Type II** - Service Organization Control 2
- **GDPR** - General Data Protection Regulation
- **ISO 27001:2022** - Information Security Management System

### Government & Defense
- **NIST CSF 2.0** - NIST Cybersecurity Framework
- **NIST SP 800-53** - Security and Privacy Controls
- **NIST SP 800-171** - Protecting CUI
- **DISA STIG** - Defense Security Technical Implementation Guides
- **OpenSCAP** - Security Content Automation Protocol

## Services

### PolicyManager
CRUD operations for policies.

**Methods:**
- `createPolicy(data)` - Create new policy
- `listPolicies(filters, options)` - List with pagination
- `getPolicy(id, tenantId)` - Get policy details
- `updatePolicy(id, tenantId, updates)` - Update policy
- `deletePolicy(id, tenantId)` - Delete policy
- `createFromTemplate(templateId, data)` - Create from template

### PolicyScheduler
Cron-based scheduling for automated execution.

**Methods:**
- `updateSchedule(policyId, tenantId, schedule, enabled)` - Update schedule
- `listScheduledPolicies()` - List all scheduled
- `getScheduleInfo(cronExpression)` - Get schedule details

**Supported Schedules:**
- Daily: `0 2 * * *` (2 AM every day)
- Weekly: `0 2 * * 0` (2 AM Sunday)
- Monthly: `0 2 1 * *` (2 AM 1st of month)
- Quarterly: `0 2 1 */3 *` (2 AM 1st every 3 months)
- Custom: Any valid cron expression

### PolicyExecutor
Execute policies and parse results.

**Methods:**
- `executePolicy(policy, user)` - Execute policy
- `getExecutionHistory(policyId, tenantId, options)` - Get history
- `getExecutionDetails(executionId, tenantId)` - Get details

**Features:**
- Spawns compliance scripts
- Captures output and errors
- Parses results and calculates scores
- Records execution history
- Broadcasts progress via WebSocket

### TemplateManager
Manages policy templates.

**Methods:**
- `getTemplates(category)` - Get templates by category
- `getTemplate(id)` - Get specific template
- `getScriptPath(templateId)` - Get script path
- `validateTemplate(templateId)` - Validate template

### ComplianceTracker
Tracks compliance scores over time.

**Methods:**
- `recordScore(policyId, tenantId, execution)` - Record score
- `getCurrentScore(policyId, tenantId)` - Get latest score
- `getScoreTrend(policyId, tenantId, days)` - Get trend
- `getComplianceReport(tenantId, days)` - Tenant report
- `getPoliciesRequiringAttention(tenantId)` - Get failing policies

## API Endpoints

### Policy Management
- `POST /api/policies` - Create policy
- `GET /api/policies` - List policies
- `GET /api/policies/:id` - Get policy
- `PUT /api/policies/:id` - Update policy
- `DELETE /api/policies/:id` - Delete policy

### Templates
- `GET /api/policies/templates/list` - List templates
- `POST /api/policies/from-template` - Create from template

### Execution
- `POST /api/policies/:id/execute` - Execute policy
- `GET /api/policies/:id/history` - Execution history

### Compliance
- `GET /api/policies/:id/compliance-score` - Current score
- `GET /api/policies/:id/trend` - Score trend
- `POST /api/policies/:id/schedule` - Update schedule

## Usage Examples

### Create Policy from Template

```javascript
POST /api/policies/from-template
{
  "templateId": "pci-dss",
  "name": "Monthly PCI-DSS Compliance Check",
  "schedule": "0 2 1 * *"
}
```

### Execute Policy

```javascript
POST /api/policies/:id/execute
```

### Get Compliance Trend

```javascript
GET /api/policies/:id/trend?days=90
```

### Update Schedule

```javascript
POST /api/policies/:id/schedule
{
  "schedule": "0 2 * * 0",
  "enabled": true
}
```

## Database Schema

### policies
```sql
id, tenant_id, name, description, framework,
template_id, schedule, schedule_enabled, status,
config, created_by, created_at, updated_at
```

### policy_executions
```sql
id, policy_id, tenant_id, user_id, status,
start_time, end_time, duration, score, passed,
failed, warnings, output, report_path, error
```

### compliance_scores
```sql
id, policy_id, tenant_id, execution_id, score,
passed, failed, warnings, recorded_at
```

## Score Calculation

Scores are calculated by parsing the compliance script output:

- **Passed checks**: ✅ markers
- **Failed checks**: 🚨 markers  
- **Warnings**: ⚠️ markers
- **Score**: (passed / (passed + failed)) * 100

## Integration

### With Existing Scripts
The plugin uses existing compliance scripts in `/compliance/`:
- `scan-compliance.sh` - PCI-DSS, HIPAA, SOC2, GDPR
- `scan-nist.sh` - NIST frameworks
- `scan-iso27001.sh` - ISO 27001
- `scan-disa-stig.sh` - DISA STIG
- `scan-openscap.sh` - OpenSCAP

### With Audit Logging
All policy actions are automatically logged:
- Policy creation/updates/deletions
- Policy executions
- Schedule changes

### With Multi-Tenancy
- Policies are tenant-scoped
- Complete data isolation
- Per-tenant policy limits

## Permissions

- **admin** - Full access (create, update, delete, execute)
- **security** - Create, update, execute policies
- **auditor** - View policies, history, and scores

## Configuration

From `plugin.json`:

```json
{
  "maxPoliciesPerTenant": 50,
  "defaultSchedule": "0 2 * * *",
  "retentionDays": 365,
  "concurrentExecutions": 5
}
```

## Monitoring

The plugin broadcasts execution progress via WebSocket:

```javascript
{
  type: 'policy_execution_output',
  executionId: 'uuid',
  data: 'script output'
}

{
  type: 'policy_execution_complete',
  executionId: 'uuid',
  policyId: 'uuid',
  score: 85
}
```

## Performance

- **Execution time**: Depends on compliance script (~10-60 seconds)
- **Database queries**: Optimized with indexes
- **Concurrent executions**: Limited to 5 by default
- **Memory**: ~5-10 MB per execution

## Future Enhancements

- Custom policy scripts (user-defined)
- Policy dependencies (run A before B)
- Email/Slack notifications on failures
- PDF report generation
- Dashboard visualizations
- Webhook callbacks on completion

## Testing

Run tests:
```bash
node test-policies-plugin.js
```

## License

MIT
