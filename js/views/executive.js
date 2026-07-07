import { store } from '../state.js';

export function render(container) {
  if (container._cleanupEvents) {
    container._cleanupEvents();
    container._cleanupEvents = null;
  }

  const state = store.state;
  const complianceScore = store.getCompliancePercent();
  
  const complianceThreshold = state.settings?.complianceThreshold || 75;
  let complianceColor = 'var(--color-success)';
  if (complianceScore < 50) {
    complianceColor = 'var(--color-danger)';
  } else if (complianceScore < complianceThreshold) {
    complianceColor = 'var(--color-warning)';
  }
  
  // Calculate blocker severity counts
  const activeBlockers = state.blockers.filter(b => b.status === 'Blocked');
  const criticalCount = activeBlockers.filter(b => b.severity === 'Critical').length;
  const highCount = activeBlockers.filter(b => b.severity === 'High').length;
  const mediumCount = activeBlockers.filter(b => b.severity === 'Medium').length;
  const lowCount = activeBlockers.filter(b => b.severity === 'Low').length;
  const maxBarVal = Math.max(criticalCount, highCount, mediumCount, lowCount, 1);

  // Setup dynamic list filters
  const filterVal = window.__executiveFilterValue || 'all-blockers';
  let displayedItems = [];
  if (filterVal === 'all-blockers') {
    displayedItems = state.workspaceItems.filter(item => item.type === 'blocker');
  } else if (filterVal === 'all-items') {
    displayedItems = state.workspaceItems;
  } else {
    displayedItems = state.workspaceItems.filter(item => item.workspace === filterVal);
  }

  const isAllItems = filterVal === 'all-items' || filterVal !== 'all-blockers';
  const descriptionHeader = isAllItems ? 'Operational Item Description' : 'Blocker Description';
  const ownerHeader = isAllItems ? 'Owner / Dept' : 'Assigned Owner';

  // Selected node in dependency graph (keep it persistent across updates if set)
  if (!window.__selectedGraphNode) {
    window.__selectedGraphNode = 'engineering';
  }
  const selectedNode = window.__selectedGraphNode;

  // Node telemetry database dynamically computed
  const getWorkspaceStatsSummary = (wsKey) => {
    const items = state.workspaceItems.filter(i => i.workspace === wsKey);
    const tasks = items.filter(i => i.type === 'task' && i.status !== 'Completed').length;
    const issues = items.filter(i => i.type === 'issue' && i.status !== 'Completed').length;
    const handoffs = items.filter(i => i.type === 'handoff' && i.status !== 'Completed').length;
    const blockers = items.filter(i => i.type === 'blocker' && i.status === 'Blocked').length;
    
    return `${tasks} Tasks, ${issues} Issues, ${handoffs} Handoffs, ${blockers} Blockers pending.`;
  };

  const nodeTelemetry = {
    uiux: {
      name: 'UI/UX & Market Research',
      owner: 'Elena Rostova (Lead Designer)',
      status: 'Active / Testing',
      metric: `${state.workspaceItems.filter(i => i.workspace === 'uiux' && i.type === 'task' && i.status !== 'Completed').length} Pending Tasks`,
      details: `UI/UX Usability Score: 92%. Operational status: ${getWorkspaceStatsSummary('uiux')} Figma token variables clean.`,
      systemLoad: '12 Figma Nodes',
      lastUpdate: '10m ago'
    },
    engineering: {
      name: 'Engineering Core APIs',
      owner: 'Marcus Aurel (Principal Architect)',
      status: 'Deploying Updates',
      metric: `${state.workspaceItems.filter(i => i.workspace === 'engineering' && i.type === 'issue' && i.status !== 'Completed').length} Open Issues`,
      details: `CI/CD test suites reporting ${state.pipeline.coverage}% code coverage. Operational status: ${getWorkspaceStatsSummary('engineering')} Sub-systems stable.`,
      systemLoad: '4 Services Running',
      lastUpdate: 'Just now'
    },
    infrastructure: {
      name: 'Infrastructure Gateways',
      owner: 'DevOps Pod 3',
      status: 'Warning Threshold',
      metric: `${state.workspaceItems.filter(i => i.workspace === 'infrastructure' && i.type === 'blocker' && i.status === 'Blocked').length} Active Blockers`,
      details: `Frankfurt Ingress replica limits verified. Operational status: ${getWorkspaceStatsSummary('infrastructure')} Cluster gateways stable.`,
      systemLoad: '3 Clusters Active',
      lastUpdate: '2m ago'
    },
    legalhr: {
      name: 'Legal & Privacy Clearance',
      owner: 'Diana Prince (General Counsel)',
      status: 'Auditing Checks',
      metric: `${complianceScore}% GDPR Compliance`,
      details: `GDPR controls checked: ${state.complianceChecklist.filter(c => c.checked).length}/${state.complianceChecklist.length}. Operational status: ${getWorkspaceStatsSummary('legalhr')} SOC2 dry-runs active.`,
      systemLoad: '8 Controls Tracked',
      lastUpdate: '4m ago'
    },
    marketing: {
      name: 'Marketing Acquisition',
      owner: 'Clara Oswald (Lead Marketer)',
      status: 'Campaigns Active',
      metric: `${state.workspaceItems.filter(i => i.workspace === 'marketing' && i.type === 'task' && i.status !== 'Completed').length} Pending Tasks`,
      details: `Google Ads active. Operational status: ${getWorkspaceStatsSummary('marketing')} Analytics integration verifying.`,
      systemLoad: '2 Camp. Active',
      lastUpdate: '6m ago'
    },
    finance: {
      name: 'Finance Ledger',
      owner: 'Sarah Jenkins (Acting CFO)',
      status: 'Under Budget',
      metric: '62.5% CapEx Ratio',
      details: `Q2 Actual Spend: $1.98M / $2.0M target. Operational status: ${getWorkspaceStatsSummary('finance')} Ledger reconciliation stable.`,
      systemLoad: 'Q2 Audit Safe',
      lastUpdate: '12m ago'
    }
  };

  const activeNodeInfo = nodeTelemetry[selectedNode] || nodeTelemetry['engineering'];

  // Default positions for all 6 nodes
  const defaultPositions = {
    marketing: { x: 90, y: 110 },
    finance: { x: 90, y: 290 },
    uiux: { x: 290, y: 110 },
    legalhr: { x: 290, y: 290 },
    engineering: { x: 510, y: 200 },
    infrastructure: { x: 710, y: 200 }
  };

  if (!window.__graphNodePositions) {
    window.__graphNodePositions = JSON.parse(JSON.stringify(defaultPositions));
  }

  // Persistent pan & zoom defaults
  if (window.__graphZoomScale === undefined) window.__graphZoomScale = 1.0;
  if (window.__graphPanX === undefined) window.__graphPanX = 0;
  if (window.__graphPanY === undefined) window.__graphPanY = 0;

  const nodePositions = window.__graphNodePositions;
  const zoomScale = window.__graphZoomScale;
  const panX = window.__graphPanX;
  const panY = window.__graphPanY;

  // Helper metrics for dynamic statuses and badge displays
  const getPendingCount = (nodeId) => {
    const items = state.workspaceItems.filter(i => i.workspace === nodeId);
    return items.filter(i => i.status !== 'Completed' && i.status !== 'Resolved').length;
  };

  const getHasBlockers = (nodeId) => {
    const items = state.workspaceItems.filter(i => i.workspace === nodeId);
    return items.some(i => i.type === 'blocker' && i.status === 'Blocked');
  };

  const getNodeStatus = (nodeId) => {
    const items = state.workspaceItems.filter(i => i.workspace === nodeId);
    const blockers = items.filter(i => i.type === 'blocker' && i.status === 'Blocked');
    if (blockers.some(b => b.severity === 'Critical')) return 'critical';
    if (blockers.length > 0) return 'warning';
    const activeIssues = items.filter(i => i.type === 'issue' && i.status !== 'Completed');
    if (activeIssues.length > 0) return 'warning';
    return 'healthy';
  };

  const getStatusColor = (status) => {
    if (status === 'critical') return 'var(--color-danger)';
    if (status === 'warning') return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  const getIconSvg = (nodeId) => {
    switch (nodeId) {
      case 'uiux':
        return `<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"></path><circle cx="12" cy="12" r="3"></circle>`;
      case 'engineering':
        return `<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>`;
      case 'infrastructure':
        return `<rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line>`;
      case 'marketing':
        return `<path d="M23 7l-7 5 7 5V7z"></path><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>`;
      case 'finance':
        return `<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>`;
      case 'legalhr':
        return `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`;
      default:
        return '';
    }
  };

  // Define macro dependencies
  const dependencies = [
    { from: 'marketing', to: 'uiux', label: 'Design requests' },
    { from: 'marketing', to: 'finance', label: 'Campaign budgets' },
    { from: 'uiux', to: 'engineering', label: 'UI implementation' },
    { from: 'finance', to: 'engineering', label: 'Funding limits' },
    { from: 'legalhr', to: 'engineering', label: 'SOC2 checklist' },
    { from: 'legalhr', to: 'infrastructure', label: 'GDPR location compliance' },
    { from: 'engineering', to: 'infrastructure', label: 'Ingress routing & proxy deployments' }
  ];

  const computeBezierPath = (fromNode, toNode) => {
    const fromPos = nodePositions[fromNode];
    const toPos = nodePositions[toNode];
    if (!fromPos || !toPos) return '';
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const cp1x = fromPos.x + dx * 0.45;
    const cp1y = fromPos.y;
    const cp2x = fromPos.x + dx * 0.55;
    const cp2y = toPos.y;
    return `M ${fromPos.x} ${fromPos.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toPos.x} ${toPos.y}`;
  };

  container.innerHTML = `
    <!-- Top KPI Grid -->
    <div class="grid grid-cols-4 mb-4">
      
      <!-- KPI 1: Global Project Completion -->
      <div class="card">
        <div class="card-title">
          <span>Global Progress</span>
          <span class="badge badge-success">74% Target</span>
        </div>
        <div class="flex" style="align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.5rem;">
          <div class="flex-col">
            <span class="card-value">74.0%</span>
            <span class="card-subtitle">Sprint 24 of Annual Roadmap</span>
          </div>
          <!-- Dual ring SVG progress -->
          <div class="kpi-dual-ring" style="flex-shrink: 0;">
            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%;">
              <circle class="kpi-circle-bg" cx="18" cy="18" r="16"></circle>
              <!-- Outer Ring: 74% -->
              <circle class="kpi-circle-outer" cx="18" cy="18" r="16" stroke-dasharray="100, 100" stroke-dashoffset="26"></circle>
              <!-- Inner Ring: 55% -->
              <circle class="kpi-circle-inner" cx="18" cy="18" r="12" stroke-dasharray="100, 100" stroke-dashoffset="45" style="transform: rotate(-90deg); transform-origin: 18px 18px;"></circle>
            </svg>
          </div>
        </div>
        <div class="card-subtitle flex" style="justify-content: space-between; align-items: center; margin-top: 0.75rem; font-size: 0.7rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem;">
          <span class="flex" style="align-items: center; gap: 0.25rem;">
            <span style="display:inline-block; width:6px; height:6px; background:var(--color-primary); border-radius:50%;"></span>
            Roadmap
          </span>
          <span class="flex" style="align-items: center; gap: 0.25rem;">
            <span style="display:inline-block; width:6px; height:6px; background:var(--color-info); border-radius:50%;"></span>
            Sprint (55%)
          </span>
        </div>
      </div>

      <!-- KPI 2: Cross-Departmental Blockers -->
      <div class="card">
        <div class="card-title">
          <span>Active Blockers</span>
          <span class="badge ${activeBlockers.length > 3 ? 'badge-danger' : 'badge-warning'}">${activeBlockers.length} Active</span>
        </div>
        <div class="flex" style="align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.5rem;">
          <div class="flex-col">
            <span class="card-value">${activeBlockers.length}</span>
            <span class="card-subtitle">Critical Dev Dependencies</span>
          </div>
          <!-- Severity Bar graph -->
          <div style="width: 4rem; height: 3.5rem; display: flex; align-items: flex-end; justify-content: space-between; gap: 4px;">
            <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
              <div style="width: 100%; height: ${(criticalCount / maxBarVal) * 30 + 2}px; background: var(--color-danger); border-radius: 1px;" title="Critical: ${criticalCount}"></div>
              <span class="font-mono" style="font-size: 0.55rem; color: var(--text-dim); margin-top: 2px;">C</span>
            </div>
            <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
              <div style="width: 100%; height: ${(highCount / maxBarVal) * 30 + 2}px; background: var(--color-warning); border-radius: 1px;" title="High: ${highCount}"></div>
              <span class="font-mono" style="font-size: 0.55rem; color: var(--text-dim); margin-top: 2px;">H</span>
            </div>
            <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
              <div style="width: 100%; height: ${(mediumCount / maxBarVal) * 30 + 2}px; background: var(--color-primary); border-radius: 1px;" title="Medium: ${mediumCount}"></div>
              <span class="font-mono" style="font-size: 0.55rem; color: var(--text-dim); margin-top: 2px;">M</span>
            </div>
            <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
              <div style="width: 100%; height: ${(lowCount / maxBarVal) * 30 + 2}px; background: var(--text-dim); border-radius: 1px;" title="Low: ${lowCount}"></div>
              <span class="font-mono" style="font-size: 0.55rem; color: var(--text-dim); margin-top: 2px;">L</span>
            </div>
          </div>
        </div>
        <div class="card-subtitle" style="font-size: 0.7rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem; margin-top: 0.75rem;">
          Avg Resolution Time: <span class="font-mono" style="color: var(--text-on-surface); font-weight:600;">18.4 hrs</span>
        </div>
      </div>

      <!-- KPI 3: Total Capital Burn & Runaway -->
      <div class="card">
        <div class="card-title">
          <span>Capital Burn</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">Q2 Cumulative</span>
        </div>
        <div class="flex" style="align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem;">
          <div class="flex-col">
            <span class="card-value" style="font-size: 1.5rem;">$2.0M</span>
            <span class="card-subtitle">Burn: <span class="font-mono">$165k/mo</span></span>
          </div>
          <!-- Inline Area Chart Sparkline -->
          <div style="width: 5rem; height: 3.5rem; flex-shrink: 0;">
            <svg viewBox="0 0 100 60" style="width: 100%; height: 100%;">
              <defs>
                <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.3"></stop>
                  <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.05"></stop>
                </linearGradient>
              </defs>
              <!-- Ideal milestone budget line -->
              <line x1="0" y1="50" x2="100" y2="20" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-dasharray="3,3"></line>
              <!-- Actual area fill -->
              <path d="M 0 55 Q 25 50, 50 38 T 100 24 L 100 60 L 0 60 Z" fill="url(#area-grad)"></path>
              <!-- Actual line -->
              <path d="M 0 55 Q 25 50, 50 38 T 100 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round"></path>
              <!-- End point dot -->
              <circle cx="100" cy="24" r="2.5" fill="var(--color-primary)"></circle>
            </svg>
          </div>
        </div>
        <div class="card-subtitle" style="font-size: 0.7rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem; margin-top: 0.75rem;">
          Forecast Runaway: <span class="font-mono" style="color: var(--color-success); font-weight:600;">14.5 Months</span>
        </div>
      </div>

      <!-- KPI 4: Compliance Index -->
      <div class="card">
        <div class="card-title">
          <span>Compliance Index</span>
          <span style="font-size: 0.75rem; color: var(--color-success); font-weight: 600;">Safe</span>
        </div>
        <div class="flex" style="align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.5rem;">
          <div class="flex-col">
            <span class="card-value">${complianceScore}%</span>
            <span class="card-subtitle">GDPR, CCPA, SOC2</span>
          </div>
          <!-- Gauge SVG -->
          <div style="width: 4rem; height: 3rem; flex-shrink: 0; position: relative;">
            <svg viewBox="0 0 100 50" style="width: 100%; height: 100%;">
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8" stroke-linecap="round"></path>
              <!-- Active fill based on complianceScore -->
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="${complianceColor}" stroke-width="8" stroke-linecap="round"
                    stroke-dasharray="126" stroke-dashoffset="${126 - (126 * complianceScore) / 100}"
                    style="transition: stroke-dashoffset 0.8s ease-in-out;"></path>
            </svg>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 0.55rem; color: var(--text-dim);" class="font-mono">
              SCORE
            </div>
          </div>
        </div>
        <div class="card-subtitle" style="font-size: 0.7rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem; margin-top: 0.75rem;">
          Active Controls: <span class="font-mono" style="color: var(--text-on-surface); font-weight:600;">5/8 Audits Verified</span>
        </div>
      </div>

    </div>

    <!-- Center Section: Graph & Node Telemetry Panel -->
    <div class="grid grid-cols-3 mb-4" style="grid-template-columns: 2fr 1fr;">
      
      <!-- Dependency Graph Canvas Container -->
      <div class="card flex flex-col" style="padding: 1rem; min-height: 440px;">
        <div class="card-title" style="margin-bottom: 0.5rem;">
          <span>Macro Cross-Functional Dependency Graph</span>
          <span style="font-size: 0.75rem; color: var(--text-dim);">Pan, Zoom (Scroll/Buttons) & Drag Nodes</span>
        </div>
        <div style="position: relative; flex-grow: 1; overflow: hidden; background: #080a10; border-radius: 0.5rem;">
          <!-- Graph HUD controls -->
          <div class="graph-hud">
            <button type="button" class="hud-btn" id="graph-zoom-in" title="Zoom In">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button type="button" class="hud-btn" id="graph-zoom-out" title="Zoom Out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button type="button" class="hud-btn" id="graph-zoom-reset" title="Reset Graph View & Positions">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </button>
          </div>

          <!-- Graph Legend -->
          <div class="graph-legend">
            <div class="legend-title">System Health</div>
            <div class="legend-item">
              <span class="legend-color-dot" style="background: var(--color-success);"></span>
              <span>Healthy / Ready</span>
            </div>
            <div class="legend-item">
              <span class="legend-color-dot" style="background: var(--color-warning);"></span>
              <span>Pending / Active Issues</span>
            </div>
            <div class="legend-item">
              <span class="legend-color-dot" style="background: var(--color-danger);"></span>
              <span>Critical Blocker</span>
            </div>
          </div>

          <!-- Tooltip overlay element -->
          <div class="graph-tooltip" id="graph-tooltip" style="display: none;"></div>

          <!-- SVG Canvas -->
          <svg class="dependency-graph-svg" id="pmas-dependency-graph" style="width: 100%; height: 100%; min-height: 400px; display: block;">
            <defs>
              <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.8"/>
                <stop offset="50%" stop-color="var(--color-info)" stop-opacity="0.9"/>
                <stop offset="100%" stop-color="var(--color-success)" stop-opacity="0.8"/>
              </linearGradient>
              <!-- Arrow Marker definitions -->
              <marker id="arrow" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(99, 102, 241, 0.4)"/>
              </marker>
              <marker id="arrow-active" viewBox="0 0 10 10" refX="24" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-primary)"/>
              </marker>
            </defs>

            <!-- Viewport transformation group -->
            <g id="viewport-group" transform="translate(${panX}, ${panY}) scale(${zoomScale})">
              <!-- Grid lines inside group for moving grid backdrop -->
              <defs>
                <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.015)" stroke-width="1"/>
                </pattern>
              </defs>
              <rect x="-3000" y="-3000" width="6000" height="6000" fill="url(#grid-pattern)" pointer-events="none"></rect>

              <!-- Flows / Connector paths -->
              ${dependencies.map(dep => {
                const active = selectedNode === dep.from || selectedNode === dep.to;
                return `<path id="edge-${dep.from}-${dep.to}" d="${computeBezierPath(dep.from, dep.to)}" class="edge-path ${active ? 'active' : ''}" stroke="${active ? 'url(#edge-gradient)' : 'rgba(99, 102, 241, 0.22)'}" stroke-opacity="${active ? 1.0 : 0.35}" stroke-width="${active ? 2.5 : 1.25}" marker-end="${active ? 'url(#arrow-active)' : 'url(#arrow)'}"></path>`;
              }).join('')}

              <!-- Nodes -->
              ${['marketing', 'finance', 'uiux', 'legalhr', 'engineering', 'infrastructure'].map(nodeId => {
                const pos = nodePositions[nodeId];
                const status = getNodeStatus(nodeId);
                const color = getStatusColor(status);
                const pendingCount = getPendingCount(nodeId);
                const hasBlockers = getHasBlockers(nodeId);
                const isSelected = selectedNode === nodeId;
                const tele = nodeTelemetry[nodeId];
                const nameText = tele.name.split(' & ')[0].split(' / ')[0];
                
                return `
                  <g class="node ${isSelected ? 'selected' : ''}" id="node-${nodeId}" transform="translate(${pos.x}, ${pos.y})" data-id="${nodeId}">
                    ${isSelected ? `<circle r="29" fill="none" stroke="${color}" stroke-opacity="0.2" stroke-width="5" class="node-glow"></circle>` : ''}
                    <circle class="node-outer-circle" r="25" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="${status === 'healthy' ? 'none' : '4 2'}"></circle>
                    <circle class="node-main-circle" r="21" fill="var(--bg-surface-elevated)" stroke="${isSelected ? 'var(--color-primary)' : 'rgba(255,255,255,0.12)'}" stroke-width="2"></circle>
                    <g class="node-icon" transform="translate(-9, -9)" stroke="${isSelected ? 'var(--color-primary)' : 'var(--text-on-surface)'}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      ${getIconSvg(nodeId)}
                    </g>
                    ${pendingCount > 0 ? `
                      <g class="node-badge" transform="translate(15, -15)">
                        <circle r="8.5" fill="${hasBlockers ? 'var(--color-danger)' : 'var(--color-primary)'}"></circle>
                        <text text-anchor="middle" dominant-baseline="middle" y="0.5" class="node-badge-text" font-size="8.5" fill="#ffffff" font-weight="bold">${pendingCount}</text>
                      </g>
                    ` : ''}
                    <text y="38" text-anchor="middle" class="node-text">${nameText}</text>
                    <text y="50" text-anchor="middle" class="node-subtitle">${tele.metric}</text>
                  </g>
                `;
              }).join('')}
            </g>
          </svg>
        </div>
      </div>

      <!-- Node Telemetry Inspector Panel -->
      <div class="card flex flex-col" style="padding: 1.25rem;">
        <div class="card-title">
          <span>Flow Inspector</span>
          <span class="badge badge-info" style="font-size: 0.65rem;">Active Node</span>
        </div>
        <div class="flex-col flex-1" style="justify-content: space-between; gap: 1rem; margin-top: 0.5rem;">
          <div class="flex-col" style="gap: 0.75rem;">
            <div>
              <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-on-surface);">${activeNodeInfo.name}</h3>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem;">Lead: ${activeNodeInfo.owner}</p>
            </div>
            
            <div style="border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.75rem; display: flex; justify-content: space-between;">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Telemetry:</span>
              <span class="font-mono" style="font-size: 0.75rem; font-weight: 600; color: var(--color-success);">${activeNodeInfo.metric}</span>
            </div>

            <div style="display: flex; justify-content: space-between;">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Allocated Capacity:</span>
              <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-on-surface); font-family: var(--font-mono);">${activeNodeInfo.systemLoad}</span>
            </div>

            <div style="display: flex; justify-content: space-between;">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Node Health Status:</span>
              <span class="badge badge-success" style="font-size: 0.65rem;">ONLINE</span>
            </div>
            
            <div style="background-color: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 0.375rem; border: 1px solid var(--border-outline-variant-60); margin-top: 0.5rem;">
              <p style="font-size: 0.75rem; line-height: 1.4; color: var(--text-muted);">${activeNodeInfo.details}</p>
            </div>
          </div>

          <div class="flex" style="justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.75rem; font-size: 0.7rem; color: var(--text-dim);">
            <span>Last sync: ${activeNodeInfo.lastUpdate}</span>
            <a href="#/${selectedNode}" class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">Enter Workspace</a>
          </div>
        </div>
      </div>

    </div>

    <!-- Bottom Departmental Health Matrix -->
    <div class="card mb-4" style="padding: 1.25rem;">
      <div class="card-title" style="margin-bottom: 1rem;">
        <span>Multi-Departmental Health Matrix</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">Real-time Telemetry Feeds</span>
      </div>
      
      <div class="grid grid-cols-4" style="gap: 1rem;">
        
        <!-- Department 1: Engineering -->
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-outline-variant-60); border-radius: 0.375rem; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
          <div class="flex-between">
            <span style="font-size: 0.75rem; font-weight:600; color: var(--text-on-surface);">Engineering Core</span>
            <span class="badge badge-success" style="font-size: 0.6rem;">${state.pipeline.status === 'Running' ? 'BUILDING' : 'READY'}</span>
          </div>
          <div class="flex-between" style="margin-top: 0.25rem;">
            <span style="font-size: 0.7rem; color:var(--text-muted);">Weekly Commits</span>
            <span class="font-mono text-success" style="font-size: 0.75rem; font-weight: 700;">+242</span>
          </div>
          <!-- Sparkline representation of commits -->
          <div style="height: 1.5rem; width: 100%; margin-top: 0.25rem;">
            <svg viewBox="0 0 100 20" style="width:100%; height:100%; overflow:visible;">
              <path d="M 0 18 Q 15 5, 30 15 T 60 5 T 90 12 L 100 8" fill="none" stroke="var(--color-success)" stroke-width="1.5" stroke-linecap="round"></path>
            </svg>
          </div>
        </div>

        <!-- Department 2: UI/UX Design -->
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-outline-variant-60); border-radius: 0.375rem; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
          <div class="flex-between">
            <span style="font-size: 0.75rem; font-weight:600; color: var(--text-on-surface);">UI/UX Systems</span>
            <span class="badge badge-info" style="font-size: 0.6rem;">92% UX</span>
          </div>
          <div class="flex-between" style="margin-top: 0.25rem;">
            <span style="font-size: 0.7rem; color:var(--text-muted);">Testing Success Rate</span>
            <span class="font-mono" style="font-size: 0.75rem; font-weight: 700; color: var(--color-info);">98.4%</span>
          </div>
          <!-- Sparkline representing usability scores -->
          <div style="height: 1.5rem; width: 100%; margin-top: 0.25rem;">
            <svg viewBox="0 0 100 20" style="width:100%; height:100%; overflow:visible;">
              <path d="M 0 10 Q 20 2, 40 12 T 80 4 T 100 6" fill="none" stroke="var(--color-info)" stroke-width="1.5" stroke-linecap="round"></path>
            </svg>
          </div>
        </div>

        <!-- Department 3: Infrastructure -->
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-outline-variant-60); border-radius: 0.375rem; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
          <div class="flex-between">
            <span style="font-size: 0.75rem; font-weight:600; color: var(--text-on-surface);">Infrastructure Gateway</span>
            <span class="badge badge-warning" style="font-size: 0.6rem;">89% LOAD</span>
          </div>
          <div class="flex-between" style="margin-top: 0.25rem;">
            <span style="font-size: 0.7rem; color:var(--text-muted);">Memory Load</span>
            <span class="font-mono text-warning" style="font-size: 0.75rem; font-weight: 700;">Avg: ${Math.round(state.clusterNodes.reduce((acc, n) => acc + n.ram, 0) / 3)}%</span>
          </div>
          <!-- Sparkline representing memory load fluctuation -->
          <div style="height: 1.5rem; width: 100%; margin-top: 0.25rem;">
            <svg viewBox="0 0 100 20" style="width:100%; height:100%; overflow:visible;">
              <path d="M 0 12 Q 25 8, 50 16 T 100 6" fill="none" stroke="var(--color-warning)" stroke-width="1.5" stroke-linecap="round"></path>
            </svg>
          </div>
        </div>

        <!-- Department 4: Finance -->
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-outline-variant-60); border-radius: 0.375rem; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
          <div class="flex-between">
            <span style="font-size: 0.75rem; font-weight:600; color: var(--text-on-surface);">Finance & Burn</span>
            <span class="badge badge-success" style="font-size: 0.6rem;">UNDER BUDGET</span>
          </div>
          <div class="flex-between" style="margin-top: 0.25rem;">
            <span style="font-size: 0.7rem; color:var(--text-muted);">CapEx Ratio</span>
            <span class="font-mono text-success" style="font-size: 0.75rem; font-weight: 700;">62.5%</span>
          </div>
          <!-- Micro-dial progress -->
          <div style="height: 1.5rem; width: 100%; margin-top: 0.25rem; display: flex; align-items: center; gap: 10px;">
            <div style="width: 100%; background: rgba(255,255,255,0.05); height: 4px; border-radius: 2px; overflow: hidden;">
              <div style="width: 62.5%; background: var(--color-success); height: 100%;"></div>
            </div>
            <span class="font-mono" style="font-size: 0.65rem; color: var(--text-muted);">CapEx</span>
          </div>
        </div>

      </div>
    </div>

    <!-- Active Blocker Details Drawer (in-page widget) -->
    <div class="card">
      <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <span>Active Blocker Dependency & Operations Logs</span>
        <div class="flex gap-2" style="align-items: center;">
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">Filter:</span>
          <select id="executive-board-filter" class="form-control" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-outline-variant-60); border-radius: 4px; color: var(--text-on-surface); outline: none; width: auto; font-family: var(--font-sans);">
            <option value="all-blockers" ${filterVal === 'all-blockers' ? 'selected' : ''}>All Blockers</option>
            <option value="uiux" ${filterVal === 'uiux' ? 'selected' : ''}>UI/UX Design Workspace</option>
            <option value="engineering" ${filterVal === 'engineering' ? 'selected' : ''}>Engineering Core Workspace</option>
            <option value="infrastructure" ${filterVal === 'infrastructure' ? 'selected' : ''}>Infrastructure Gateway</option>
            <option value="marketing" ${filterVal === 'marketing' ? 'selected' : ''}>Marketing Workspace</option>
            <option value="finance" ${filterVal === 'finance' ? 'selected' : ''}>Finance Ledger</option>
            <option value="legalhr" ${filterVal === 'legalhr' ? 'selected' : ''}>Legal & HR Compliance</option>
            <option value="all-items" ${filterVal === 'all-items' ? 'selected' : ''}>All Operations (Tasks/Issues)</option>
          </select>
          <button class="btn btn-primary" id="btn-report-blocker" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">+ Report Blocker</button>
          <button class="btn btn-secondary" id="btn-reset-blockers" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">Reset Resolved Blockers</button>
        </div>
      </div>
      
      <div style="overflow-x: auto; margin-top: 0.5rem;">
        <table class="enterprise-table">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center; padding-right: 0;"></th>
              <th style="width: 100px;">ID</th>
              <th style="width: 100px;">Severity</th>
              <th>${descriptionHeader}</th>
              <th>${ownerHeader}</th>
              <th style="width: 100px;">Status</th>
              <th style="text-align: right; width: 120px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${displayedItems.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 1.5rem 0; font-style: italic;">
                  No operational items found matching the selected filter.
                </td>
              </tr>
            ` : displayedItems.map(item => {
              const isExpanded = window.__expandedBlockers && window.__expandedBlockers.has(item.id);
              const refPrefix = 
                item.type === 'task' ? 'TSK' :
                item.type === 'issue' ? 'ISS' :
                item.type === 'handoff' ? 'HDF' : 'BLK';
              
              let actionHtml = '';
              if (item.type === 'blocker') {
                actionHtml = item.status === 'Blocked' 
                  ? `<button class="btn btn-primary btn-resolve-blocker" data-id="${item.id}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">Mark Resolved</button>`
                  : `<span class="text-success font-mono" style="font-size: 0.7rem;">✔ Resolved</span>`;
              } else {
                actionHtml = item.status === 'Completed'
                  ? `<span class="text-success font-mono" style="font-size: 0.7rem;">✔ Completed</span>`
                  : `<button class="btn btn-primary btn-complete-item" data-id="${item.id}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">Mark Done</button>`;
              }

              let statusClass = 'text-dim';
              if (item.status === 'Blocked' || item.status === 'Active') {
                statusClass = 'text-danger';
              } else if (item.status === 'In Progress') {
                statusClass = 'text-info';
              } else if (item.status === 'Completed' || item.status === 'Resolved') {
                statusClass = 'text-success';
              }

              const friendlyOwner = item.owner + (isAllItems ? ` [${item.workspace.toUpperCase()}]` : '');

              return `
                <tr class="blocker-row ${isExpanded ? 'expanded' : ''}" data-id="${item.id}">
                  <td style="text-align: center; padding-right: 0;">
                    <svg class="chevron-icon" style="width: 10px; height: 10px; transform: ${isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'};" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </td>
                  <td class="font-mono" style="font-weight: 600; color: var(--text-dim);">#${refPrefix}-${item.id.replace('item-', '')}</td>
                  <td>
                    <span class="badge ${
                      item.severity === 'Critical' ? 'badge-danger' : 
                      item.severity === 'High' ? 'badge-warning' : 
                      item.severity === 'Medium' ? 'badge-info' : 'badge-success'
                    }">${item.severity}</span>
                  </td>
                  <td style="font-weight: 500;">
                    ${item.title}
                    ${item.type !== 'blocker' ? `
                      <span style="font-size: 0.65rem; background: var(--bg-surface-elevated); padding: 1px 6px; border-radius: 4px; border: 1px dashed var(--border-outline-variant); color: var(--color-primary); margin-left: 6px; font-weight: normal; text-transform: uppercase;">
                        ${item.type}
                      </span>
                    ` : ''}
                    ${item.targetWorkspace ? `
                      <span style="font-size: 0.65rem; background: var(--bg-surface-elevated); padding: 1px 6px; border-radius: 4px; border: 1px dashed var(--border-outline-variant); color: var(--color-info); margin-left: 6px; font-weight: normal;">
                        Handoff to: ${item.targetWorkspace === 'legalhr' ? 'Legal & HR' : item.targetWorkspace.toUpperCase()}
                      </span>
                    ` : ''}
                  </td>
                  <td style="color: var(--text-muted); font-size: 0.8rem;">${friendlyOwner}</td>
                  <td>
                    <span style="font-weight:600; font-size: 0.8rem;" class="${statusClass}">${item.status}</span>
                  </td>
                  <td style="text-align: right; pointer-events: auto;">
                    ${actionHtml}
                  </td>
                </tr>
                <tr class="blocker-details-row ${isExpanded ? 'show' : ''}" id="details-${item.id}">
                  <td colspan="7" style="padding: 0; border: none;">
                    <div class="blocker-details-content">
                      <div style="display: flex; flex-direction: column; gap: 0.25rem; border-left: 2px solid var(--color-primary); padding-left: 10px; margin: 4px 0;">
                        <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-family: var(--font-mono); font-weight: 600;">Details & Diagnostic Logs</span>
                        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin-top: 2px;">
                          ${item.details || 'No additional details provided.'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Blocker Report Modal (Glassmorphism Overlay) -->
    <div class="modal-backdrop" id="report-blocker-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Report Blocker Dependency</h2>
          <button class="modal-close" id="modal-btn-close" aria-label="Close dialog">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <form id="report-blocker-form" novalidate>
          <div class="modal-body">
            <!-- Blocker Title / Description -->
            <div class="form-group">
              <label for="blocker-title" class="form-label">Blocker Description / Title</label>
              <input type="text" class="form-control" id="blocker-title" placeholder="e.g., Auth token mismatch in gateway ingress proxy" required>
              <div class="invalid-feedback">Please enter a brief title/description of the blocker.</div>
            </div>
            
            <div class="grid grid-cols-2 gap-4" style="display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 0.25rem;">
              <!-- Severity -->
              <div class="form-group">
                <label for="blocker-severity" class="form-label">Severity Level</label>
                <select class="form-control" id="blocker-severity">
                  <option value="Critical">Critical</option>
                  <option value="High" selected>High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              
              <!-- Owner / Department -->
              <div class="form-group">
                <label for="blocker-owner" class="form-label">Assigned Owner</label>
                <select class="form-control" id="blocker-owner">
                  <option value="Engineering Core">Engineering Core</option>
                  <option value="UI/UX Team">UI/UX Team</option>
                  <option value="Infra Team">Infra Team</option>
                  <option value="Legal Team">Legal Team</option>
                  <option value="Finance Team">Finance Team</option>
                </select>
              </div>
            </div>
            
            <!-- Details / Diagnostic logs -->
            <div class="form-group" style="margin-bottom: 0;">
              <label for="blocker-details" class="form-label">Diagnostic Details / Action Items</label>
              <textarea class="form-control" id="blocker-details" placeholder="e.g., Frankfurt-ingress-03 pod memory usage peaked at 95%, triggering auto-eviction loops on client authentication request routing nodes..." required></textarea>
              <div class="invalid-feedback">Please enter diagnostic details or action items for the blocker.</div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="modal-btn-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit Blocker</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // --- BIND INTERACTIVE EVENTS ---

  // Blocker resolution action
  const resolveButtons = container.querySelectorAll('.btn-resolve-blocker');
  resolveButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idStr = e.target.getAttribute('data-id');
      const idNum = parseInt(idStr.replace('item-', ''));
      store.resolveBlocker(idNum || idStr);
    });
  });

  // Task/Issue/Handoff completion action
  const completeButtons = container.querySelectorAll('.btn-complete-item');
  completeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      store.updateWorkspaceItemStatus(id, 'Completed');
    });
  });

  // Blocker/Item log table filter dropdown
  const filterSelect = container.querySelector('#executive-board-filter');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      window.__executiveFilterValue = e.target.value;
      render(container);
    });
  }

  // Blocker reset button
  const resetBtn = container.querySelector('#btn-reset-blockers');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      store.resetBlockers();
    });
  }

  // --- PMAS DEPENDENCY GRAPH INTERACTIVITY HANDLERS ---
  const svg = container.querySelector('#pmas-dependency-graph');
  const viewportGroup = container.querySelector('#viewport-group');
  const tooltip = container.querySelector('#graph-tooltip');

  if (svg && viewportGroup && tooltip) {
    // 1. Zoom and Pan functionality
    let isPanning = false;
    let startX, startY;

    svg.addEventListener('mousedown', (e) => {
      // Left click only and prevent panning when clicking on interactive nodes/buttons
      if (e.button !== 0 || e.target.closest('.node') || e.target.closest('.hud-btn') || e.target.closest('.graph-legend')) {
        return;
      }
      isPanning = true;
      startX = e.clientX - window.__graphPanX;
      startY = e.clientY - window.__graphPanY;
      svg.style.cursor = 'grabbing';
    });

    const handleMouseMove = (e) => {
      if (isPanning) {
        window.__graphPanX = e.clientX - startX;
        window.__graphPanY = e.clientY - startY;
        viewportGroup.setAttribute('transform', `translate(${window.__graphPanX}, ${window.__graphPanY}) scale(${window.__graphZoomScale})`);
      }
    };

    const handleMouseUp = () => {
      if (isPanning) {
        isPanning = false;
        svg.style.cursor = 'grab';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Track listener cleanup in container context to avoid memory leaks
    container._cleanupEvents = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    // Mouse scroll wheel zoom
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const zoomFactor = 1.08;
      let nextScale = window.__graphZoomScale;
      
      if (e.deltaY < 0) {
        nextScale = Math.min(window.__graphZoomScale * zoomFactor, 3.0);
      } else {
        nextScale = Math.max(window.__graphZoomScale / zoomFactor, 0.45);
      }
      
      // Zoom centered on the cursor position
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const newPanX = mouseX - (mouseX - window.__graphPanX) * (nextScale / window.__graphZoomScale);
      const newPanY = mouseY - (mouseY - window.__graphPanY) * (nextScale / window.__graphZoomScale);
      
      window.__graphZoomScale = nextScale;
      window.__graphPanX = newPanX;
      window.__graphPanY = newPanY;
      
      viewportGroup.setAttribute('transform', `translate(${window.__graphPanX}, ${window.__graphPanY}) scale(${window.__graphZoomScale})`);
    }, { passive: false });

    // HUD controls binding
    const zoomInBtn = container.querySelector('#graph-zoom-in');
    const zoomOutBtn = container.querySelector('#graph-zoom-out');
    const zoomResetBtn = container.querySelector('#graph-zoom-reset');

    const zoomAtCenter = (factor) => {
      const rect = svg.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      let nextScale = window.__graphZoomScale;
      if (factor > 1) {
        nextScale = Math.min(window.__graphZoomScale * factor, 3.0);
      } else {
        nextScale = Math.max(window.__graphZoomScale * factor, 0.45);
      }
      
      const newPanX = centerX - (centerX - window.__graphPanX) * (nextScale / window.__graphZoomScale);
      const newPanY = centerY - (centerY - window.__graphPanY) * (nextScale / window.__graphZoomScale);
      
      window.__graphZoomScale = nextScale;
      window.__graphPanX = newPanX;
      window.__graphPanY = newPanY;
      
      viewportGroup.setAttribute('transform', `translate(${window.__graphPanX}, ${window.__graphPanY}) scale(${window.__graphZoomScale})`);
    };

    if (zoomInBtn) zoomInBtn.addEventListener('click', () => zoomAtCenter(1.2));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => zoomAtCenter(1 / 1.2));
    
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        window.__graphZoomScale = 1.0;
        window.__graphPanX = 0;
        window.__graphPanY = 0;
        window.__graphNodePositions = JSON.parse(JSON.stringify(defaultPositions));
        
        viewportGroup.setAttribute('transform', `translate(0, 0) scale(1)`);
        
        dependencies.forEach(dep => {
          const pathEl = container.querySelector(`#edge-${dep.from}-${dep.to}`);
          if (pathEl) {
            pathEl.setAttribute('d', computeBezierPath(dep.from, dep.to));
          }
        });
        
        const allNodes = ['marketing', 'finance', 'uiux', 'legalhr', 'engineering', 'infrastructure'];
        allNodes.forEach(nodeId => {
          const nodeEl = container.querySelector(`#node-${nodeId}`);
          if (nodeEl) {
            const pos = defaultPositions[nodeId];
            nodeEl.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
          }
        });
      });
    }

    // 2. Node dragging & click selection
    let activeDragNodeId = null;
    let dragStartMouseX, dragStartMouseY;
    let dragStartNodeX, dragStartNodeY;
    
    const nodeElements = container.querySelectorAll('.node');
    nodeElements.forEach(nodeEl => {
      const nodeId = nodeEl.getAttribute('data-id');

      nodeEl.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // Prevent panning
        
        if (e.button !== 0) return; // Left click only
        
        activeDragNodeId = nodeId;
        dragStartMouseX = e.clientX;
        dragStartMouseY = e.clientY;
        
        const pos = window.__graphNodePositions[nodeId];
        dragStartNodeX = pos.x;
        dragStartNodeY = pos.y;
        
        nodeEl.style.cursor = 'grabbing';
        
        // Select node instantly on press
        window.__selectedGraphNode = nodeId;
        nodeElements.forEach(el => el.classList.remove('selected'));
        nodeEl.classList.add('selected');
      });

      // Hover Tooltip logic
      nodeEl.addEventListener('mouseenter', () => {
        const tele = nodeTelemetry[nodeId];
        const items = state.workspaceItems.filter(i => i.workspace === nodeId);
        const activeBlockers = items.filter(i => i.type === 'blocker' && i.status === 'Blocked');
        const activeIssues = items.filter(i => i.type === 'issue' && i.status !== 'Completed');
        const pendingTasks = items.filter(i => i.type === 'task' && i.status !== 'Completed');
        const status = getNodeStatus(nodeId);
        const statusColor = getStatusColor(status);
        
        let blockerListHtml = '';
        if (activeBlockers.length > 0) {
          blockerListHtml = `
            <div class="graph-tooltip-divider"></div>
            <div style="font-size: 0.65rem; color: var(--color-danger); font-weight: 600; margin-bottom: 2px;">Active Blockers:</div>
            <ul style="padding-left: 10px; margin: 0; font-size: 0.65rem; color: var(--color-danger);">
              ${activeBlockers.slice(0, 2).map(b => `<li style="margin-bottom: 2px;">${b.title}</li>`).join('')}
              ${activeBlockers.length > 2 ? `<li>+${activeBlockers.length - 2} more...</li>` : ''}
            </ul>
          `;
        }
        
        tooltip.innerHTML = `
          <div class="graph-tooltip-header">
            <span>${tele.name}</span>
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 6px ${statusColor};"></span>
          </div>
          <div style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 4px;">Owner: ${tele.owner.split(' (')[0]}</div>
          <div class="graph-tooltip-divider"></div>
          <div class="graph-tooltip-row">
            <span class="graph-tooltip-label">Status:</span>
            <span class="graph-tooltip-value" style="color: ${statusColor}; text-transform: uppercase;">${status}</span>
          </div>
          <div class="graph-tooltip-row">
            <span class="graph-tooltip-label">Pending Tasks:</span>
            <span class="graph-tooltip-value">${pendingTasks.length}</span>
          </div>
          <div class="graph-tooltip-row">
            <span class="graph-tooltip-label">Active Issues:</span>
            <span class="graph-tooltip-value">${activeIssues.length}</span>
          </div>
          <div class="graph-tooltip-row">
            <span class="graph-tooltip-label">Capacity:</span>
            <span class="graph-tooltip-value">${tele.systemLoad}</span>
          </div>
          ${blockerListHtml}
        `;
        
        tooltip.style.display = 'block';
        tooltip.style.opacity = '1';
        
        const updateTooltipPos = () => {
          const nodeRect = nodeEl.getBoundingClientRect();
          const svgContainerRect = svg.parentNode.getBoundingClientRect();
          
          const top = nodeRect.top - svgContainerRect.top - tooltip.offsetHeight - 12;
          const left = nodeRect.left - svgContainerRect.left + (nodeRect.width / 2) - (tooltip.offsetWidth / 2);
          
          const finalLeft = Math.max(10, Math.min(left, svgContainerRect.width - tooltip.offsetWidth - 10));
          const finalTop = Math.max(10, top);
          
          tooltip.style.transform = `translate(${finalLeft}px, ${finalTop}px)`;
        };
        
        updateTooltipPos();
        nodeEl._tooltipUpdater = updateTooltipPos;
      });

      nodeEl.addEventListener('mousemove', () => {
        if (nodeEl._tooltipUpdater) {
          nodeEl._tooltipUpdater();
        }
      });

      nodeEl.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
        tooltip.style.display = 'none';
        nodeEl._tooltipUpdater = null;
      });

      // View transition selection click
      nodeEl.addEventListener('click', (e) => {
        // Prevent click if we were dragging (allow up to 6px jitter)
        const dx = Math.abs(e.clientX - dragStartMouseX);
        const dy = Math.abs(e.clientY - dragStartMouseY);
        if (dx > 6 || dy > 6) {
          return;
        }
        window.__selectedGraphNode = nodeId;
        render(container);
      });
    });

    // Handle global mouse move for node dragging
    const handleNodeDragMove = (e) => {
      if (activeDragNodeId) {
        const dx = (e.clientX - dragStartMouseX) / window.__graphZoomScale;
        const dy = (e.clientY - dragStartMouseY) / window.__graphZoomScale;
        
        const newX = Math.max(30, Math.min(770, Math.round(dragStartNodeX + dx)));
        const newY = Math.max(30, Math.min(370, Math.round(dragStartNodeY + dy)));
        
        window.__graphNodePositions[activeDragNodeId] = { x: newX, y: newY };
        
        const targetNodeEl = container.querySelector(`#node-${activeDragNodeId}`);
        if (targetNodeEl) {
          targetNodeEl.setAttribute('transform', `translate(${newX}, ${newY})`);
        }
        
        dependencies.forEach(dep => {
          if (dep.from === activeDragNodeId || dep.to === activeDragNodeId) {
            const pathEl = container.querySelector(`#edge-${dep.from}-${dep.to}`);
            if (pathEl) {
              pathEl.setAttribute('d', computeBezierPath(dep.from, dep.to));
            }
          }
        });
      }
    };

    const handleNodeDragEnd = () => {
      if (activeDragNodeId) {
        const nodeEl = container.querySelector(`#node-${activeDragNodeId}`);
        if (nodeEl) nodeEl.style.cursor = 'grab';
        activeDragNodeId = null;
      }
    };

    window.addEventListener('mousemove', handleNodeDragMove);
    window.addEventListener('mouseup', handleNodeDragEnd);

    // Chain cleanup
    const oldCleanup = container._cleanupEvents;
    container._cleanupEvents = () => {
      if (oldCleanup) oldCleanup();
      window.removeEventListener('mousemove', handleNodeDragMove);
      window.removeEventListener('mouseup', handleNodeDragEnd);
    };
  }

  // Expand/collapse blockers rows
  const blockerRows = container.querySelectorAll('.blocker-row');
  blockerRows.forEach(row => {
    row.addEventListener('click', (e) => {
      // Ignore click if it was on action buttons
      if (e.target.closest('.btn-resolve-blocker') || e.target.closest('.btn-complete-item')) {
        return;
      }
      
      const id = row.getAttribute('data-id');
      if (!window.__expandedBlockers) {
        window.__expandedBlockers = new Set();
      }
      
      const detailsRow = container.querySelector(`#details-${id}`);
      if (window.__expandedBlockers.has(id)) {
        window.__expandedBlockers.delete(id);
        row.classList.remove('expanded');
        const chevron = row.querySelector('.chevron-icon');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (detailsRow) detailsRow.classList.remove('show');
      } else {
        window.__expandedBlockers.add(id);
        row.classList.add('expanded');
        const chevron = row.querySelector('.chevron-icon');
        if (chevron) chevron.style.transform = 'rotate(90deg)';
        if (detailsRow) detailsRow.classList.add('show');
      }
    });
  });

  // Modal show/hide functionality
  const reportBtn = container.querySelector('#btn-report-blocker');
  const modal = container.querySelector('#report-blocker-modal');
  
  if (reportBtn && modal) {
    reportBtn.addEventListener('click', () => {
      modal.classList.add('active');
      // Focus on first input
      setTimeout(() => {
        const titleInput = modal.querySelector('#blocker-title');
        if (titleInput) titleInput.focus();
      }, 100);
    });
  }

  const closeModal = () => {
    if (modal) {
      modal.classList.remove('active');
      // Clear validation states and form values
      const form = modal.querySelector('#report-blocker-form');
      if (form) {
        form.reset();
        form.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));
      }
    }
  };

  const closeBtn = container.querySelector('#modal-btn-close');
  const cancelBtn = container.querySelector('#modal-btn-cancel');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  
  // Close on clicking backdrop
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // Handle Form Submission with validations
  const form = container.querySelector('#report-blocker-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const titleInput = form.querySelector('#blocker-title');
      const detailsInput = form.querySelector('#blocker-details');
      const severityInput = form.querySelector('#blocker-severity');
      const ownerInput = form.querySelector('#blocker-owner');
      
      let isValid = true;
      
      if (!titleInput.value.trim()) {
        titleInput.classList.add('is-invalid');
        isValid = false;
      } else {
        titleInput.classList.remove('is-invalid');
      }
      
      if (!detailsInput.value.trim()) {
        detailsInput.classList.add('is-invalid');
        isValid = false;
      } else {
        detailsInput.classList.remove('is-invalid');
      }
      
      if (isValid) {
        // Add blocker using state store action
        store.addBlocker(
          titleInput.value.trim(),
          severityInput.value,
          ownerInput.value,
          detailsInput.value.trim()
        );
        // Toggling store updates the state, which triggers a re-render.
        // Re-rendering appends fresh HTML, closing the modal.
      }
    });
    
    // Clear validation warnings dynamically on type
    form.querySelectorAll('.form-control').forEach(input => {
      input.addEventListener('input', () => {
        if (input.value.trim()) {
          input.classList.remove('is-invalid');
        }
      });
    });
  }
}

