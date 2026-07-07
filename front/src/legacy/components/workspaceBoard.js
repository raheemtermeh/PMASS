import { store } from '../state.js';

export function renderWorkspaceBoard(container, workspaceName) {
  const state = store.state;
  
  // Persist active tab across view re-renders
  const tabKey = `tab-${workspaceName}`;
  if (!window.__workspaceBoardTabs) {
    window.__workspaceBoardTabs = {};
  }
  if (!window.__workspaceBoardTabs[tabKey]) {
    window.__workspaceBoardTabs[tabKey] = 'task'; // default tab
  }
  const activeTab = window.__workspaceBoardTabs[tabKey];

  // Persist expanded rows across view re-renders
  if (!window.__expandedBoardRows) {
    window.__expandedBoardRows = new Set();
  }

  // Filter items for this workspace
  const workspaceItems = state.workspaceItems.filter(item => item.workspace === workspaceName);
  
  // Get counts for badges
  const taskCount = workspaceItems.filter(i => i.type === 'task').length;
  const issueCount = workspaceItems.filter(i => i.type === 'issue').length;
  const handoffCount = workspaceItems.filter(i => i.type === 'handoff').length;
  const blockerCount = workspaceItems.filter(i => i.type === 'blocker').length;

  // Filter items for the active tab
  const activeItems = workspaceItems.filter(item => item.type === activeTab);

  // Friendly names for type display
  const typeLabels = {
    task: 'Tasks',
    issue: 'Issues',
    handoff: 'Handoffs',
    blocker: 'Blockers'
  };

  // Render board HTML structure
  const boardHtml = `
    <div class="card mt-4" style="padding: 1.25rem;">
      <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div class="flex-col">
          <span>Departmental Operations & Collaboration Board</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal; margin-top: 2px;">
            Manage and track workspace tasks, active issues, cross-department handoffs, and blocker telemetries.
          </span>
        </div>
        <button class="btn btn-primary" id="btn-add-board-item" style="padding: 0.375rem 0.75rem; font-size: 0.75rem;">
          + Create Operational Item
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; margin-top: 1rem; border-bottom: 1px solid var(--border-outline-variant-60); padding-bottom: 8px; flex-wrap: wrap;">
        <button class="btn btn-tab ${activeTab === 'task' ? 'btn-primary' : 'btn-secondary'}" data-tab="task" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
          <span>Tasks</span>
          <span class="font-mono" style="background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-size: 0.65rem;">${taskCount}</span>
        </button>
        <button class="btn btn-tab ${activeTab === 'issue' ? 'btn-primary' : 'btn-secondary'}" data-tab="issue" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
          <span>Issues</span>
          <span class="font-mono" style="background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-size: 0.65rem;">${issueCount}</span>
        </button>
        <button class="btn btn-tab ${activeTab === 'handoff' ? 'btn-primary' : 'btn-secondary'}" data-tab="handoff" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
          <span>Handoffs</span>
          <span class="font-mono" style="background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-size: 0.65rem;">${handoffCount}</span>
        </button>
        <button class="btn btn-tab ${activeTab === 'blocker' ? 'btn-primary' : 'btn-secondary'}" data-tab="blocker" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
          <span>Blockers</span>
          <span class="font-mono" style="background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 4px; font-size: 0.65rem;">${blockerCount}</span>
        </button>
      </div>

      <!-- Items Grid / Table -->
      <div style="overflow-x: auto; margin-top: 0.75rem;">
        <table class="enterprise-table" style="min-width: 700px;">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center; padding-right: 0;"></th>
              <th style="width: 100px;">ID</th>
              <th style="width: 100px;">Severity</th>
              <th>Description</th>
              <th style="width: 130px;">Linked Code PR</th>
              <th style="width: 150px;">Assignee</th>
              <th style="width: 120px;">Status</th>
              <th style="text-align: right; width: 140px;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${activeItems.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 2rem 0; font-style: italic;">
                  No active ${typeLabels[activeTab].toLowerCase()} reported for this organization.
                </td>
              </tr>
            ` : activeItems.map(item => {
              const isExpanded = window.__expandedBoardRows.has(item.id);
              const refPrefix = 
                item.type === 'task' ? 'TSK' :
                item.type === 'issue' ? 'ISS' :
                item.type === 'handoff' ? 'HDF' : 'BLK';
              
              // Action buttons mapping
              let actionButton = '';
              if (item.type === 'blocker') {
                if (item.status === 'Blocked') {
                  actionButton = `<button class="btn btn-primary btn-action-update" data-id="${item.id}" data-status="Resolved" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; width: 100px;">Resolve</button>`;
                } else {
                  actionButton = `<span class="text-success font-mono" style="font-size: 0.7rem;">✔ Resolved</span>`;
                }
              } else {
                if (item.status === 'Backlog') {
                  actionButton = `
                    <div class="flex gap-1" style="justify-content: flex-end;">
                      <button class="btn btn-secondary btn-action-update" data-id="${item.id}" data-status="In Progress" style="padding: 0.25rem 0.4rem; font-size: 0.65rem;">Start</button>
                      <button class="btn btn-primary btn-action-update" data-id="${item.id}" data-status="Completed" style="padding: 0.25rem 0.4rem; font-size: 0.65rem;">Done</button>
                    </div>
                  `;
                } else if (item.status === 'In Progress' || item.status === 'Active') {
                  actionButton = `<button class="btn btn-primary btn-action-update" data-id="${item.id}" data-status="Completed" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; width: 100px;">Complete</button>`;
                } else if (item.status === 'Completed') {
                  actionButton = `<span class="text-success font-mono" style="font-size: 0.7rem;">✔ Completed</span>`;
                }
              }

              // Status styles
              let statusClass = 'text-dim';
              if (item.status === 'Blocked' || item.status === 'Active') {
                statusClass = 'text-danger';
              } else if (item.status === 'In Progress') {
                statusClass = 'text-info';
              } else if (item.status === 'Completed' || item.status === 'Resolved') {
                statusClass = 'text-success';
              }

              return `
                <tr class="blocker-row board-row ${isExpanded ? 'expanded' : ''}" data-id="${item.id}">
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
                    ${item.targetWorkspace ? `
                      <span style="font-size: 0.65rem; background: var(--bg-surface-elevated); padding: 1px 6px; border-radius: 4px; border: 1px dashed var(--border-outline-variant); color: var(--color-info); margin-left: 6px; font-weight: normal;">
                        Handoff to: ${item.targetWorkspace === 'legalhr' ? 'Legal & HR' : item.targetWorkspace.toUpperCase()}
                      </span>
                    ` : ''}
                  </td>
                  ${item.id === 'item-8' ? `
                    <td>
                      <a href="#/engineering" class="badge badge-info" style="text-decoration: none; border: 1px solid rgba(99, 102, 241, 0.3); background: rgba(99, 102, 241, 0.1); color: var(--color-primary); font-family: var(--font-mono); font-size: 0.7rem; display: inline-block;">#PR-1042</a>
                    </td>
                  ` : `
                    <td>
                      <span class="badge" style="background: rgba(255, 255, 255, 0.05); border: 1px dashed rgba(255, 255, 255, 0.15); color: var(--text-dim); font-size: 0.7rem; pointer-events: none; display: inline-block;">No PR Linked</span>
                    </td>
                  `}
                  <td style="color: var(--text-muted); font-size: 0.8rem;">${item.owner || 'Unassigned'}</td>
                  <td>
                    <span style="font-weight:600; font-size: 0.8rem;" class="${statusClass}">${item.status}</span>
                  </td>
                  <td style="text-align: right; pointer-events: auto;">
                    ${actionButton}
                  </td>
                </tr>
                <tr class="blocker-details-row board-details-row ${isExpanded ? 'show' : ''}" id="details-${item.id}">
                  <td colspan="8" style="padding: 0; border: none;">
                    <div class="blocker-details-content">
                      <div style="display: flex; flex-direction: column; gap: 0.5rem; border-left: 2px solid var(--color-primary); padding-left: 10px; margin: 6px 0;">
                        <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-family: var(--font-mono); font-weight: 600;">Details & Action Plan</span>
                        <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin: 0;">
                          ${item.details || 'No additional details provided.'}
                        </p>
                        <div class="flex" style="gap: 1.5rem; font-size: 0.65rem; color: var(--text-dim); margin-top: 4px; font-family: var(--font-mono);">
                          <span>Created: ${new Date(item.createdAt).toLocaleString()}</span>
                          ${item.completedAt ? `<span>Completed: ${new Date(item.completedAt).toLocaleString()}</span>` : ''}
                        </div>
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
  `;

  // Create workspace board container
  const boardWrapperId = `board-wrapper-${workspaceName}`;
  let boardWrapper = container.querySelector(`#${boardWrapperId}`);
  if (!boardWrapper) {
    boardWrapper = document.createElement('div');
    boardWrapper.id = boardWrapperId;
    container.appendChild(boardWrapper);
  }
  boardWrapper.innerHTML = boardHtml;

  // --- BIND EVENT HANDLERS ---
  
  // 1. Tab switches
  const tabButtons = boardWrapper.querySelectorAll('.btn-tab');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selectedTab = e.currentTarget.getAttribute('data-tab');
      window.__workspaceBoardTabs[tabKey] = selectedTab;
      // Re-trigger global dashboard re-render by notifying subscribers
      store.notify();
    });
  });

  // 2. Expand/Collapse rows
  const boardRows = boardWrapper.querySelectorAll('.board-row');
  boardRows.forEach(row => {
    row.addEventListener('click', (e) => {
      // Ignore click if clicking action buttons
      if (e.target.closest('.btn-action-update') || e.target.closest('.btn')) {
        return;
      }
      
      const id = row.getAttribute('data-id');
      const detailsRow = boardWrapper.querySelector(`#details-${id}`);
      const chevron = row.querySelector('.chevron-icon');

      if (window.__expandedBoardRows.has(id)) {
        window.__expandedBoardRows.delete(id);
        row.classList.remove('expanded');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (detailsRow) detailsRow.classList.remove('show');
      } else {
        window.__expandedBoardRows.add(id);
        row.classList.add('expanded');
        if (chevron) chevron.style.transform = 'rotate(90deg)';
        if (detailsRow) detailsRow.classList.add('show');
      }
    });
  });

  // 3. Status updates (Start/Complete/Resolve)
  const updateButtons = boardWrapper.querySelectorAll('.btn-action-update');
  updateButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const newStatus = e.currentTarget.getAttribute('data-status');
      store.updateWorkspaceItemStatus(id, newStatus);
    });
  });

  // 4. Modal Backdrop and logic creation
  const modalId = `modal-add-${workspaceName}`;
  
  // Don't remove modal if open — preserves input focus during telemetry re-renders
  let modalDiv = document.getElementById(modalId);
  const modalWasActive = modalDiv && modalDiv.classList.contains('active');
  if (modalDiv) {
    if (!modalWasActive) {
      modalDiv.remove();
      modalDiv = null;
    }
  }

  if (!modalDiv) {
    modalDiv = document.createElement('div');
    modalDiv.id = modalId;
    modalDiv.className = 'modal-backdrop';
    modalDiv.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Create Operational Item</h2>
          <button class="modal-close" id="modal-close-${workspaceName}" aria-label="Close dialog">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <form id="form-add-${workspaceName}" novalidate>
          <div class="modal-body">
            <div class="form-group">
              <label for="item-title" class="form-label">Item Title / Summary</label>
              <input type="text" class="form-control" id="item-title" placeholder="e.g., Integrate OAuth user access flow" required>
              <div class="invalid-feedback">Please enter a brief title/summary.</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label for="item-type" class="form-label">Item Type</label>
                <select class="form-control" id="item-type">
                  <option value="task" ${activeTab === 'task' ? 'selected' : ''}>Task</option>
                  <option value="issue" ${activeTab === 'issue' ? 'selected' : ''}>Issue</option>
                  <option value="handoff" ${activeTab === 'handoff' ? 'selected' : ''}>Handoff</option>
                  <option value="blocker" ${activeTab === 'blocker' ? 'selected' : ''}>Blocker (Blocks)</option>
                </select>
              </div>
              <div class="form-group">
                <label for="item-severity" class="form-label">Severity Level</label>
                <select class="form-control" id="item-severity">
                  <option value="Low">Low</option>
                  <option value="Medium" selected>Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
              <div class="form-group">
                <label for="item-owner" class="form-label">Owner / Assignee</label>
                <input type="text" class="form-control" id="item-owner" placeholder="e.g., Marcus A." required>
                <div class="invalid-feedback">Please assign an owner.</div>
              </div>
              <div class="form-group" id="target-workspace-group" style="display: none;">
                <label for="item-target-workspace" class="form-label">Target Organization</label>
                <select class="form-control" id="item-target-workspace">
                  <option value="">None / General</option>
                  <option value="uiux">UI/UX Design</option>
                  <option value="engineering">Engineering</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="marketing">Marketing</option>
                  <option value="finance">Finance Ledger</option>
                  <option value="legalhr">Legal & HR</option>
                </select>
              </div>
            </div>
            <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
              <label for="item-details" class="form-label">Details / Diagnostic Logs</label>
              <textarea class="form-control" id="item-details" placeholder="e.g., Figma variables parsed successfully, awaiting core framework compilation and layout validation steps..." required></textarea>
              <div class="invalid-feedback">Please enter details or action plans.</div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="modal-cancel-${workspaceName}">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Item</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalDiv);

    // Close modal function
    const closeModal = () => {
      modalDiv.classList.remove('active');
      const form = modalDiv.querySelector(`#form-add-${workspaceName}`);
      if (form) {
        form.reset();
        form.querySelectorAll('.form-control').forEach(el => el.classList.remove('is-invalid'));
      }
    };

    // Close modal triggers
    const closeBtn = modalDiv.querySelector(`#modal-close-${workspaceName}`);
    const cancelBtn = modalDiv.querySelector(`#modal-cancel-${workspaceName}`);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    modalDiv.addEventListener('click', (e) => {
      if (e.target === modalDiv) {
        closeModal();
      }
    });

    // Conditional Target Workspace toggle based on selected type
    const typeSelector = modalDiv.querySelector('#item-type');
    const targetGroup = modalDiv.querySelector('#target-workspace-group');
    if (typeSelector && targetGroup) {
      typeSelector.addEventListener('change', (e) => {
        if (e.target.value === 'handoff' || e.target.value === 'blocker') {
          targetGroup.style.display = 'flex';
        } else {
          targetGroup.style.display = 'none';
        }
      });
    }

    // Handle modal submit
    const form = modalDiv.querySelector(`#form-add-${workspaceName}`);
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();

        const titleInput = form.querySelector('#item-title');
        const typeInput = form.querySelector('#item-type');
        const severityInput = form.querySelector('#item-severity');
        const ownerInput = form.querySelector('#item-owner');
        const targetInput = form.querySelector('#item-target-workspace');
        const detailsInput = form.querySelector('#item-details');

        let isValid = true;

        if (!titleInput.value.trim()) {
          titleInput.classList.add('is-invalid');
          isValid = false;
        } else {
          titleInput.classList.remove('is-invalid');
        }

        if (!ownerInput.value.trim()) {
          ownerInput.classList.add('is-invalid');
          isValid = false;
        } else {
          ownerInput.classList.remove('is-invalid');
        }

        if (!detailsInput.value.trim()) {
          detailsInput.classList.add('is-invalid');
          isValid = false;
        } else {
          detailsInput.classList.remove('is-invalid');
        }

        if (isValid) {
          store.addWorkspaceItem({
            title: titleInput.value.trim(),
            type: typeInput.value,
            severity: severityInput.value,
            workspace: workspaceName,
            owner: ownerInput.value.trim(),
            targetWorkspace: (typeInput.value === 'handoff' || typeInput.value === 'blocker') ? (targetInput.value || null) : null,
            details: detailsInput.value.trim()
          });

          window.__workspaceBoardTabs[tabKey] = typeInput.value;

          closeModal();
        }
      });

      form.querySelectorAll('.form-control').forEach(input => {
        input.addEventListener('input', () => {
          if (input.value.trim()) {
            input.classList.remove('is-invalid');
          }
        });
      });
    }
  }

  // Show modal button (runs every render since button is recreated)
  const addBtn = boardWrapper.querySelector('#btn-add-board-item');
  addBtn.addEventListener('click', () => {
    modalDiv.classList.add('active');

    const typeSelect = modalDiv.querySelector('#item-type');
    const targetGroup = modalDiv.querySelector('#target-workspace-group');
    if (typeSelect && targetGroup) {
      targetGroup.style.display = (typeSelect.value === 'handoff' || typeSelect.value === 'blocker') ? 'flex' : 'none';
    }

    setTimeout(() => {
      const titleInput = modalDiv.querySelector('#item-title');
      if (titleInput) titleInput.focus();
    }, 100);
  });
}
