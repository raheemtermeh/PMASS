import { store } from '../state.js';

export function render(container) {
  const state = store.state;
  const currentSettings = state.settings || {
    notificationAlerts: true,
    simulationSpeed: 'normal',
    complianceThreshold: 75,
    compactMode: false
  };

  container.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto;">
      
      <!-- Top Success Alert (dismissable, triggered when actions occur) -->
      <div id="settings-success-alert" style="display: none; align-items: center; gap: 0.75rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 1rem 1.25rem; border-radius: 0.5rem; margin-bottom: 1.5rem; transition: all 0.3s ease;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div class="flex-col">
          <span style="font-size: 0.875rem; font-weight: 600; color: var(--text-on-surface);" id="alert-title">Settings Synced</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem;" id="alert-desc">Dashboard preferences updated in real-time.</span>
        </div>
      </div>

      <!-- Settings Dual Column Grid -->
      <div class="grid grid-cols-3" style="grid-template-columns: 2fr 1fr; align-items: start;">
        
        <!-- Left Column: Preference Panels -->
        <div class="flex-col" style="gap: 1.5rem;">
          
          <!-- General Dashboard UI Settings -->
          <div class="card" style="padding: 1.5rem; gap: 1.25rem;">
            <div class="card-title" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.75rem; margin-bottom: 0.5rem;">
              <span>Interface Preferences</span>
              <span class="badge badge-primary" style="font-size: 0.65rem;">UI Customization</span>
            </div>

            <!-- Compact View Toggle -->
            <div class="flex" style="justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.02);">
              <div class="flex-col" style="gap: 0.25rem;">
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-on-surface);">Dense Compact Mode</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Reduces paddings and margins for telemetry-heavy screens.</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="setting-compact-mode" ${currentSettings.compactMode ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>

            <!-- Sidebar Collapse Toggle -->
            <div class="flex" style="justify-content: space-between; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.02);">
              <div class="flex-col" style="gap: 0.25rem;">
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-on-surface);">Collapse Navigation Sidebar</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Minimizes left sidebar size to maximize active telemetry workspace.</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="setting-sidebar-collapse" ${currentSettings.sidebarCollapsed ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>

            <!-- Top bar Blocker Alert Toggle -->
            <div class="flex" style="justify-content: space-between; align-items: center; padding-bottom: 0.5rem;">
              <div class="flex-col" style="gap: 0.25rem;">
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-on-surface);">Active Blocker Alerts</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Displays the blinking Rose Blocker Count widget in the top header bar.</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="setting-blocker-alerts" ${currentSettings.notificationAlerts !== false ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>

          </div>

          <!-- Telemetry & Simulation Calibration -->
          <div class="card" style="padding: 1.5rem; gap: 1.25rem;">
            <div class="card-title" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.75rem; margin-bottom: 0.5rem;">
              <span>Telemetry Calibration & Feeds</span>
              <span class="badge badge-warning" style="font-size: 0.65rem;">Simulation Rate</span>
            </div>

            <!-- Telemetry Update rate select -->
            <div class="form-group">
              <label for="setting-sim-speed" class="form-label">Background Simulation Speed</label>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                Adjust the tick rate for background hardware cluster calculations (RAM/CPU/Docker metrics).
              </p>
              <select id="setting-sim-speed" class="form-control" style="background: rgba(0,0,0,0.2); cursor: pointer;">
                <option value="fast" ${currentSettings.simulationSpeed === 'fast' ? 'selected' : ''}>Fast Ingress (1s Interval)</option>
                <option value="normal" ${currentSettings.simulationSpeed === 'normal' || !currentSettings.simulationSpeed ? 'selected' : ''}>Standard Buffer (4s Interval)</option>
                <option value="slow" ${currentSettings.simulationSpeed === 'slow' ? 'selected' : ''}>Coarse Throttle (8s Interval)</option>
                <option value="paused" ${currentSettings.simulationSpeed === 'paused' ? 'selected' : ''}>Suspended (Simulation Paused)</option>
              </select>
            </div>

            <!-- Compliance Alert Threshold Slider -->
            <div class="form-group" style="margin-top: 0.5rem; margin-bottom: 0;">
              <div class="flex" style="justify-content: space-between; align-items: center;">
                <label for="setting-compliance-slider" class="form-label">Compliance Warning Index Threshold</label>
                <span id="compliance-slider-val" class="font-mono text-warning" style="font-size: 0.85rem; font-weight: 700;">${currentSettings.complianceThreshold}%</span>
              </div>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                Scores below this threshold trigger an warning alert badge on the executive telemetry panel.
              </p>
              <div class="flex" style="align-items: center; gap: 1rem;">
                <span style="font-size: 0.7rem; color: var(--text-dim);" class="font-mono">50%</span>
                <input type="range" id="setting-compliance-slider" min="50" max="100" step="5" value="${currentSettings.complianceThreshold}" style="flex: 1; accent-color: var(--color-primary); cursor: pointer;">
                <span style="font-size: 0.7rem; color: var(--text-dim);" class="font-mono">100%</span>
              </div>
            </div>

          </div>

          <!-- Application & API Credentials Card -->
          <div class="card" style="padding: 1.5rem; gap: 1.25rem;">
            <div class="card-title" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div class="flex" style="gap: 0.5rem; align-items: center;">
                <span>Application & API Credentials</span>
                <span class="badge badge-success" style="font-size: 0.65rem;">Active Keys</span>
              </div>
              <button id="btn-toggle-cred-form" class="btn btn-primary" style="font-size: 0.7rem; padding: 0.35rem 0.75rem;">
                + Add Key
              </button>
            </div>

            <!-- Inline Credential Form (Hidden by default, expands nicely) -->
            <div id="cred-form-container" style="display: none; background: rgba(0,0,0,0.15); border: 1px solid var(--border-outline-variant-60); border-radius: 0.5rem; padding: 1.25rem; gap: 1rem; flex-direction: column; width: 100%;">
              <h4 id="cred-form-title" style="font-size: 0.8rem; font-weight: 700; color: var(--color-primary);">Add New Service Key</h4>
              <form id="credential-form" style="display: flex; flex-direction: column; gap: 1rem; width: 100%;">
                <div class="grid grid-cols-2" style="gap: 1rem; grid-template-columns: 1fr 1fr;">
                  <div class="form-group" style="margin-bottom: 0;">
                    <label for="cred-name" class="form-label">Key Name</label>
                    <input type="text" id="cred-name" class="form-control font-mono" placeholder="e.g. FIGMA_API_TOKEN" required style="font-size: 0.8rem; background: rgba(0,0,0,0.2);">
                  </div>
                  <div class="form-group" style="margin-bottom: 0;">
                    <label for="cred-value" class="form-label">Secret Value</label>
                    <div style="position: relative; display: flex; align-items: center;">
                      <input type="password" id="cred-value" class="form-control font-mono" placeholder="••••••••" required style="font-size: 0.8rem; padding-right: 2.25rem; width: 100%; background: rgba(0,0,0,0.2);">
                      <button type="button" id="btn-toggle-value-visibility" style="position: absolute; right: 0.5rem; background: none; border: none; color: var(--text-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label for="cred-description" class="form-label">Description</label>
                  <input type="text" id="cred-description" class="form-control" placeholder="Brief details about where this key is used..." style="font-size: 0.8rem; background: rgba(0,0,0,0.2);">
                </div>
                <div class="flex" style="justify-content: flex-end; gap: 0.5rem; margin-top: 0.25rem;">
                  <button type="button" id="btn-cancel-cred" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;">Cancel</button>
                  <button type="submit" class="btn btn-primary" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;">Save Credential</button>
                </div>
              </form>
            </div>

            <!-- Credentials List Container -->
            <div id="credentials-list-wrapper" class="flex-col" style="gap: 0.75rem; width: 100%;">
              ${state.credentials && state.credentials.length > 0 ? `
                <div class="table-responsive" style="overflow-x: auto;">
                  <table class="enterprise-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                      <tr>
                        <th style="padding: 0.5rem 0.75rem;">Key Name</th>
                        <th style="padding: 0.5rem 0.75rem;">Description</th>
                        <th style="padding: 0.5rem 0.75rem;">Last Updated</th>
                        <th style="padding: 0.5rem 0.75rem; text-align: right;">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${state.credentials.map(cred => {
                        const dateStr = cred.updated_at ? new Date(cred.updated_at).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : 'N/A';
                        return `
                          <tr class="hover-row">
                            <td style="padding: 0.75rem 0.75rem;" class="font-mono text-primary font-bold">${cred.name}</td>
                            <td style="padding: 0.75rem 0.75rem; color: var(--text-muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cred.description || ''}">${cred.description || '<span style="font-style: italic; color: var(--text-dim);">No description</span>'}</td>
                            <td style="padding: 0.75rem 0.75rem; color: var(--text-dim);" class="font-mono">${dateStr}</td>
                            <td style="padding: 0.75rem 0.75rem; text-align: right;">
                              <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                <button class="btn btn-secondary btn-edit-cred" data-id="${cred.id}" data-name="${cred.name}" data-desc="${cred.description || ''}" style="font-size: 0.65rem; padding: 0.25rem 0.5rem;">
                                  Edit
                                </button>
                                <button class="btn btn-secondary btn-delete-cred" data-id="${cred.id}" data-name="${cred.name}" style="font-size: 0.65rem; padding: 0.25rem 0.5rem; border-color: rgba(244,63,94,0.2); color: var(--color-danger);">
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `
                <div style="text-align: center; padding: 1.5rem; border: 1px dashed rgba(255,255,255,0.05); border-radius: 0.5rem; background: rgba(0,0,0,0.1);">
                  <p style="font-size: 0.75rem; color: var(--text-dim);">No custom api keys or credentials added yet.</p>
                </div>
              `}
            </div>
          </div>

          <!-- System Restoration Controls -->
          <div class="card" style="padding: 1.5rem; gap: 1rem;">
            <div class="card-title">
              <span>System Management</span>
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted);">
              Destructive administrative options to restore state buffers or reset application properties back to default values.
            </p>

            <div class="flex" style="gap: 0.75rem; flex-wrap: wrap; margin-top: 0.5rem;">
              <button id="btn-reset-blockers" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.5rem 0.875rem;">
                Restore Blockers State
              </button>
              <button id="btn-factory-reset" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.5rem 0.875rem; border-color: rgba(244, 63, 94, 0.25); color: var(--color-danger);">
                Restore Factory Settings
              </button>
            </div>
          </div>

        </div>

        <!-- Right Column: System Spec Documentation -->
        <div class="flex-col" style="gap: 1.5rem;">
          
          <!-- System Information Specs -->
          <div class="card flex flex-col" style="padding: 1.25rem; gap: 1rem;">
            <div class="card-title">
              <span>Control Node Specs</span>
            </div>
            
            <div class="flex-col" style="gap: 0.75rem;">
              <div class="flex-col" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem;">
                <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Host Platform</span>
                <span style="font-size: 0.8rem; font-weight: 500; font-family: var(--font-mono); margin-top: 0.125rem;">PMAS_SHELL v1.4.2-Prod</span>
              </div>
              <div class="flex-col" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem;">
                <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Active Workspace Store</span>
                <span style="font-size: 0.8rem; font-weight: 500; color: var(--color-primary); font-family: var(--font-mono); margin-top: 0.125rem;">StateManager_LocalPubSub</span>
              </div>
              <div class="flex-col" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem;">
                <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Active Sub-views</span>
                <span style="font-size: 0.8rem; font-weight: 500; margin-top: 0.125rem;">9 modules loaded</span>
              </div>
              <div class="flex-col">
                <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Security Session ID</span>
                <span style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--text-muted); margin-top: 0.125rem; word-break: break-all;">95266c12-705c-4780-bfa2-2f460b70df98</span>
              </div>
            </div>
          </div>

          <!-- Documentation Help widget -->
          <div class="card" style="padding: 1.25rem; background: rgba(99, 102, 241, 0.02); border: 1px solid var(--border-outline-variant-60);">
            <h4 style="font-size: 0.8rem; font-weight: 700; color: var(--color-primary); margin-bottom: 0.5rem;">Operation Tip</h4>
            <p style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.45;">
              Preferences configured in this panel are saved in memory state variables. Changing settings instantly modifies local telemetry listeners. Factory resets wipe these registers to initial parameters.
            </p>
          </div>

        </div>

      </div>
    </div>
  `;

  // --- REACTIVE INPUT HANDLERS ---

  const alertEl = container.querySelector('#settings-success-alert');
  const alertTitle = container.querySelector('#alert-title');
  const alertDesc = container.querySelector('#alert-desc');

  // Trigger alert display
  function triggerNotification(title, desc) {
    if (alertEl) {
      alertTitle.textContent = title;
      alertDesc.textContent = desc;
      alertEl.style.display = 'flex';
      
      // dismiss after 3s
      if (window.__settingsAlertTimeout) clearTimeout(window.__settingsAlertTimeout);
      window.__settingsAlertTimeout = setTimeout(() => {
        alertEl.style.opacity = '0';
        setTimeout(() => {
          alertEl.style.display = 'none';
          alertEl.style.opacity = '1';
        }, 300);
      }, 3000);
    }
  }

  // Toggle switch - Compact Mode
  const compactToggle = container.querySelector('#setting-compact-mode');
  if (compactToggle) {
    compactToggle.addEventListener('change', (e) => {
      const active = e.target.checked;
      store.updateSettings({ compactMode: active });
      triggerNotification(
        'Compact Layout Updated',
        active ? 'Dense layout activated.' : 'Standard layouts restored.'
      );
    });
  }

  // Toggle switch - Sidebar Collapse
  const sidebarCollapseToggle = container.querySelector('#setting-sidebar-collapse');
  if (sidebarCollapseToggle) {
    sidebarCollapseToggle.addEventListener('change', (e) => {
      const active = e.target.checked;
      store.updateSettings({ sidebarCollapsed: active });
      triggerNotification(
        'Sidebar Toggle Synced',
        active ? 'Sidebar navigation collapsed.' : 'Sidebar navigation expanded.'
      );
    });
  }

  // Toggle switch - Blocker Alerts
  const alertsToggle = container.querySelector('#setting-blocker-alerts');
  if (alertsToggle) {
    alertsToggle.addEventListener('change', (e) => {
      const active = e.target.checked;
      store.updateSettings({ notificationAlerts: active });
      triggerNotification(
        'Blocker Alerts Toggled',
        active ? 'Blocker indicators are now visible in the header.' : 'Header blocker warning hidden.'
      );
    });
  }

  // Select input - Simulation speed
  const simSpeedSelect = container.querySelector('#setting-sim-speed');
  if (simSpeedSelect) {
    simSpeedSelect.addEventListener('change', (e) => {
      const speed = e.target.value;
      store.updateSettings({ simulationSpeed: speed });
      let text = 'Simulation running at standard buffer speed.';
      if (speed === 'fast') text = 'Simulation speed cranked up to 1-second ticks.';
      if (speed === 'slow') text = 'Simulation speed throttled to 8-second ticks.';
      if (speed === 'paused') text = 'Telemetry simulations paused.';

      triggerNotification('Simulation Speed Synced', text);
    });
  }

  // Range Slider - Compliance Alert Threshold
  const complianceSlider = container.querySelector('#setting-compliance-slider');
  const complianceValEl = container.querySelector('#compliance-slider-val');
  if (complianceSlider) {
    complianceSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      if (complianceValEl) complianceValEl.textContent = `${val}%`;
    });

    complianceSlider.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      store.updateSettings({ complianceThreshold: val });
      triggerNotification(
        'Compliance Warning Threshold Configured',
        `Warning indicator triggers for metrics under ${val}%.`
      );
    });
  }

  // Button Action - Restore Blockers
  const resetBlockersBtn = container.querySelector('#btn-reset-blockers');
  if (resetBlockersBtn) {
    resetBlockersBtn.addEventListener('click', () => {
      store.resetBlockers();
      triggerNotification(
        'Blockers State Re-established',
        'All resolved/completed blockers have been reset back to Blocked.'
      );
    });
  }

  // Button Action - Factory Reset
  const factoryResetBtn = container.querySelector('#btn-factory-reset');
  if (factoryResetBtn) {
    factoryResetBtn.addEventListener('click', () => {
      store.resetSettings();
      // Re-render settings screen completely to sync input states
      render(container);
      triggerNotification(
        'Factory Reset Executed',
        'All system configurations reverted to dashboard defaults.'
      );
    });
  }

  // --- CREDENTIALS FORM HANDLERS ---
  const btnToggleForm = container.querySelector('#btn-toggle-cred-form');
  const credFormContainer = container.querySelector('#cred-form-container');
  const credFormTitle = container.querySelector('#cred-form-title');
  const credForm = container.querySelector('#credential-form');
  const inputName = container.querySelector('#cred-name');
  const inputValue = container.querySelector('#cred-value');
  const inputDesc = container.querySelector('#cred-description');
  const btnCancelCred = container.querySelector('#btn-cancel-cred');
  const btnToggleVisibility = container.querySelector('#btn-toggle-value-visibility');

  if (btnToggleForm && credFormContainer) {
    btnToggleForm.addEventListener('click', () => {
      // Clear inputs for clean form
      if (inputName) {
        inputName.value = '';
        inputName.disabled = false;
      }
      if (inputValue) {
        inputValue.value = '';
        inputValue.placeholder = 'e.g. ghp_secretkey12345';
        inputValue.required = true;
        inputValue.type = 'password';
      }
      if (inputDesc) {
        inputDesc.value = '';
      }
      if (credFormTitle) {
        credFormTitle.textContent = 'Add New Service Key';
      }
      
      const isHidden = credFormContainer.style.display === 'none';
      credFormContainer.style.display = isHidden ? 'flex' : 'none';
    });
  }

  if (btnToggleVisibility && inputValue) {
    btnToggleVisibility.addEventListener('click', () => {
      const isPassword = inputValue.type === 'password';
      inputValue.type = isPassword ? 'text' : 'password';
      btnToggleVisibility.innerHTML = isPassword ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye-off"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
      ` : `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-eye"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      `;
    });
  }

  if (btnCancelCred && credFormContainer) {
    btnCancelCred.addEventListener('click', () => {
      credFormContainer.style.display = 'none';
    });
  }

  if (credForm) {
    credForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = inputName.value.trim();
      const value = inputValue.value;
      const description = inputDesc.value.trim();

      if (!name) return;

      try {
        await store.saveCredential({ name, value, description });
        render(container);
        triggerNotification('Credential Saved', `Credential "${name}" has been configured successfully.`);
      } catch (err) {
        triggerNotification('Failed to Save', err.message || 'Check connection to backend api.');
      }
    });
  }

  // Edit action
  container.querySelectorAll('.btn-edit-cred').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      const desc = btn.getAttribute('data-desc');

      if (inputName) {
        inputName.value = name;
        inputName.disabled = true; // Key name is immutable on edit
      }
      if (inputValue) {
        inputValue.value = '••••••••';
        inputValue.placeholder = '••••••••';
        inputValue.required = false; // Optional on edit if they keep the masked default
      }
      if (inputDesc) {
        inputDesc.value = desc;
      }
      if (credFormTitle) {
        credFormTitle.textContent = 'Edit Service Key';
      }
      if (credFormContainer) {
        credFormContainer.style.display = 'flex';
        credFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });

  // Delete action
  container.querySelectorAll('.btn-delete-cred').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');

      if (confirm(`Are you sure you want to permanently delete credential "${name}"?`)) {
        try {
          await store.deleteCredential(id);
          render(container);
          triggerNotification('Credential Deleted', `Credential "${name}" was removed successfully.`);
        } catch (err) {
          triggerNotification('Delete Failed', err.message || 'Check connection to backend api.');
        }
      }
    });
  });
}
