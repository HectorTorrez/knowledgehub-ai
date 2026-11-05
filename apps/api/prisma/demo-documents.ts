export const demoDocuments = [
  {
    slug: 'employee-handbook',
    title: 'Employee Handbook',
    content: `# Northwind Labs Employee Handbook

Northwind Labs is a fictional software company building tools for distributed teams.

## Working hours and time off
Our team works flexible hours, with shared collaboration time from 10:00 to 15:00 Central Time. Full-time employees receive 20 days of paid time off per year and 12 company holidays. Request time off in the HR portal at least two weeks in advance when possible. Managers approve requests based on team coverage.

## Security
Use a password manager and multi-factor authentication for company accounts. Report a lost device or suspected security incident to security@northwind.example immediately. Never include customer credentials in a support ticket.

## Onboarding
New team members meet their manager on day one, complete security training during their first week, and agree on a 30-day onboarding plan with their mentor.
`,
  },
  {
    slug: 'product-roadmap',
    title: 'Product Roadmap 2026',
    content: `# Northwind Labs Product Roadmap 2026

## Goals
Help customers find reliable answers in their internal knowledge. Our priorities are faster onboarding, accurate search, and clear source citations.

## Quarter 1
Launch a shared document library with organization-level permissions. Measure activation as the percentage of new teams that upload at least three documents within seven days.

## Quarter 2
Release semantic search and answers with citations. The target is for 80% of pilot users to find a relevant source in their first three searches.

## Quarter 3
Add document collections and usage insights. Product manager Maya Chen owns the roadmap; engineering lead Alex Rivera owns delivery.

## Risks
Search quality depends on document freshness and extraction quality. The team reviews failed processing jobs weekly and asks document owners to refresh outdated material.
`,
  },
  {
    slug: 'incident-response',
    title: 'Incident Response Playbook',
    content: `# Northwind Labs Incident Response Playbook

## Severity
Severity 1 means a critical outage or confirmed exposure of customer data. Severity 2 means a major feature is unavailable without a reasonable workaround. Severity 3 means a limited issue with a workaround.

## Response
The on-call engineer acknowledges a Severity 1 incident within 15 minutes, opens an incident channel, and assigns an incident commander. The commander coordinates investigation and sends a status update every 30 minutes until mitigation.

## Recovery and follow-up
Verify service health and customer impact before closing the incident. Within two business days, the incident commander writes a blameless review describing the timeline, root cause, customer impact, and owners for follow-up actions. Security incidents are reported to the security team immediately.
`,
  },
] as const;
