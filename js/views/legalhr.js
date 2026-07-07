import { store } from '../state.js';
import { renderWorkspaceBoard } from '../components/workspaceBoard.js';

export function render(container) {
  const state = store.state;
  const complianceScore = store.getCompliancePercent();
  
  // Dynamic Risk Level Calculation
  let riskLevel = 'Low Risk';
  let riskBadgeClass = 'badge-success';
  if (complianceScore < 50) {
    riskLevel = 'High Risk';
    riskBadgeClass = 'badge-danger';
  } else if (complianceScore < 75) {
    riskLevel = 'Medium Risk';
    riskBadgeClass = 'badge-warning';
  }

  // Mock HR onboarding ledger data
  const onboardingLedger = [
    { name: 'Dr. Evelyn Martinez', role: 'Security Architect', dept: 'Infrastructure', phase: 'Active', complianceTraining: '100% Complete', date: 'Jun 22, 2026' },
    { name: 'Rajesh Koothrapali', role: 'Systems Engineer', dept: 'Engineering Core', phase: 'System Access', complianceTraining: '85% In Progress', date: 'Jun 24, 2026' },
    { name: 'Diana Prince', role: 'General Counsel', dept: 'Legal & HR', phase: 'Active', complianceTraining: '100% Complete', date: 'Jun 25, 2026' },
    { name: 'Clara Oswald', role: 'Front End Designer', dept: 'UI/UX Design', phase: 'Document Signoff', complianceTraining: '0% Awaiting', date: 'Jun 27, 2026' }
  ];

  container.innerHTML = `
    <!-- Top Row: Dynamic Compliance Matrix & Compliance Score Card -->
    <div class="grid grid-cols-3 mb-4" style="grid-template-columns: 2fr 1fr;">
      
      <!-- GDPR / CCPA / SOC2 Compliance Checklist Grid -->
      <div class="card" style="padding: 1.25rem;">
        <div class="card-title">
          <span>GDPR / CCPA / SOC2 Compliance Control Checklist</span>
          <span class="badge badge-info" style="font-size:0.65rem;">Interactive Telemetry</span>
        </div>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          Toggling compliance tasks directly updates the executive compliance telemetry index.
        </p>
        
        <div class="flex-col" style="margin-top: 0.5rem; gap: 4px;">
          ${state.complianceChecklist.map(item => `
            <div class="checklist-item">
              <input type="checkbox" id="${item.id}" class="checklist-checkbox compliance-chk" data-id="${item.id}" ${item.checked ? 'checked' : ''}>
              <label for="${item.id}" class="checklist-label">
                <strong style="color:var(--color-primary); font-size: 0.75rem; font-family: var(--font-mono); margin-right: 4px;">[${item.category}]</strong>
                ${item.text}
              </label>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Compliance Risk Index Summary -->
      <div class="card flex flex-col" style="justify-content: space-between; padding: 1.25rem;">
        <div>
          <div class="card-title">
            <span>Audit Assessment</span>
            <span class="badge ${riskBadgeClass}">${riskLevel}</span>
          </div>
          
          <div class="flex-col mt-4" style="gap: 1rem;">
            <div class="flex-between">
              <span style="font-size: 0.75rem; color: var(--text-dim);">Compliance Rating:</span>
              <span class="font-mono text-success" style="font-size: 1.25rem; font-weight:700;">${complianceScore}%</span>
            </div>
            
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow:hidden;">
              <div style="width: ${complianceScore}%; background: ${riskLevel === 'High Risk' ? 'var(--color-danger)' : riskLevel === 'Medium Risk' ? 'var(--color-warning)' : 'var(--color-success)'}; height: 100%; transition: width 0.4s ease;"></div>
            </div>
            
            <div class="flex-between" style="font-size:0.7rem; color:var(--text-muted); border-top: 1px solid rgba(255,255,255,0.03); padding-top: 0.5rem;">
              <span>Total Controls:</span>
              <span>${state.complianceChecklist.length} mapped</span>
            </div>
            
            <div class="flex-between" style="font-size:0.7rem; color:var(--text-muted);">
              <span>Checked Controls:</span>
              <span class="font-mono">${state.complianceChecklist.filter(c => c.checked).length} verified</span>
            </div>
          </div>
        </div>

        <div style="background: var(--bg-surface-elevated); padding: 10px; border-radius: 4px; border:1px solid var(--border-outline-variant-60); margin-top: 1rem;">
          <p style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4;">
            <strong>GDPR / HIPAA Audit warning:</strong> System metrics require all GDPR and HIPAA items to be checked to clear data protection liability benchmarks.
          </p>
        </div>
      </div>

    </div>

    <!-- Bottom Row: Employee Onboarding & Organizational Health -->
    <div class="card" style="padding: 1.25rem;">
      <div class="card-title">
        <span>Organizational HR & Security Access Ledger</span>
        <span class="badge badge-success">4 Active Onboarding Lanes</span>
      </div>
      
      <div style="overflow-x: auto; margin-top: 0.5rem;">
        <table class="enterprise-table">
          <thead>
            <tr>
              <th>Employee Name & Role</th>
              <th>Department Workspace</th>
              <th>Onboarding Phase</th>
              <th>Security Training Status</th>
              <th>Sync Target Date</th>
              <th style="text-align: right;">Onboarding Status</th>
            </tr>
          </thead>
          <tbody>
            ${onboardingLedger.map(emp => `
              <tr>
                <td>
                  <div class="flex-col">
                    <span style="font-weight:600; font-size: 0.85rem;">${emp.name}</span>
                    <span style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">${emp.role}</span>
                  </div>
                </td>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${emp.dept}</td>
                <td class="font-mono" style="font-size: 0.75rem; color: var(--color-primary);">${emp.phase}</td>
                <td class="font-mono" style="font-size: 0.75rem;">${emp.complianceTraining}</td>
                <td class="font-mono" style="font-size: 0.75rem; color: var(--text-dim);">${emp.date}</td>
                <td style="text-align: right;">
                  <span class="badge ${
                    emp.phase === 'Active' ? 'badge-success' : 
                    emp.phase === 'System Access' ? 'badge-info' : 'badge-warning'
                  }" style="font-size: 0.65rem;">
                    ${emp.phase === 'Active' ? 'Cleared' : 'In Progress'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // --- BIND EVENT HANDLERS ---
  
  // Checkbox toggle actions
  const checkboxes = container.querySelectorAll('.compliance-chk');
  checkboxes.forEach(chk => {
    chk.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      store.toggleComplianceItem(id);
    });
  });

  // Render Departmental Operations & Collaboration Board
  renderWorkspaceBoard(container, 'legalhr');
}
