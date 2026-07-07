import { store } from '../state.js';
import { renderWorkspaceBoard } from '../components/workspaceBoard.js';

export function render(container) {
  const state = store.state;
  const finance = state.finance;

  // CapEx vs OpEx data structures
  const budgetAllocation = {
    capex: [
      { name: 'Core Server Ingress Hardware (Frankfurt)', allocated: 450000, spent: 412000, status: 'Within Limits' },
      { name: 'Enterprise database replication licenses', allocated: 350000, spent: 348000, status: 'Near Cap' },
      { name: 'UI/UX Design framework workstation assets', allocated: 200000, spent: 185000, status: 'Within Limits' },
      { name: 'Physical network security hardware interfaces', allocated: 250000, spent: 215000, status: 'Within Limits' }
    ],
    opex: [
      { name: 'Cross-functional engineering engineering salaries', allocated: 300000, spent: 285000, status: 'Within Limits' },
      { name: 'AWS Cloud cluster node consumption & EC2 billing', allocated: 250000, spent: 265000, status: 'Exceeded' },
      { name: 'External legal GDPR compliance auditing retainers', allocated: 120000, spent: 110000, status: 'Within Limits' },
      { name: 'Administrative operations & recruitment tooling', allocated: 80000, spent: 72000, status: 'Within Limits' }
    ]
  };

  // Departmental allocation percentages
  const departmentsBudget = [
    { name: 'Engineering Core', percent: 45, allocated: '$900k', spent: '$882k', color: 'var(--color-primary)' },
    { name: 'Infrastructure Cluster', percent: 15, allocated: '$300k', spent: '$282k', color: 'var(--color-info)' },
    { name: 'Marketing & Acquisition', percent: 20, allocated: '$400k', spent: '$384k', color: 'var(--color-warning)' },
    { name: 'UI/UX Product Design', percent: 10, allocated: '$200k', spent: '$185k', color: 'var(--color-danger)' },
    { name: 'Legal, Compliance & HR', percent: 10, allocated: '$200k', spent: '$142k', color: 'var(--color-success)' }
  ];

  container.innerHTML = `
    <!-- Top Row: Departmental Allocations & Forecast vs Actuals SVG Chart -->
    <div class="grid grid-cols-2 mb-4" style="grid-template-columns: 0.8fr 1.2fr;">
      
      <!-- Department Allocations -->
      <div class="card flex flex-col" style="justify-content: space-between; padding: 1.25rem;">
        <div>
          <div class="card-title">
            <span>Departmental Budget Split</span>
            <span class="badge badge-success">Active Q2</span>
          </div>
          
          <div class="flex-col mt-4" style="gap: 12px;">
            ${departmentsBudget.map(dept => `
              <div class="flex-col" style="gap: 4px;">
                <div class="flex-between" style="font-size:0.75rem;">
                  <span style="font-weight:600;">${dept.name} (${dept.percent}%)</span>
                  <span class="font-mono">${dept.spent} / ${dept.allocated}</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow:hidden;">
                  <div style="width: ${dept.percent}%; background: ${dept.color}; height: 100%;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div style="font-size:0.7rem; color:var(--text-dim); border-top:1px solid rgba(255,255,255,0.03); padding-top:0.5rem; margin-top:1rem;">
          Total Q2 Budget Scope: <strong class="font-mono text-success" style="font-size:0.75rem;">$2,000,000</strong>
        </div>
      </div>

      <!-- Forecast vs Actual expenditures SVG Bar Chart -->
      <div class="card flex flex-col" style="padding: 1.25rem;">
        <div class="card-title">
          <span>Forecast vs Actuals Financial Telemetry</span>
          <div class="flex" style="gap: 10px; font-size: 0.7rem;">
            <span class="flex" style="align-items: center; gap: 4px;">
              <span style="display:inline-block; width:8px; height:8px; background: var(--color-primary); border-radius: 2px;"></span>
              Forecast
            </span>
            <span class="flex" style="align-items: center; gap: 4px;">
              <span style="display:inline-block; width:8px; height:8px; background: var(--color-success); border-radius: 2px;"></span>
              Actuals
            </span>
          </div>
        </div>

        <div style="flex-grow: 1; min-height: 180px; display:flex; align-items:flex-end; justify-content:space-around; gap: 15px; margin-top: 1rem; border-bottom: 1.5px solid var(--border-outline-variant-60); padding-bottom: 8px; position:relative;">
          <!-- Custom SVG background lines -->
          <div style="position:absolute; top:25%; left:0; right:0; border-top: 1px dashed rgba(255,255,255,0.05);"></div>
          <div style="position:absolute; top:50%; left:0; right:0; border-top: 1px dashed rgba(255,255,255,0.05);"></div>
          <div style="position:absolute; top:75%; left:0; right:0; border-top: 1px dashed rgba(255,255,255,0.05);"></div>
          
          <!-- Bar 1: Q1 -->
          <div class="flex-col" style="align-items:center; z-index: 10;">
            <div class="flex" style="align-items:flex-end; gap:6px; height: 110px;">
              <!-- Forecast: 80px -->
              <div style="width: 20px; height: 80px; background: var(--color-primary); border-radius: 3px 3px 0 0;" title="Q1 Forecast: $1.6M"></div>
              <!-- Actual: 75px -->
              <div style="width: 20px; height: 75px; background: var(--color-success); border-radius: 3px 3px 0 0;" title="Q1 Actual: $1.5M"></div>
            </div>
            <span class="font-mono" style="font-size: 0.75rem; font-weight:600; margin-top:6px; color:var(--text-muted);">Q1 Actual</span>
          </div>

          <!-- Bar 2: Q2 (Current) -->
          <div class="flex-col" style="align-items:center; z-index: 10;">
            <div class="flex" style="align-items:flex-end; gap:6px; height: 110px;">
              <!-- Forecast: 100px -->
              <div style="width: 20px; height: 100px; background: var(--color-primary); border-radius: 3px 3px 0 0;" title="Q2 Forecast: $2.0M"></div>
              <!-- Actual: 102px -->
              <div style="width: 20px; height: 102px; background: var(--color-success); border-radius: 3px 3px 0 0;" title="Q2 Actual: $2.04M"></div>
            </div>
            <span class="font-mono" style="font-size: 0.75rem; font-weight:700; margin-top:6px; color:var(--text-on-surface);">Q2 (Active)</span>
          </div>

          <!-- Bar 3: Q3 Projections -->
          <div class="flex-col" style="align-items:center; z-index: 10;">
            <div class="flex" style="align-items:flex-end; gap:6px; height: 110px;">
              <!-- Forecast: 120px -->
              <div style="width: 20px; height: 110px; background: var(--color-primary); opacity: 0.5; border-radius: 3px 3px 0 0;" title="Q3 Forecast: $2.2M"></div>
              <!-- Actual: 0px -->
              <div style="width: 20px; height: 0px; background: var(--color-success); border-radius: 3px 3px 0 0;"></div>
            </div>
            <span class="font-mono" style="font-size: 0.75rem; font-weight:600; margin-top:6px; color:var(--text-dim);">Q3 Proj</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Bottom Row: CapEx vs OpEx Ledger breakdowns -->
    <div class="grid grid-cols-2">
      
      <!-- Capital Expenditures Ledger -->
      <div class="card" style="padding: 1.25rem;">
        <div class="card-title">
          <span>Capital Expenditures Ledger (CapEx)</span>
          <span class="badge badge-info" style="font-size: 0.65rem;">Asset Creation</span>
        </div>
        
        <div style="overflow-x: auto; margin-top: 0.5rem;">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>CapEx Asset Name</th>
                <th>Budget Limit</th>
                <th>Spent to Date</th>
                <th style="text-align: right;">System Status</th>
              </tr>
            </thead>
            <tbody>
              ${budgetAllocation.capex.map(item => `
                <tr>
                  <td style="font-weight:600;">${item.name}</td>
                  <td class="font-mono" style="font-size: 0.75rem;">$${item.allocated.toLocaleString()}</td>
                  <td class="font-mono" style="font-size: 0.75rem;">$${item.spent.toLocaleString()}</td>
                  <td style="text-align: right;">
                    <span class="badge badge-success" style="font-size:0.65rem;">${item.status}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Operational Expenditures Ledger -->
      <div class="card" style="padding: 1.25rem;">
        <div class="card-title">
          <span>Operational Expenditures Ledger (OpEx)</span>
          <span class="badge badge-info" style="font-size: 0.65rem;">Day-to-day Running</span>
        </div>
        
        <div style="overflow-x: auto; margin-top: 0.5rem;">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>OpEx Expense Slot</th>
                <th>Budget Limit</th>
                <th>Spent to Date</th>
                <th style="text-align: right;">System Status</th>
              </tr>
            </thead>
            <tbody>
              ${budgetAllocation.opex.map(item => `
                <tr>
                  <td style="font-weight:600;">${item.name}</td>
                  <td class="font-mono" style="font-size: 0.75rem;">$${item.allocated.toLocaleString()}</td>
                  <td class="font-mono" style="font-size: 0.75rem; color: ${item.spent > item.allocated ? 'var(--color-danger)' : 'var(--text-on-surface)'}">${item.spent.toLocaleString()}</td>
                  <td style="text-align: right;">
                    <span class="badge ${item.spent > item.allocated ? 'badge-danger' : 'badge-success'}" style="font-size:0.65rem;">${item.status}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  // Render Departmental Operations & Collaboration Board
  renderWorkspaceBoard(container, 'finance');
}
