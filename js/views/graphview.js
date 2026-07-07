import { store } from '../state.js';

if (!window.__graphViewState) {
  window.__graphViewState = {
    perspective: 'departments',
    selectedNodeId: null,
    panX: 0,
    panY: 0,
    scale: 1
  };
}

const gs = () => window.__graphViewState;

function getDeptGraphData(state) {
  const items = state.workspaceItems;
  const depts = ['executive', 'uiux', 'engineering', 'infrastructure', 'marketing', 'finance', 'legalhr'];
  const labels = { executive: 'Executive Control', uiux: 'UI/UX Design', engineering: 'Engineering Core', infrastructure: 'Infrastructure Gateway', marketing: 'Marketing', finance: 'Finance Ledger', legalhr: 'Legal & HR' };
  const colors = { executive: '#6366f1', uiux: '#06b6d4', engineering: '#10b981', infrastructure: '#f59e0b', marketing: '#f43f5e', finance: '#8b5cf6', legalhr: '#ec4899' };
  const cx = 400, cy = 225, r = 140;
  const nodes = depts.map((d, i) => {
    const angle = (i / depts.length) * 2 * Math.PI - Math.PI / 2;
    const deptItems = items.filter(it => it.workspace === d);
    const blockers = deptItems.filter(it => it.type === 'blocker' && it.status === 'Blocked').length;
    return {
      id: d, label: labels[d], color: colors[d],
      x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle),
      totalItems: deptItems.length, blockers,
      load: Math.min(100, deptItems.length * 18 + blockers * 10)
    };
  });
  const edges = [
    { from: 'uiux', to: 'engineering' }, { from: 'engineering', to: 'infrastructure' },
    { from: 'executive', to: 'uiux' }, { from: 'executive', to: 'engineering' },
    { from: 'executive', to: 'finance' }, { from: 'engineering', to: 'marketing' },
    { from: 'infrastructure', to: 'marketing' }, { from: 'legalhr', to: 'executive' },
    { from: 'legalhr', to: 'marketing' }, { from: 'finance', to: 'executive' }
  ];
  return { nodes, edges };
}

function getTeamGraphData(state) {
  const items = state.workspaceItems;
  const people = [
    { id: 'elena-r', label: 'Elena R.', role: 'UI/UX Lead', initials: 'ER', dept: 'uiux', x: 220, y: 110 },
    { id: 'marcus-a', label: 'Marcus A.', role: 'Principal Architect', initials: 'MA', dept: 'engineering', x: 400, y: 150 },
    { id: 'devops-p3', label: 'DevOps Pod 3', role: 'Infra Engineer', initials: 'DP', dept: 'infrastructure', x: 580, y: 110 },
    { id: 'clara-o', label: 'Clara O.', role: 'Marketing Ops', initials: 'CO', dept: 'marketing', x: 280, y: 320 },
    { id: 'finance-team', label: 'Finance Team', role: 'Ledger Ops', initials: 'FT', dept: 'finance', x: 520, y: 320 },
    { id: 'diana-p', label: 'Diana Prince', role: 'Compliance Officer', initials: 'DP', dept: 'legalhr', x: 400, y: 390 },
    { id: 'sarah-j', label: 'Sarah Jenkins', role: 'VP of Product', initials: 'SJ', dept: 'executive', x: 400, y: 50 }
  ];
  const enriched = people.map(p => {
    const assigned = items.filter(it => it.owner === p.label || it.owner === p.role || (p.label === 'DevOps Pod 3' && it.owner === 'DevOps Pod 3') || (p.label === 'Finance Team' && it.owner === 'Finance Team') || (p.label === 'Diana Prince' && it.owner === 'Diana Prince'));
    const totalAssigned = assigned.length;
    const crossDept = assigned.filter(it => it.workspace !== p.dept && it.targetWorkspace && it.targetWorkspace !== p.dept).length;
    const depPct = totalAssigned > 0 ? Math.round((totalAssigned / items.length) * 100) : 0;
    const isKeyRisk = depPct > 25 || (totalAssigned >= 3 && crossDept > 0);
    return { ...p, assignedCount: totalAssigned, crossDeptCount: crossDept, depPct, isKeyRisk, radius: 22 + totalAssigned * 4 };
  });
  const edges = [
    { from: 'elena-r', to: 'marcus-a' }, { from: 'marcus-a', to: 'devops-p3' },
    { from: 'sarah-j', to: 'elena-r' }, { from: 'sarah-j', to: 'marcus-a' },
    { from: 'sarah-j', to: 'clara-o' }, { from: 'clara-o', to: 'diana-p' },
    { from: 'marcus-a', to: 'clara-o' }, { from: 'devops-p3', to: 'finance-team' },
    { from: 'diana-p', to: 'sarah-j' }, { from: 'finance-team', to: 'sarah-j' }
  ];
  return { nodes: enriched, edges };
}

