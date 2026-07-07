import { store } from '../state.js';
import { renderWorkspaceBoard } from '../components/workspaceBoard.js';

export function render(container) {
  const state = store.state;
  const nodes = state.clusterNodes;

  // Selected container for log inspector
  if (!window.__activeContainerLogName) {
    window.__activeContainerLogName = 'gateway-service';
  }
  const selectedContainer = window.__activeContainerLogName;

  // Service container lists
  const containers = [
    { name: 'gateway-service', status: 'Running', ports: '8080:80', uptime: '12d 4h', cpu: '4.2%', ram: '112MB' },
    { name: 'auth-api', status: 'Running', ports: '8081:80', uptime: '12d 4h', cpu: '1.8%', ram: '94MB' },
    { name: 'db-primary-replica', status: 'Running', ports: '5432:5432', uptime: '48d 18h', cpu: '12.4%', ram: '840MB' },
    { name: 'cache-redis', status: 'Running', ports: '6379:6379', uptime: '48d 18h', cpu: '0.9%', ram: '240MB' },
    { name: 'telemetry-collector', status: 'Running', ports: '4317:4317', uptime: '4d 2h', cpu: '6.5%', ram: '180MB' },
    { name: 'finance-ledger-processor', status: 'Running', ports: '8085:80', uptime: '4d 2h', cpu: '0.2%', ram: '88MB' },
    { name: 'compliance-auditor', status: 'Running', ports: '8089:80', uptime: '6h 12m', cpu: '0.5%', ram: '64MB' },
    { name: 'notify-dispatcher', status: 'Running', ports: '8083:80', uptime: '12d 4h', cpu: '0.1%', ram: '42MB' }
  ];

  // Container mock stdout log lines
  const containerLogs = {
    'gateway-service': [
      '[14:52:10] Ingress router mapping reloaded.',
      '[14:53:14] GET /api/v1/executive/metrics - 200 OK (12ms)',
      '[14:54:18] GET /api/v1/compliance/score - 200 OK (8ms)',
      '[14:55:01] Rate-limiter cache verified. 0 requests throttled.',
      '[14:56:00] GET /api/v1/infrastructure/telemetry - 200 OK (15ms)',
      '[PMAS Ingress Trace]: Ingress cluster load spike linked to active Marketing Campaign ("Enterprise Lead-Gen Google Search").'
    ],
    'auth-api': [
      '[14:48:02] JWKS certificate keystore initialized.',
      '[14:50:11] Token issued: uid=1042 role=VP_OF_PRODUCT',
      '[14:52:14] Token verified: uid=1042 scope=admin',
      '[14:54:19] Token verified: uid=1042 scope=admin',
      '[14:56:00] Token verified: uid=1042 scope=admin'
    ],
    'db-primary-replica': [
      '[14:10:02] Autovacuum completed on schema public.audit_logs',
      '[14:32:44] Database cluster replication lag: 4ms',
      '[14:50:00] Connection pool expanded: 42 active client slots',
      '[14:55:12] Executing query: SELECT * FROM compliance_matrix WHERE active = true',
      '[14:56:00] Replication lag status: Healthy (2ms)'
    ],
    'cache-redis': [
      '[12:00:00] DB 0: 412 keys saved to RDB snapshot on disk.',
      '[13:00:00] DB 0: 418 keys saved to RDB snapshot on disk.',
      '[14:00:00] DB 0: 424 keys saved to RDB snapshot on disk.',
      '[14:54:11] Cache HIT ratio: 98.42% (14,204 requests)',
      '[14:56:00] Eviction count: 0 keys evicted.'
    ],
    'telemetry-collector': [
      '[14:54:10] Scraped Prometheus telemetry targets. 4 services reporting.',
      '[14:54:30] Flushed 140 metric datapoints to InfluxDB core.',
      '[14:55:10] Scraped Prometheus telemetry targets. 4 services reporting.',
      '[14:55:30] Flushed 145 metric datapoints to InfluxDB core.',
      '[14:56:00] Scraped Prometheus telemetry targets. 4 services reporting.'
    ],
    'finance-ledger-processor': [
      '[14:00:10] Starting Q2 CapEx final reconciliation ledger sync.',
      '[14:05:12] Ledger sync: 412 entries processed.',
      '[14:10:15] Ledger sync: Completed successfully.',
      '[14:42:00] Capital burn computation triggered by VP of Product session.',
      '[14:56:00] Ledger listener polling active (0 transactions pending)'
    ],
    'compliance-auditor': [
      '[14:50:01] Spawning local GDPR / CCPA compliance assessment engine.',
      '[14:50:05] Audit loaded. Active checks database size: 8.',
      '[14:50:10] Completed audit check run. Total score: 62.5%.',
      '[14:52:12] Check toggled: gdpr-privacy. Score recalculated: 75.0%.',
      '[14:56:00] Awaiting state subscriber notification signals...'
    ],
    'notify-dispatcher': [
      '[14:50:00] SMTP and Slack webhook notification systems initialized.',
      '[14:50:11] Dispatching Slack notification: "Sarah Jenkins logged in"',
      '[14:52:12] Dispatching Slack notification: "Compliance Score modified to 75%"',
      '[14:54:10] Mail dispatcher check: 0 queued emails.',
      '[14:56:00] Notification system heartbeat: 200 OK'
    ]
  };

  const selectedLogs = containerLogs[selectedContainer] || [];

  // Check if staging replica task is completed to conditionally show pod
  const stagingTask = state.workspaceItems.find(i => i.id === 'item-11');
  const isStagingReplicaReady = stagingTask && stagingTask.status === 'Completed';
  const extendedContainers = [...containers];
  if (isStagingReplicaReady) {
    extendedContainers.push({
      name: 'staging-replica-v1.4',
      status: 'Running',
      ports: '8080:80',
      uptime: '2h 15m',
      cpu: '3.1%',
      ram: '156MB'
    });
    containerLogs['staging-replica-v1.4'] = [
      '[14:50:00] Replica instance spawned from provisioning task #TSK-11.',
      '[14:52:10] Health check passed. Accepting mirrored traffic.',
      '[14:54:00] Replication lag: 0ms. All indices synchronized.',
      '[14:56:00] Status: STABLE - 0 errors reported.'
    ];
  }

  container.innerHTML = `
    <!-- Top Row: Cluster Node Allocations -->
    <div class="card mb-4" style="padding: 1.25rem;">
      <div class="card-title" style="margin-bottom: 1rem;">
        <span>Live Cluster Node Allocation Telemetry</span>
        <span class="badge badge-success">3 Clusters Online</span>
      </div>
      
      <div class="grid grid-cols-3">
        ${nodes.map((node, index) => {
          // Warning threshold for active indicators
          const isWarning = node.cpu > 80 || node.ram > 80;
          return `
            <div class="infra-node">
              <div class="infra-node-status">
                <div class="pulse-indicator pulse-active" style="background-color: ${isWarning ? 'var(--color-warning)' : 'var(--color-success)'}; box-shadow: 0 0 0 0 ${isWarning ? 'rgba(245,158,11,0.7)' : 'rgba(16,185,129,0.7)'};"></div>
                <div class="flex-col">
                  <span style="font-weight:700; font-size: 0.85rem;" class="font-mono">${node.name}</span>
                  <span style="font-size:0.65rem; color:var(--text-dim);">${node.region}</span>
                </div>
              </div>
              
              <div class="flex-col" style="gap: 10px; margin-top: 1rem;">
                <!-- CPU Meter -->
                <div class="flex-col" style="gap: 4px;">
                  <div class="flex-between" style="font-size:0.7rem;">
                    <span style="color:var(--text-muted);">CPU Utilization</span>
                    <span class="font-mono" style="font-weight:600; color:${node.cpu > 80 ? 'var(--color-warning)' : 'var(--text-on-surface)'}">${node.cpu}%</span>
                  </div>
                  <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow:hidden;">
                    <div style="width: ${node.cpu}%; background: ${node.cpu > 80 ? 'var(--color-warning)' : 'var(--color-primary)'}; height: 100%;"></div>
                  </div>
                </div>

                <!-- RAM Meter -->
                <div class="flex-col" style="gap: 4px;">
                  <div class="flex-between" style="font-size:0.7rem;">
                    <span style="color:var(--text-muted);">RAM Allocation</span>
                    <span class="font-mono" style="font-weight:600; color:${node.ram > 80 ? 'var(--color-danger)' : 'var(--text-on-surface)'}">${node.ram}%</span>
                  </div>
                  <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow:hidden;">
                    <div style="width: ${node.ram}%; background: ${node.ram > 80 ? 'var(--color-danger)' : 'var(--color-info)'}; height: 100%;"></div>
                  </div>
                </div>

                <!-- Disk Meter -->
                <div class="flex-col" style="gap: 4px;">
                  <div class="flex-between" style="font-size:0.7rem;">
                    <span style="color:var(--text-muted);">Disk Allocation</span>
                    <span class="font-mono" style="font-weight:600;">${node.disk}%</span>
                  </div>
                  <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow:hidden;">
                    <div style="width: ${node.disk}%; background: var(--text-dim); height: 100%;"></div>
                  </div>
                </div>
              </div>

              <!-- Estimated Hourly Cost Impact -->
              <div class="flex-between" style="font-size:0.7rem; margin-top: 0.75rem; padding: 0.35rem 0.5rem; background: rgba(255,255,255,0.02); border-radius: 4px;">
                <span style="color:var(--text-muted);">Estimated Hourly Cost Impact:</span>
                <span class="font-mono" style="font-weight:700; color:${node.name === 'eu-central-ingress-03' ? 'var(--color-warning)' : 'var(--text-dim)'}">$${node.name === 'eu-central-ingress-03' ? '4.20' : node.name === 'us-east-core-01' ? '2.45' : '1.85'}/hr</span>
              </div>
              
              <div style="margin-top: 1rem; border-top:1px solid rgba(255,255,255,0.03); padding-top:0.5rem; display:flex; justify-content:space-between; font-size:0.65rem; color:var(--text-dim);" class="font-mono">
                <span>VM: ${node.host}</span>
                <span>Active 48d</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Center Section: Server Container Statuses & Migration Timeline -->
    <div class="grid grid-cols-3" style="grid-template-columns: 2fr 1fr;">
      
      <!-- Container Registry Grid & Logs Inspector -->
      <div class="card flex flex-col" style="padding: 1.25rem;">
        <div class="card-title">
          <span>Kubernetes Pod Status Dashboard</span>
          <span style="font-size: 0.75rem; color:var(--text-muted);">Click a service pod to inspect logs</span>
        </div>
        
        <!-- Micro-pods list -->
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 0.75rem; margin-bottom: 1.25rem;">
          ${extendedContainers.map(container => {
            const isSelected = container.name === selectedContainer;
            return `
              <div class="infra-pod-card" data-name="${container.name}" style="
                background: ${isSelected ? 'var(--bg-surface-elevated)' : 'rgba(255,255,255,0.02)'};
                border: 1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-outline-variant-60)'};
                border-radius: 6px;
                padding: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
                gap: 4px;
              ">
                <span class="font-mono" style="font-size: 0.75rem; font-weight:700; color: ${isSelected ? 'var(--text-on-surface)' : 'var(--text-muted)'}; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${container.name}">
                  ${container.name}
                </span>
                <div class="flex" style="align-items: center; gap: 4px; margin-top: 4px;">
                  <div style="width: 6px; height: 6px; border-radius: 50%; background-color: var(--color-success);"></div>
                  <span style="font-size: 0.65rem; color: var(--text-dim);">${container.ram}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Inline Console Logs for Selected Container -->
        <div style="background: #040508; border-radius: 4px; border: 1px solid rgba(255,255,255,0.03); padding: 10px; flex-grow:1; display:flex; flex-direction:column;">
          <div class="flex-between" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; margin-bottom: 6px; font-size: 0.7rem; color: var(--text-dim);">
            <span class="font-mono">Pod stdout: <strong style="color:var(--color-primary);">${selectedContainer}</strong></span>
            <span class="font-mono" style="display:flex;align-items:center;gap:8px;">
              <span>Status: ACTIVE</span>
              <span style="display:flex;align-items:center;gap:3px;padding:1px 5px;background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2);border-radius:4px;">
                <span style="width:4px;height:4px;border-radius:50%;background:var(--color-info);display:inline-block;"></span>
                Log Mode: Product Telemetry
              </span>
            </span>
          </div>
          <div class="font-mono" style="font-size:0.75rem; color:#a3b3c3; line-height:1.5; white-space:pre-wrap; overflow-y:auto; max-height:120px;">
            ${selectedLogs.map(log => `<div>${log}</div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Migration Timeline -->
      <div class="card" style="padding: 1.25rem;">
        <div class="card-title">
          <span>DB Schema Migrations</span>
          <span class="badge badge-info" style="font-size: 0.65rem;">Sequencer v2</span>
        </div>
        
        <div class="timeline" style="margin-top: 1.25rem;">
          
          <div class="timeline-item">
            <div class="timeline-dot completed"></div>
            <span class="timeline-date">Jun 20, 2026</span>
            <div class="timeline-title">v1.2.0 - Auth Schemas
              <span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 6px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:4px;font-size:0.6rem;font-family:var(--font-mono);color:var(--color-primary);cursor:pointer;">Linked: #PR-1041</span>
            </div>
            <p class="timeline-desc">Splitting OAuth metadata client fields and user preference hashes.</p>
          </div>

          <div class="timeline-item">
            <div class="timeline-dot completed"></div>
            <span class="timeline-date">Jun 25, 2026</span>
            <div class="timeline-title">v1.3.0 - Audit Tables</div>
            <p class="timeline-desc">Partitioning aggregate audit data structures by month indices.</p>
          </div>

          <div class="timeline-item">
            <div class="timeline-dot active"></div>
            <span class="timeline-date">Jun 27, 2026</span>
            <div class="timeline-title">v1.4.0 - Cache Split
              <span style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 6px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:4px;font-size:0.6rem;font-family:var(--font-mono);color:var(--color-primary);cursor:pointer;">Linked: #PR-1040</span>
            </div>
            <p class="timeline-desc" style="color: var(--color-warning);">Deploying active dashboard cache nodes and ledger indexes.</p>
          </div>

          <div class="timeline-item">
            <div class="timeline-dot" style="border-color: var(--text-dim);"></div>
            <span class="timeline-date">Jul 05, 2026</span>
            <div class="timeline-title" style="color: var(--text-muted);">v1.5.0 - Compliance Triggers</div>
            <p class="timeline-desc">Auto auditing triggers for Legal databases to update telemetry.</p>
          </div>

        </div>
      </div>

    </div>
  `;

  // --- BIND EVENT HANDLERS ---
  
  // Container selectors
  const podCards = container.querySelectorAll('.infra-pod-card');
  podCards.forEach(card => {
    card.addEventListener('click', (e) => {
      const name = e.currentTarget.getAttribute('data-name');
      window.__activeContainerLogName = name;
      // Re-render infrastructure view to display new logs
      render(container);
    });
  });

  // Render Departmental Operations & Collaboration Board
  renderWorkspaceBoard(container, 'infrastructure');
}
