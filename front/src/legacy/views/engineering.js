import { store } from '../state.js';
import { renderWorkspaceBoard } from '../components/workspaceBoard.js';

export function render(container) {
  const state = store.state;
  const { status, stage, progress, logs, coverage, buildCount } = state.pipeline;

  // Mock Pull Requests database
  const pullRequests = [
    { id: 1042, title: 'feat: Integrates Figma design token sync pipelines', branch: 'feature/tokens-sync', author: 'Elena R.', changes: '+112 -42', reviewer: 'Marcus A.', status: 'Review Required', tag: 'UI/UX' },
    { id: 1041, title: 'fix: Gateway authentication OAuth token refresh loop', branch: 'bugfix/auth-refresh', author: 'Alex K.', changes: '+24 -8', reviewer: 'DevOps Pod 3', status: 'Changes Requested', tag: 'Security' },
    { id: 1040, title: 'perf: Compress production index bundle configurations', branch: 'perf/bundle-opt', author: 'Marcus A.', changes: '+5 -125', reviewer: 'Sarah J.', status: 'LGTM / Approved', tag: 'Core' },
    { id: 1039, title: 'chore: Update base docker node image node:20-alpine', branch: 'chore/docker-update', author: 'DevOps Pod 3', changes: '+3 -3', reviewer: 'Marcus A.', status: 'LGTM / Approved', tag: 'Infrastructure' }
  ];

  container.innerHTML = `
    <!-- Top Row: CI/CD Pipeline Tracking & Console Output -->
    <div class="grid grid-cols-3 mb-4" style="grid-template-columns: 1fr 2fr;">
      
      <!-- Pipeline Status Panel -->
      <div class="card flex flex-col" style="justify-content: space-between;">
        <div>
          <div class="card-title">
            <span>CI/CD Pipeline Core</span>
            <span class="badge ${
              status === 'Running' ? 'badge-warning' : 
              status === 'Success' ? 'badge-success' : 'badge-info'
            }">${status}</span>
          </div>
          
          <div class="flex-col mt-4" style="gap: 1rem;">
            <div class="flex-between">
              <span style="font-size: 0.75rem; color: var(--text-muted);">Active Build Run:</span>
              <span class="font-mono" style="font-size: 0.75rem; font-weight:700;">#PMAS-B${buildCount}</span>
            </div>
            
            <div class="flex-between">
              <span style="font-size: 0.75rem; color: var(--text-muted);">Current Active Stage:</span>
              <span class="badge badge-info" style="font-size:0.65rem;">${stage !== 'None' ? stage : 'IDLE'}</span>
            </div>
            
            <!-- Progress Bar -->
            <div class="flex-col" style="gap: 6px; margin-top: 0.5rem;">
              <div class="flex-between" style="font-size: 0.7rem; color: var(--text-dim);">
                <span>Build Execution Progress</span>
                <span class="font-mono">${status === 'Running' ? progress : status === 'Success' ? 100 : 0}%</span>
              </div>
              <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow:hidden;">
                <div style="width: ${status === 'Running' ? progress : status === 'Success' ? 100 : 0}%; background: var(--color-primary); height: 100%; transition: width 0.3s ease;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Stages Map -->
        <div class="pipeline-stages">
          <div class="pipeline-stage ${status === 'Running' && stage === 'Build' ? 'running' : status === 'Success' || (status === 'Running' && ['Lint','Test','Deploy'].includes(stage)) ? 'completed' : ''}">Build</div>
          <div class="pipeline-stage ${status === 'Running' && stage === 'Lint' ? 'running' : status === 'Success' || (status === 'Running' && ['Test','Deploy'].includes(stage)) ? 'completed' : ''}">Lint</div>
          <div class="pipeline-stage ${status === 'Running' && stage === 'Test' ? 'running' : status === 'Success' || (status === 'Running' && stage === 'Deploy') ? 'completed' : ''}">Test</div>
          <div class="pipeline-stage ${status === 'Running' && stage === 'Deploy' ? 'running' : status === 'Success' ? 'completed' : ''}">Deploy</div>
        </div>

        <div style="margin-top: 1.25rem;">
          <button class="btn btn-primary w-full" id="btn-trigger-pipeline" ${status === 'Running' ? 'disabled' : ''}>
            ${status === 'Running' ? 'Building Bundle...' : 'Trigger Pipeline Run'}
          </button>
        </div>
      </div>

      <!-- Live Pipeline Build Console Logs -->
      <div class="card flex flex-col" style="padding: 1rem; background: #040508;">
        <div class="card-title" style="margin-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
          <div class="flex" style="align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${status === 'Running' ? 'var(--color-warning)' : 'var(--color-success)'};"></div>
            <span>Telemetry Pipeline Live Logs</span>
          </div>
          <span class="font-mono" style="font-size: 0.65rem; color: var(--text-dim); display: flex; align-items: center; gap: 8px;">
            <span style="display:flex;align-items:center;gap:4px;">
              <span style="width:6px;height:6px;border-radius:50%;background:var(--color-info);display:inline-block;"></span>
              Linked Blocker Check: Active
            </span>
          </span>
        </div>
        
        <!-- Console Text Stream -->
        <div id="pipeline-console-log" class="font-mono" style="
          flex-grow: 1;
          height: 180px;
          overflow-y: auto;
          background: #020305;
          border: 1px solid rgba(255,255,255,0.03);
          border-radius: 4px;
          padding: 0.75rem;
          font-size: 0.75rem;
          line-height: 1.5;
          color: #a3b3c3;
          white-space: pre-wrap;
        ">${logs.map(log => {
          if (log.includes('SUCCESS')) return `<span style="color: var(--color-success); font-weight:700;">${log}</span>`;
          if (log.includes('Failed') || log.includes('error')) return `<span style="color: var(--color-danger);">${log}</span>`;
          if (log.includes('[System]')) return `<span style="color: var(--color-info);">${log}</span>`;
          return log;
        }).join('\n')}</div>

        <!-- AI Root Cause Analysis Block -->
        <div id="ai-rca-block" style="display: ${status === 'Failed' ? 'flex' : 'none'}; margin-top: 0.5rem; padding: 0.5rem 0.75rem; background: rgba(244,63,94,0.08); border: 1px solid rgba(244,63,94,0.2); border-radius: 4px; font-size: 0.7rem; align-items: flex-start; gap: 6px;">
          <span style="color: var(--color-danger); font-weight: 700; flex-shrink:0;">[AI RCA Alert]:</span>
          <span style="color: var(--text-muted);">${state.pipeline.rcaMessage || 'Compilation halted due to unresolved blocker.'}</span>
        </div>
      </div>

    </div>

    <!-- Center Section: Product Subsystem Health & Code Test Coverage -->
    <div class="grid grid-cols-3 mb-4" style="grid-template-columns: 2fr 1fr;">
      
      <!-- Product Subsystem Health Ledger -->
      <div class="card" style="padding: 1.25rem;">
        <div class="card-title">
          <span>Product Subsystem Health Ledger</span>
          <span class="font-mono" style="font-size:0.7rem; color:var(--text-muted);">${(state.subsystems || []).length} Modules Tracked</span>
        </div>
        
        <div style="overflow-x: auto; margin-top: 0.5rem;">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Subsystem Module</th>
                <th>Linked Component</th>
                <th>Active Blockers</th>
                <th style="text-align: right;">System Status</th>
              </tr>
            </thead>
            <tbody>
              ${(state.subsystems || []).map(sub => {
                const isBlocked = sub.status === 'blocked';
                const isWarning = sub.status === 'warning';
                const statusBadge = isBlocked ? 'badge-danger' : isWarning ? 'badge-warning' : 'badge-success';
                const statusText = isBlocked ? 'Critical / Blocked' : isWarning ? 'Warning' : 'Healthy';
                // Find matching active blockers count
                const blockersCount = state.blockers.filter(b => 
                  b.status === 'Blocked' && 
                  (b.owner.toLowerCase().includes(sub.slug) || 
                   (sub.slug === 'infrastructure' && b.owner.includes('Infra')) || 
                   (sub.slug === 'engineering' && b.owner.includes('Engineering')))
                ).length;
                
                return `
                  <tr>
                    <td style="font-weight: 600;">${sub.name}</td>
                    <td class="font-mono" style="font-size:0.75rem; color: var(--color-primary);">#SUB-${sub.slug.toUpperCase()}</td>
                    <td><span class="badge ${blockersCount > 0 ? 'badge-danger' : 'badge-success'}" style="font-size:0.65rem;">${blockersCount} Active</span></td>
                    <td style="text-align: right;">
                      <span class="badge ${statusBadge}">${statusText}</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Test Code Coverage Stats Card -->
      <div class="card flex flex-col" style="justify-content: space-between; padding: 1.25rem;">
        <div>
          <div class="card-title">
            <span>Code Coverage</span>
            <span class="badge badge-success font-mono" style="font-size: 0.7rem;">+0.4% Sprint Target</span>
          </div>
          
          <div class="flex" style="align-items: center; justify-content: space-between; margin-top: 1rem; gap: 1rem;">
            <div class="flex-col">
              <span class="card-value">${coverage}%</span>
              <span class="card-subtitle">Aggregate Test Matrix</span>
            </div>
            
            <!-- Coverage circular SVG -->
            <div style="width: 4rem; height: 4rem; position: relative;">
              <svg viewBox="0 0 36 36" style="width:100%; height:100%;">
                <circle class="kpi-circle-bg" cx="18" cy="18" r="16"></circle>
                <circle cx="18" cy="18" r="16" fill="none" stroke="var(--color-success)" stroke-width="3" stroke-linecap="round"
                        stroke-dasharray="100, 100" stroke-dashoffset="${100 - coverage}"
                        style="transform: rotate(-90deg); transform-origin: 18px 18px; transition: stroke-dashoffset 0.8s ease;"></circle>
              </svg>
            </div>
          </div>
        </div>

        <div class="flex-col mt-4" style="gap: 8px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 1rem;">
          <div class="flex-col" style="gap: 4px;">
            <div class="flex-between" style="font-size:0.7rem;">
              <span style="color:var(--text-muted);">Unit Test Suites</span>
              <span class="font-mono">92.4%</span>
            </div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow:hidden;">
              <div style="width: 92.4%; background: var(--color-success); height: 100%;"></div>
            </div>
          </div>

          <div class="flex-col" style="gap: 4px;">
            <div class="flex-between" style="font-size:0.7rem;">
              <span style="color:var(--text-muted);">Integration Tests</span>
              <span class="font-mono">81.0%</span>
            </div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow:hidden;">
              <div style="width: 81%; background: var(--color-info); height: 100%;"></div>
            </div>
          </div>

          <div class="flex-col" style="gap: 4px;">
            <div class="flex-between" style="font-size:0.7rem;">
              <span style="color:var(--text-muted);">E2E Selenium Matrix</span>
              <span class="font-mono">75.5%</span>
            </div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow:hidden;">
              <div style="width: 75.5%; background: var(--color-primary); height: 100%;"></div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Bottom Row: Open Pull Request Logs -->
    <div class="card" style="padding: 1.25rem;">
      <div class="card-title">
        <span>Active Pull Request Ledger</span>
        <span class="badge badge-info" style="font-size: 0.7rem;">4 Pull Requests Open</span>
      </div>
      
      <div style="overflow-x: auto; margin-top: 0.5rem;">
        <table class="enterprise-table">
          <thead>
            <tr>
              <th>PR Reference</th>
              <th>Branch Channel</th>
              <th>Reviewer Team / Lead</th>
              <th>Review Tag</th>
              <th>Impacted Feature</th>
              <th>Scope Tag</th>
              <th>Lines Diff</th>
              <th style="text-align: right;">Review Status</th>
            </tr>
          </thead>
          <tbody>
            ${pullRequests.map(pr => `
              <tr>
                <td>
                  <div class="flex-col">
                    <span style="font-weight:600; font-size: 0.85rem;">${pr.title}</span>
                    <span style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">Opened by ${pr.author}</span>
                  </div>
                </td>
                <td class="font-mono" style="font-size:0.75rem; color: var(--color-primary);">
                  git://${pr.branch}
                </td>
                <td style="font-size:0.8rem; color: var(--text-muted);">${pr.reviewer}</td>
                <td>
                  <span class="badge ${
                    pr.tag === 'UI/UX' ? 'badge-info' : 
                    pr.tag === 'Security' ? 'badge-danger' : 
                    pr.tag === 'Infrastructure' ? 'badge-warning' : 'badge-success'
                  }" style="font-size: 0.65rem;">${pr.tag}</span>
                </td>
                <td>
                  ${pr.id === 1042 
                    ? '<a href="#" class="badge badge-info" style="font-size:0.65rem; text-decoration:none; cursor:pointer;">UI/UX v1.4 Theme Sync</a>' 
                    : pr.id === 1041 
                    ? '<span class="badge badge-danger" style="font-size:0.65rem;">Q2 Core Security Audit</span>' 
                    : '<span class="font-mono" style="font-size:0.7rem; color:var(--text-dim);">General Optimization</span>'}
                </td>
                <td class="font-mono" style="font-size: 0.75rem; color: var(--text-dim);">#PR-${pr.id}</td>
                <td class="font-mono" style="font-size:0.75rem; font-weight:600; color: ${pr.changes.startsWith('+') && !pr.changes.includes('-') ? 'var(--color-success)' : 'var(--text-muted)'};">${pr.changes}</td>
                <td style="text-align: right;">
                  <span class="badge ${
                    pr.status.includes('Approved') ? 'badge-success' : 
                    pr.status.includes('Changes') ? 'badge-danger' : 'badge-warning'
                  }" style="font-size:0.7rem;">${pr.status}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // --- BIND INTERACTIVE EVENTS ---

  // Trigger CI/CD pipeline
  const pipelineBtn = container.querySelector('#btn-trigger-pipeline');
  if (pipelineBtn) {
    pipelineBtn.addEventListener('click', () => {
      store.triggerPipelineRun();
    });
  }

  // Auto scroll console container to the bottom
  const consoleLogEl = container.querySelector('#pipeline-console-log');
  if (consoleLogEl) {
    consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
  }

  // Render Departmental Operations & Collaboration Board
  renderWorkspaceBoard(container, 'engineering');
}