function getWorkloadGraphData(state) {
  const items = state.workspaceItems;
  const workspaces = [
    { id: 'infrastructure', label: 'Infrastructure Gateway', team: 'DevOps Pod 3', x: 150, y: 60 },
    { id: 'engineering', label: 'Engineering Core', team: 'Marcus A.', x: 150, y: 145 },
    { id: 'uiux', label: 'UI/UX Design', team: 'Elena R.', x: 150, y: 230 },
    { id: 'finance', label: 'Finance Ledger', team: 'Finance Team', x: 150, y: 315 },
    { id: 'marketing', label: 'Marketing', team: 'Clara O.', x: 150, y: 400 }
  ];
  const enriched = workspaces.map(w => {
    const wsItems = items.filter(it => it.workspace === w.id);
    const activeCount = wsItems.filter(it => it.status !== 'Completed' && it.status !== 'Resolved').length;
    const totalCount = wsItems.length;
    const loadPct = Math.min(100, activeCount * 22 + (w.id === 'infrastructure' ? 30 : w.id === 'engineering' ? 10 : 0));
    return { ...w, activeCount, totalCount, loadPct };
  });
  const barMaxWidth = 350;
  return { nodes: enriched, barMaxWidth };
}

function renderEdges(perspective, state) {
  if (perspective === 'workload') return '';
  const data = perspective === 'team-network' ? getTeamGraphData(state) : getDeptGraphData(state);
  return data.edges.map(e => {
    const fromNode = data.nodes.find(n => n.id === e.from);
    const toNode = data.nodes.find(n => n.id === e.to);
    if (!fromNode || !toNode) return '';
    return `<line id="edge-${e.from}-${e.to}" x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}" stroke="rgba(99,102,241,0.15)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
  }).join('');
}

function renderDeptNodes(state, selectedId) {
  const data = getDeptGraphData(state);
  return data.nodes.map(n => {
    const sel = n.id === selectedId;
    const loadColor = n.load > 80 ? 'var(--color-danger)' : n.load > 60 ? 'var(--color-warning)' : 'var(--color-info)';
    return `
      <g class="graph-node" data-node-id="${n.id}" data-perspective="departments" data-default-x="${n.x}" data-default-y="${n.y}" style="cursor:grab;">
        <circle cx="${n.x}" cy="${n.y}" r="${sel ? 32 : 28}" fill="${sel ? 'rgba(99,102,241,0.2)' : '#131724'}" stroke="${sel ? 'var(--color-primary)' : n.color}" stroke-width="${sel ? 3 : 2}" style="transition: all 0.2s ease;"/>
        ${sel ? `<circle cx="${n.x}" cy="${n.y}" r="36" fill="none" stroke="var(--color-primary)" stroke-width="1" stroke-dasharray="3,3" opacity="0.5"/>` : ''}
        <text x="${n.x}" y="${n.y + 2}" text-anchor="middle" fill="#f8fafc" font-size="10" font-family="var(--font-mono)" font-weight="600">${n.label.length > 12 ? n.label.slice(0, 12) + '..' : n.label}</text>
        <text x="${n.x}" y="${n.y - 16}" text-anchor="middle" fill="${loadColor}" font-size="8" font-family="var(--font-mono)" font-weight="700">${n.totalItems} items</text>
        ${n.blockers > 0 ? `<circle cx="${n.x + 20}" cy="${n.y - 20}" r="7" fill="var(--color-danger)" stroke="var(--bg-surface-card)" stroke-width="1.5"/><text x="${n.x + 20}" y="${n.y - 17}" text-anchor="middle" fill="#fff" font-size="7" font-weight="700">${n.blockers}</text>` : ''}
      </g>`;
  }).join('');
}

function renderTeamNodes(state, selectedId) {
  const data = getTeamGraphData(state);
  return data.nodes.map(n => {
    const sel = n.id === selectedId;
    const avgColor = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'][['elena-r','marcus-a','devops-p3','clara-o','finance-team','diana-p'].indexOf(n.id) % 6];
    return `
      <g class="graph-node" data-node-id="${n.id}" data-perspective="team-network" data-default-x="${n.x}" data-default-y="${n.y}" style="cursor:grab;">
        <circle cx="${n.x}" cy="${n.y}" r="${n.radius}" fill="${sel ? 'rgba(99,102,241,0.15)' : '#131724'}" stroke="${sel ? 'var(--color-primary)' : avgColor}" stroke-width="${sel ? 2.5 : 1.5}" style="transition: all 0.2s ease;"/>
        ${n.isKeyRisk ? `<circle cx="${n.x}" cy="${n.y}" r="${n.radius + 6}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,3" opacity="0.8"><animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite"/></circle>` : ''}
        <circle cx="${n.x}" cy="${n.y}" r="${n.radius - 6}" fill="var(--bg-surface-elevated)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
        <text x="${n.x}" y="${n.y + 2}" text-anchor="middle" fill="#f8fafc" font-size="9" font-family="var(--font-mono)" font-weight="700">${n.initials}</text>
        <text x="${n.x}" y="${n.y - n.radius - 8}" text-anchor="middle" fill="var(--text-on-surface)" font-size="8" font-family="var(--font-sans)" font-weight="600">${n.label}</text>
        <text x="${n.x}" y="${n.y - n.radius + 14}" text-anchor="middle" fill="var(--text-dim)" font-size="7">${n.role}</text>
        ${n.crossDeptCount > 0 ? `<text x="${n.x + n.radius + 4}" y="${n.y + 3}" fill="var(--text-dim)" font-size="6" font-family="var(--font-mono)">↔${n.crossDeptCount}</text>` : ''}
        ${n.isKeyRisk ? `<text x="${n.x}" y="${n.y + n.radius + 14}" text-anchor="middle" fill="#f59e0b" font-size="6" font-family="var(--font-mono)" font-weight="600">⚡ Key-Person Risk</text>` : ''}
      </g>`;
  }).join('');
}

function renderWorkloadNodes(state, selectedId) {
  const data = getWorkloadGraphData(state);
  return data.nodes.map(n => {
    const sel = n.id === selectedId;
    const isCritical = n.loadPct > 90;
    const isWarning = n.loadPct > 70;
    const barColor = isCritical ? 'var(--color-danger)' : isWarning ? 'var(--color-warning)' : 'var(--color-info)';
    const barW = (n.loadPct / 100) * data.barMaxWidth;
    return `
      <g class="graph-node" data-node-id="${n.id}" data-perspective="workload" data-default-x="${n.x}" data-default-y="${n.y}" style="cursor:grab;">
        ${isCritical ? `<rect x="${n.x - 10}" y="${n.y - 28}" width="${data.barMaxWidth + 30}" height="50" rx="6" fill="none" stroke="rgba(244,63,94,0.3)" stroke-width="1"><animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.5s" repeatCount="indefinite"/></rect>` : ''}
        <rect x="${n.x}" y="${n.y}" width="${data.barMaxWidth}" height="8" rx="4" fill="rgba(255,255,255,0.03)"/>
        <rect x="${n.x}" y="${n.y}" width="${barW}" height="8" rx="4" fill="${barColor}" style="transition: width 0.5s ease;"/>
        <text x="${n.x - 6}" y="${n.y + 6}" text-anchor="end" fill="var(--text-on-surface)" font-size="8" font-family="var(--font-sans)" font-weight="600">${n.label}</text>
        <text x="${n.x + data.barMaxWidth + 8}" y="${n.y + 6}" fill="${barColor}" font-size="8" font-family="var(--font-mono)" font-weight="700">${n.loadPct}%</text>
        <text x="${n.x}" y="${n.y - 6}" fill="var(--text-dim)" font-size="6.5" font-family="var(--font-mono)">Team: ${n.team} · ${n.activeCount}/${n.totalCount} active</text>
        ${isCritical ? `<text x="${n.x + data.barMaxWidth + 8}" y="${n.y + 22}" fill="var(--color-danger)" font-size="6" font-family="var(--font-mono)" font-weight="600">⚠ +Hire/Allocate Developer</text>` : ''}
        ${sel ? `<rect x="${n.x - 4}" y="${n.y - 14}" width="${data.barMaxWidth + 8}" height="34" rx="4" fill="none" stroke="var(--color-primary)" stroke-width="1" stroke-dasharray="3,3"/>` : ''}
      </g>`;
  }).join('');
}

function renderGraphNodes(perspective, state, selectedId) {
  if (perspective === 'team-network') return renderTeamNodes(state, selectedId);
  if (perspective === 'workload') return renderWorkloadNodes(state, selectedId);
  return renderDeptNodes(state, selectedId);
}

function renderLegend(perspective) {
  if (perspective === 'departments') {
    return `<div class="legend-item"><span class="legend-color-dot" style="background:var(--color-danger);"></span>Blockers count</div>
            <div class="legend-item"><span class="legend-color-dot" style="background:var(--color-primary);"></span>Task lineage</div>`;
  }
  if (perspective === 'team-network') {
    return `<div class="legend-item"><span class="legend-color-dot" style="background:#f59e0b;"></span>Key-Person Risk</div>
            <div class="legend-item"><span class="legend-color-dot" style="background:var(--color-info);"></span>Cross-dept handoff</div>`;
  }
  return `<div class="legend-item"><span class="legend-color-dot" style="background:var(--color-danger);"></span>>90% Critical</div>
          <div class="legend-item"><span class="legend-color-dot" style="background:var(--color-warning);"></span>>70% Warning</div>
          <div class="legend-item"><span class="legend-color-dot" style="background:var(--color-info);"></span>Normal</div>`;
}

function renderDefaultInspector() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:12px;color:var(--text-dim);text-align:center;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span style="font-size:0.75rem;">Select a graph node to inspect its topology metadata, blocker routing, and team efficiency score.</span>
    </div>`;
}

function getDeptNodeInfo(state, nodeId) {
  const data = getDeptGraphData(state);
  const node = data.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const items = state.workspaceItems.filter(it => it.workspace === nodeId);
  const blockers = items.filter(it => it.type === 'blocker');
  const activeTasks = items.filter(it => it.type === 'task' && it.status !== 'Completed');
  const efficiency = node.load > 80 ? 'Burnout Warning' : node.load > 55 ? 'Optimal' : 'Under-Utilized';
  const effColor = node.load > 80 ? 'var(--color-danger)' : node.load > 55 ? 'var(--color-success)' : 'var(--color-warning)';
  return { node, blockers, activeTasks, efficiency, effColor };
}

function getTeamNodeInfo(state, nodeId) {
  const data = getTeamGraphData(state);
  const node = data.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const items = state.workspaceItems.filter(it => it.owner === node.label || it.owner === node.role);
  const blockers = items.filter(it => it.type === 'blocker');
  const efficiency = node.depPct > 30 ? 'Burnout Warning' : node.assignedCount >= 2 ? 'Optimal' : 'Under-Utilized';
  const effColor = node.depPct > 30 ? 'var(--color-danger)' : node.assignedCount >= 2 ? 'var(--color-success)' : 'var(--color-warning)';
  return { node, items, blockers, efficiency, effColor };
}

function getWorkloadNodeInfo(state, nodeId) {
  const data = getWorkloadGraphData(state);
  const node = data.nodes.find(n => n.id === nodeId);
  if (!node) return null;
  const items = state.workspaceItems.filter(it => it.workspace === nodeId);
  const blockers = items.filter(it => it.type === 'blocker' && it.status === 'Blocked');
  const efficiency = node.loadPct > 90 ? 'Burnout Warning' : node.loadPct > 50 ? 'Optimal' : 'Under-Utilized';
  const effColor = node.loadPct > 90 ? 'var(--color-danger)' : node.loadPct > 50 ? 'var(--color-success)' : 'var(--color-warning)';
  return { node, items, blockers, efficiency, effColor };
}

function renderInspectorContent(perspective, state, nodeId) {
  let info;
  if (perspective === 'team-network') info = getTeamNodeInfo(state, nodeId);
  else if (perspective === 'workload') info = getWorkloadNodeInfo(state, nodeId);
  else info = getDeptNodeInfo(state, nodeId);

  if (!info) return `<div style="color:var(--text-dim);font-size:0.75rem;">Node data not found.</div>`;

  const { node, blockers, efficiency, effColor } = info;
  const centrality = perspective === 'team-network' ? node.depPct :
                     perspective === 'workload' ? node.loadPct :
                     node.totalItems * 10;

  return `
    <div class="flex-col" style="gap:12px;">
      <div style="padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:0.85rem;font-weight:700;">${node.label || node.id}</span>
        ${node.role ? `<span style="font-size:0.7rem;color:var(--text-dim);display:block;margin-top:2px;">${node.role}</span>` : ''}
      </div>

      <div class="flex-col" style="gap:8px;">
        <div class="flex-between">
          <span style="font-size:0.7rem;color:var(--text-muted);">Node Weight / Centrality</span>
          <span class="font-mono" style="font-size:0.75rem;font-weight:700;">${centrality}%</span>
        </div>
        <div style="width:100%;height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;">
          <div style="width:${Math.min(100, centrality)}%;background:var(--color-primary);height:100%;border-radius:2px;"></div>
        </div>
      </div>

      <div class="flex-col" style="gap:8px;">
        <div class="flex-between">
          <span style="font-size:0.7rem;color:var(--text-muted);">Active Cross-Department Blockers</span>
          <span class="font-mono" style="font-size:0.75rem;font-weight:700;color:${blockers.length > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${blockers.length}</span>
        </div>
        ${blockers.length > 0 ? `
        <div class="flex-col" style="gap:4px;max-height:80px;overflow-y:auto;">
          ${blockers.slice(0, 3).map(b => `
            <div style="font-size:0.65rem;color:var(--text-dim);padding:3px 6px;background:rgba(244,63,94,0.06);border-radius:3px;border-left:2px solid var(--color-danger);">
              #BLK-${b.id.replace('item-', '')} ${b.title.length > 35 ? b.title.slice(0, 35) + '...' : b.title}
            </div>
          `).join('')}
        </div>` : '<span style="font-size:0.65rem;color:var(--text-dim);">No active blockers reported.</span>'}
      </div>

      <div class="flex-col" style="gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05);">
        <div class="flex-between">
          <span style="font-size:0.7rem;color:var(--text-muted);">Team Efficiency Status</span>
          <span style="font-size:0.7rem;font-weight:700;color:${effColor};">${efficiency}</span>
        </div>
      </div>

      <button class="btn btn-primary w-full" id="btn-optimize-resource" style="margin-top:8px;padding:0.5rem;font-size:0.75rem;">
        Optimize Resource Allocation
      </button>
    </div>`;
}

export function render(container) {
  if (container._cleanupEvents) {
    container._cleanupEvents();
    container._cleanupEvents = null;
  }

  const state = store.state;
  const g = gs();

  container.innerHTML = `
    <div class="card mb-4" style="padding:1.25rem;">
      <div class="flex-col" style="gap:4px;">
        <div class="card-title" style="margin-bottom:0;">
          <span>Global Network Topology & Resource Analytics</span>
        </div>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem;line-height:1.4;">
          Multi-layered cross-functional graph mapping task lineage, human capital density, and structural bottlenecks.
        </p>
        <div class="flex" style="align-items:center;gap:1rem;flex-wrap:wrap;">
          <span style="font-size:0.65rem;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Graph Perspective Selector</span>
          <div class="flex" style="gap:6px;">
            <button class="btn graph-perspective-btn ${g.perspective === 'departments' ? 'btn-primary' : 'btn-secondary'}" data-perspective="departments" style="padding:0.35rem 0.75rem;font-size:0.7rem;">Departments & Tasks</button>
            <button class="btn graph-perspective-btn ${g.perspective === 'team-network' ? 'btn-primary' : 'btn-secondary'}" data-perspective="team-network" style="padding:0.35rem 0.75rem;font-size:0.7rem;">Team Network & Key-Person Risk</button>
            <button class="btn graph-perspective-btn ${g.perspective === 'workload' ? 'btn-primary' : 'btn-secondary'}" data-perspective="workload" style="padding:0.35rem 0.75rem;font-size:0.7rem;">Workload Capacity & Hiring Indicators</button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-3" style="grid-template-columns:2.5fr 1fr;">
      <div class="card" style="padding:0;overflow:hidden;position:relative;">
        <div class="graph-hud" style="top:0.5rem;left:0.5rem;display:flex;gap:4px;flex-direction:row;">
          <button class="hud-btn" id="graph-zoom-in" style="width:1.75rem;height:1.75rem;font-size:0.9rem;font-weight:700;">+</button>
          <button class="hud-btn" id="graph-zoom-out" style="width:1.75rem;height:1.75rem;font-size:0.9rem;font-weight:700;">−</button>
          <button class="hud-btn" id="graph-zoom-reset" style="width:1.75rem;height:1.75rem;font-size:0.75rem;">⟲</button>
        </div>
        <svg id="pmas-advanced-graph-canvas" width="100%" height="520" style="display:block;background:#080a10;cursor:grab;" viewBox="0 0 800 520" preserveAspectRatio="xMidYMid meet">
          <g id="graph-transform-g" transform="translate(${g.panX}, ${g.panY}) scale(${g.scale})">
            ${renderEdges(g.perspective, state)}
            ${renderGraphNodes(g.perspective, state, g.selectedNodeId)}
          </g>
        </svg>
        <div id="graph-tooltip" class="graph-tooltip" style="display:none;"></div>
        <div class="graph-legend" style="bottom:0.5rem;left:0.5rem;">
          <div class="legend-title">Node Key</div>
          ${renderLegend(g.perspective)}
        </div>
      </div>

      <div class="card" style="padding:1.25rem;">
        <div class="card-title">
          <span>Topology Inspector</span>
        </div>
        <div id="node-inspector-content">
          ${g.selectedNodeId ? renderInspectorContent(g.perspective, state, g.selectedNodeId) : renderDefaultInspector()}
        </div>
      </div>
    </div>
  `;

  // --- BIND EVENTS ---
  const canvas = container.querySelector('#pmas-advanced-graph-canvas');
  const transformG = container.querySelector('#graph-transform-g');
  const tooltip = container.querySelector('#graph-tooltip');

  // Perspective toggle
  container.querySelectorAll('.graph-perspective-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      g.perspective = btn.getAttribute('data-perspective');
      g.selectedNodeId = null;
      store.notify();
    });
  });

  // Zoom / Pan controls
  container.querySelector('#graph-zoom-in').addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const factor = 1.2;
    let ns = Math.min(g.scale * factor, 3.0);
    const npx = cx - (cx - g.panX) * (ns / g.scale);
    const npy = cy - (cy - g.panY) * (ns / g.scale);
    g.scale = ns; g.panX = npx; g.panY = npy;
    store.notify();
  });
  container.querySelector('#graph-zoom-out').addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const factor = 1 / 1.2;
    let ns = Math.max(g.scale * factor, 0.3);
    const npx = cx - (cx - g.panX) * (ns / g.scale);
    const npy = cy - (cy - g.panY) * (ns / g.scale);
    g.scale = ns; g.panX = npx; g.panY = npy;
    store.notify();
  });
  container.querySelector('#graph-zoom-reset').addEventListener('click', () => {
    g.scale = 1; g.panX = 0; g.panY = 0;
    store.notify();
  });

  // Node drag state
  let activeDragNodeId = null;
  let dragStartMouseX = 0, dragStartMouseY = 0;
  let dragStartNodeX = 0, dragStartNodeY = 0;

  // Node interaction: mousedown → drag, click → select
  const allNodes = container.querySelectorAll('.graph-node');
  allNodes.forEach(nodeEl => {
    const nodeId = nodeEl.getAttribute('data-node-id');

    nodeEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      activeDragNodeId = nodeId;
      dragStartMouseX = e.clientX;
      dragStartMouseY = e.clientY;
      const dx = parseFloat(nodeEl.getAttribute('data-default-x'));
      const dy = parseFloat(nodeEl.getAttribute('data-default-y'));
      dragStartNodeX = dx;
      dragStartNodeY = dy;
      nodeEl.style.cursor = 'grabbing';
    });

    // Tooltip
    nodeEl.addEventListener('mouseenter', () => {
      const stateData = store.state;
      const pp = g.perspective;
      let info;
      if (pp === 'team-network') info = getTeamNodeInfo(stateData, nodeId);
      else if (pp === 'workload') info = getWorkloadNodeInfo(stateData, nodeId);
      else info = getDeptNodeInfo(stateData, nodeId);

      if (!info) return;
      const { node, blockers, efficiency, effColor } = info;

      tooltip.innerHTML = `
        <div class="graph-tooltip-header">
          <span>${node.label || nodeId}</span>
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${effColor};box-shadow:0 0 6px ${effColor};"></span>
        </div>
        ${node.role ? `<div style="font-size:0.65rem;color:var(--text-muted);margin-bottom:4px;">${node.role}</div>` : ''}
        <div class="graph-tooltip-divider"></div>
        <div class="graph-tooltip-row">
          <span class="graph-tooltip-label">Efficiency:</span>
          <span class="graph-tooltip-value" style="color:${effColor};">${efficiency}</span>
        </div>
        <div class="graph-tooltip-row">
          <span class="graph-tooltip-label">Blockers:</span>
          <span class="graph-tooltip-value" style="color:${blockers.length > 0 ? 'var(--color-danger)' : 'var(--color-success)'};">${blockers.length}</span>
        </div>
      `;

      tooltip.style.display = 'block';
      tooltip.style.opacity = '1';
    });

    nodeEl.addEventListener('mousemove', () => {
      const nodeRect = nodeEl.getBoundingClientRect();
      const svgRect = canvas.getBoundingClientRect();
      const top = nodeRect.top - svgRect.top - tooltip.offsetHeight - 12;
      const left = nodeRect.left - svgRect.left + (nodeRect.width / 2) - (tooltip.offsetWidth / 2);
      tooltip.style.transform = `translate(${Math.max(10, Math.min(left, svgRect.width - tooltip.offsetWidth - 10))}px, ${Math.max(10, top)}px)`;
    });

    nodeEl.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      tooltip.style.display = 'none';
    });

    // Click with drag disambiguation
    nodeEl.addEventListener('click', (e) => {
      const dx = Math.abs(e.clientX - dragStartMouseX);
      const dy = Math.abs(e.clientY - dragStartMouseY);
      if (dx > 6 || dy > 6) return;
      e.stopPropagation();
      g.selectedNodeId = g.selectedNodeId === nodeId ? null : nodeId;
      store.notify();
    });
  });

  // Canvas pan (only on empty space, not nodes)
  let isPanning = false, panStartX, panStartY, origPanX, origPanY;
  canvas.addEventListener('mousedown', (e) => {
    if (e.target.closest('.graph-node')) return;
    if (e.button !== 0) return;
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    origPanX = g.panX;
    origPanY = g.panY;
    canvas.style.cursor = 'grabbing';
  });

  // Click on empty canvas to deselect
  canvas.addEventListener('click', (e) => {
    if (e.target.closest('.graph-node')) return;
    if (e.target.closest('.hud-btn')) return;
    g.selectedNodeId = null;
    store.notify();
  });

  // Global mouse move: handles both node drag and canvas pan
  function handleGlobalMouseMove(e) {
    if (activeDragNodeId) {
      const dx = (e.clientX - dragStartMouseX) / g.scale;
      const dy = (e.clientY - dragStartMouseY) / g.scale;

      const targetNode = container.querySelector(`.graph-node[data-node-id="${activeDragNodeId}"]`);
      if (targetNode) {
        let newLocalX = dragStartNodeX + dx;
        let newLocalY = dragStartNodeY + dy;
        newLocalX = Math.max(30, Math.min(770, newLocalX));
        newLocalY = Math.max(30, Math.min(420, newLocalY));
        const clampedDx = newLocalX - dragStartNodeX;
        const clampedDy = newLocalY - dragStartNodeY;
        targetNode.setAttribute('transform', `translate(${clampedDx}, ${clampedDy})`);
      }

      // Update connected edges
      container.querySelectorAll('line[id^="edge-"]').forEach(line => {
        const rest = line.id.replace('edge-', '');
        const sep = rest.indexOf('-');
        const fromId = rest.substring(0, sep);
        const toId = rest.substring(sep + 1);
        if (fromId !== activeDragNodeId && toId !== activeDragNodeId) return;

        const fromEl = container.querySelector(`.graph-node[data-node-id="${fromId}"]`);
        const toEl = container.querySelector(`.graph-node[data-node-id="${toId}"]`);
        if (!fromEl || !toEl) return;

        const getPos = (el) => {
          const bx = parseFloat(el.getAttribute('data-default-x'));
          const by = parseFloat(el.getAttribute('data-default-y'));
          const tr = el.getAttribute('transform') || '';
          const m = tr.match(/translate\(([^,]+),\s*([^)]+)\)/);
          if (m) return { x: bx + parseFloat(m[1]), y: by + parseFloat(m[2]) };
          return { x: bx, y: by };
        };

        const fp = getPos(fromEl), tp = getPos(toEl);
        line.setAttribute('x1', fp.x);
        line.setAttribute('y1', fp.y);
        line.setAttribute('x2', tp.x);
        line.setAttribute('y2', tp.y);
      });
    }

    if (isPanning) {
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      g.panX = origPanX + dx / g.scale;
      g.panY = origPanY + dy / g.scale;
      transformG.setAttribute('transform', `translate(${g.panX}, ${g.panY}) scale(${g.scale})`);
    }
  }

  function handleGlobalMouseUp() {
    if (activeDragNodeId) {
      const targetNode = container.querySelector(`.graph-node[data-node-id="${activeDragNodeId}"]`);
      if (targetNode) targetNode.style.cursor = 'grab';
      activeDragNodeId = null;
    }
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = 'grab';
    }
  }

  window.addEventListener('mousemove', handleGlobalMouseMove);
  window.addEventListener('mouseup', handleGlobalMouseUp);

  // Mouse wheel zoom (centered on cursor)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const ns = Math.max(0.3, Math.min(3, g.scale * factor));
    const npx = mouseX - (mouseX - g.panX) * (ns / g.scale);
    const npy = mouseY - (mouseY - g.panY) * (ns / g.scale);
    g.scale = ns; g.panX = npx; g.panY = npy;
    transformG.setAttribute('transform', `translate(${g.panX}, ${g.panY}) scale(${g.scale})`);
  }, { passive: false });

  // Optimize Resource Allocation button
  const optBtn = container.querySelector('#btn-optimize-resource');
  if (optBtn) {
    optBtn.addEventListener('click', () => {
      alert('Resource optimization workflow dispatched to Engineering & HR pipeline. Cross-functional rebalancing initiated.');
    });
  }

  // Cleanup
  container._cleanupEvents = () => {
    window.removeEventListener('mousemove', handleGlobalMouseMove);
    window.removeEventListener('mouseup', handleGlobalMouseUp);
  };
}
