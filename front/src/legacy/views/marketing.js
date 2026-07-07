import { store } from '../state.js';
import { renderWorkspaceBoard } from '../components/workspaceBoard.js';

export function render(container) {
  const state = store.state;
  const campaigns = state.marketing.campaigns;

  // Funnel volume values
  const funnelStages = [
    { name: 'Total Leads Generated', count: '28,600', percent: '100%', conversion: '52.4%', color: 'var(--color-primary)' },
    { name: 'MQL (Marketing Qualified)', count: '15,000', percent: '52.4%', conversion: '42.0%', color: 'var(--color-info)' },
    { name: 'SQL (Sales Qualified)', count: '6,300', percent: '22.0%', conversion: '36.5%', color: 'var(--color-warning)' },
    { name: 'Technical Demo Met', count: '2,300', percent: '8.0%', conversion: '47.8%', color: 'var(--color-danger)' },
    { name: 'Closed-Won Enterprise', count: '1,100', percent: '3.8%', conversion: '--', color: 'var(--color-success)' }
  ];

  // Check for unresolved cross-functional blockers impacting marketing
  const hasActiveBlocker = state.blockers && state.blockers.some(b => b.status === 'Blocked');
  const roiColor = hasActiveBlocker ? 'var(--color-warning)' : 'var(--color-success)';
  const mqlColor = hasActiveBlocker ? 'var(--text-dim)' : 'var(--color-info)';

  container.innerHTML = `
    ${hasActiveBlocker ? `
    <!-- AI Acquisition Telemetry Alert -->
    <div style="margin-bottom: 1rem; padding: 0.75rem 1rem; background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.25); border-radius: 6px; display: flex; align-items: flex-start; gap: 8px;">
      <span style="color: var(--color-danger); font-weight: 700; font-size: 0.75rem; flex-shrink:0; font-family: var(--font-mono);">[AI Acquisition Telemetry Alert]:</span>
      <span style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">Marketing Qualified Leads (MQL) conversion velocity is projected to drop by 12.4% over the next 24 hours because the dependent Auth Subsystem is currently experiencing a Critical Blocker (#BLK-1).</span>
    </div>
    ` : ''}

    <!-- Top Row: Interactive Marketing Conversion Funnel -->
    <div class="grid grid-cols-2 mb-4" style="grid-template-columns: 1.2fr 0.8fr;">
      
      <!-- Visual SVG Funnel -->
      <div class="card" style="padding: 1.25rem;">
        <div class="card-title">
          <span>Marketing Acquisition Funnel</span>
          <span class="badge badge-info">Q2 Global</span>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 1rem;">
          ${funnelStages.map((stage, idx) => {
            // Width scaling factor for visual funnel representation
            const widthPct = 100 - (idx * 16);
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                <!-- Label -->
                <div style="width: 140px; font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">
                  ${stage.name}
                </div>
                
                <!-- Funnel segment bar -->
                <div style="flex-grow: 1; height: 1.75rem; background: rgba(255,255,255,0.02); border-radius: 4px; border: 1px solid var(--border-outline-variant-60); display: flex; overflow: hidden; position: relative;">
                  <div style="
                    width: ${widthPct}%; 
                    background: linear-gradient(90deg, ${stage.color}40, ${stage.color}15);
                    border-right: 2px solid ${stage.color};
                    height: 100%;
                    display: flex;
                    align-items: center;
                    padding-left: 10px;
                  ">
                    <span class="font-mono" style="font-size: 0.8rem; font-weight: 700; color: var(--text-on-surface);">${stage.count}</span>
                  </div>
                  
                  <div style="position: absolute; right: 10px; top: 0; bottom: 0; display:flex; align-items:center; font-size: 0.65rem; color: var(--text-dim);" class="font-mono">
                    ${stage.percent} of Total
                  </div>
                </div>

                <!-- Conversion rate to next step -->
                <div style="width: 70px; text-align: right;" class="font-mono">
                  ${stage.conversion !== '--' ? `
                    <span style="font-size: 0.75rem; color: var(--color-success); font-weight:600;">➔ ${stage.conversion}</span>
                  ` : `
                    <span style="font-size: 0.7rem; color: var(--text-dim);">Final Won</span>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Funnel Metrics Inspector -->
      <div class="card flex flex-col" style="justify-content: space-between; padding: 1.25rem;">
        <div>
          <div class="card-title">
            <span>Funnel Telemetry Stats</span>
            <span class="font-mono" style="font-size: 0.7rem; color: ${roiColor};">ROI 3.2x${hasActiveBlocker ? ' (At Risk)' : ''}</span>
          </div>
          
          <div class="flex-col mt-4" style="gap: 12px;">
            <div style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 8px;">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Average Lead-to-Won:</span>
              <span class="font-mono" style="font-size:0.75rem; font-weight: 700; color: ${roiColor};">3.84% (High Tier)</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 8px;">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Avg Deal Cycle (Enterprise):</span>
              <span class="font-mono" style="font-size:0.75rem; font-weight: 600;">34 Days</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 8px;">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Cost Per Acquisition (CAC):</span>
              <span class="font-mono" style="font-size:0.75rem; font-weight: 600; color: ${hasActiveBlocker ? 'var(--color-danger)' : 'var(--text-dim)'};">$154.50</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Marketing Qualified Leads (MQLs):</span>
              <span class="font-mono" style="font-size:0.75rem; font-weight: 600; color: ${mqlColor};">15,000</span>
            </div>
          </div>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: 4px; border:1px solid var(--border-outline-variant-60); margin-top: 1rem;">
          <p style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4;">
            <strong>MQL-to-SQL Velocity:</strong> Technical whitepaper conversion ratios remain top performers, driving demo met rates above standard search pipelines. Recommend allocating Q3 budgets towards architect-targeted search terms.
          </p>
        </div>
      </div>

    </div>

    <!-- Campaign Performance Table Ledger -->
    <div class="card" style="padding: 1.25rem;">
      <div class="card-title">
        <span>Acquisition Campaign Performance Ledger</span>
        <span class="badge badge-success">4 Running Channels</span>
      </div>
      
      <div style="overflow-x: auto; margin-top: 0.5rem;">
        <table class="enterprise-table">
          <thead>
            <tr>
              <th>Campaign Channel</th>
              <th>Status</th>
              <th>Total Leads Generated</th>
              <th>Spend Allocation</th>
              <th>Dependent Subsystem</th>
              <th>Avg Conversion Rate</th>
              <th>Computed Cost Per Lead (CPL)</th>
            </tr>
          </thead>
          <tbody>
            ${campaigns.map(c => {
              const cpl = (c.spend / c.leads).toFixed(2);
              return `
                <tr>
                  <td style="font-weight: 600;">${c.name}</td>
                  <td>
                    <span class="badge ${
                      c.status === 'Active' ? 'badge-success' : 
                      c.status === 'Completed' ? 'badge-info' : 
                      c.status === 'Paused' ? 'badge-warning' : 'badge-danger'
                    }">${c.status}</span>
                  </td>
                  <td class="font-mono" style="font-size: 0.75rem;">${c.leads.toLocaleString()}</td>
                  <td class="font-mono" style="font-size: 0.75rem;">$${c.spend.toLocaleString()}</td>
                  <td>
                    ${c.name === 'Enterprise Lead-Gen Google Search' 
                      ? '<span class="badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-dim); font-size: 0.65rem;">React SPA Client v18.3</span>' 
                      : c.name === 'Product Architecture Whitepaper' 
                      ? '<span class="font-mono" style="font-size: 0.7rem; color: var(--color-info);">Core API Engine</span>' 
                      : c.name === 'DevOps Weekly Newsletter Programmatic' 
                      ? '<span class="badge badge-danger" style="font-size: 0.65rem;">Auth & Gateway Security (BLOCKED)</span>' 
                      : '<span style="color: var(--text-dim); font-size: 0.75rem;">N/A</span>'}
                  </td>
                  <td class="font-mono" style="font-size: 0.75rem; color: var(--color-success); font-weight: 600;">${c.conversion}%</td>
                  <td class="font-mono" style="font-size: 0.75rem; font-weight: 700;">$${cpl}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Render Departmental Operations & Collaboration Board
  renderWorkspaceBoard(container, 'marketing');
}
