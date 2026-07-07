import { store } from '../state.js';

export function render(container) {
  const state = store.state;

  // Compute metrics for the active user Sarah Jenkins
  // Sarah is VP of Product & Architecture (legalhr/finance/executive)
  const username = state.user.name;
  const userItems = state.workspaceItems.filter(i => 
    i.owner === username || 
    (i.owner && i.owner.includes('Sarah')) ||
    (i.owner && i.owner.toLowerCase().includes('finance'))
  );
  
  const taskCount = userItems.filter(i => i.type === 'task').length;
  const activeBlockersCount = userItems.filter(i => i.type === 'blocker' && i.status === 'Blocked').length;
  const completedTaskCount = userItems.filter(i => i.type === 'task' && i.status === 'Completed').length;

  // Selection of premium avatar gradient schemes
  const colorOptions = [
    { name: 'Indigo Ingress', value: 'linear-gradient(135deg, var(--color-primary), var(--color-info))' },
    { name: 'Emerald Edge', value: 'linear-gradient(135deg, var(--color-success), var(--color-info))' },
    { name: 'Amber Core', value: 'linear-gradient(135deg, var(--color-warning), var(--color-primary))' },
    { name: 'Sunset Alert', value: 'linear-gradient(135deg, var(--color-danger), var(--color-warning))' }
  ];

  // Local copy of currently selected color
  let activeAvatarColor = state.user.avatarColor || colorOptions[0].value;

  // Construct UI HTML template
  container.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto;">
      
      <!-- Top Success Notification (initially hidden) -->
      <div id="profile-success-alert" style="display: none; align-items: center; gap: 0.75rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); padding: 1rem 1.25rem; border-radius: 0.5rem; margin-bottom: 1.5rem; transition: all 0.3s ease;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <div class="flex-col">
          <span style="font-size: 0.875rem; font-weight: 600; color: var(--text-on-surface);">Profile Updated Successfully</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem;">Changes have been propagated to all core telemetry views and sidebar.</span>
        </div>
      </div>

      <!-- Main Layout Columns -->
      <div class="grid grid-cols-3" style="grid-template-columns: 2fr 1fr; align-items: start;">
        
        <!-- Left Column: Edit Form Card -->
        <div class="card" style="padding: 1.5rem; gap: 1.5rem;">
          <div class="card-title" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.75rem;">
            <span>Edit Profile Settings</span>
            <span class="badge badge-info" style="font-size: 0.65rem;">System Identity</span>
          </div>

          <form id="profile-edit-form" class="flex-col" style="gap: 1.25rem; margin-top: 0.5rem;">
            <div class="grid grid-cols-2" style="gap: 1rem;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="profile-edit-name" class="form-label">Full Name</label>
                <input type="text" id="profile-edit-name" class="form-control" value="${state.user.name}" required>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="profile-edit-role" class="form-label">Job Title / Role</label>
                <input type="text" id="profile-edit-role" class="form-control" value="${state.user.role}" required>
              </div>
            </div>

            <div class="grid grid-cols-2" style="gap: 1rem;">
              <div class="form-group" style="margin-bottom: 0;">
                <label for="profile-edit-email" class="form-label">Corporate Email</label>
                <input type="email" id="profile-edit-email" class="form-control" value="${state.user.email || ''}" required>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label for="profile-edit-dept" class="form-label">Department Node</label>
                <input type="text" id="profile-edit-dept" class="form-control" value="${state.user.department || ''}" required>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label for="profile-edit-bio" class="form-label">Professional Biography</label>
              <textarea id="profile-edit-bio" class="form-control" placeholder="Write a short summary about your role, operations focus, or responsibilities..." style="min-height: 100px;">${state.user.bio || ''}</textarea>
            </div>

            <!-- Avatar Gradient Theme Picker -->
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Avatar Identity Theme</label>
              <div class="flex" style="gap: 0.75rem; margin-top: 0.25rem; flex-wrap: wrap;">
                ${colorOptions.map(option => {
                  const isChecked = activeAvatarColor === option.value;
                  return `
                    <div class="avatar-theme-option" data-color="${option.value}" style="cursor: pointer; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: ${isChecked ? 'var(--color-primary-glow)' : 'rgba(255,255,255,0.02)'}; border: 1.5px solid ${isChecked ? 'var(--color-primary)' : 'var(--border-outline-variant-60)'}; border-radius: 6px; transition: all 0.2s ease;">
                      <div style="width: 1rem; height: 1rem; border-radius: 9999px; background: ${option.value}; border: 1px solid rgba(255,255,255,0.2);"></div>
                      <span style="font-size: 0.75rem; font-weight: 500; color: ${isChecked ? 'var(--text-on-surface)' : 'var(--text-muted)'};">${option.name}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Form Actions -->
            <div class="flex" style="justify-content: flex-end; gap: 0.75rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1.25rem; margin-top: 0.5rem;">
              <button type="button" id="profile-reset-btn" class="btn btn-secondary">Discard Changes</button>
              <button type="submit" class="btn btn-primary" style="gap: 0.5rem;">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                Save Profile Changes
              </button>
            </div>
          </form>
        </div>

        <!-- Right Column: Card Preview & Quick Stats -->
        <div class="flex-col" style="gap: 1.5rem;">
          
          <!-- Live Preview Card -->
          <div class="card" style="padding: 2rem 1.5rem; text-align: center; align-items: center; justify-content: center;">
            <div id="profile-preview-avatar" style="width: 5.5rem; height: 5.5rem; border-radius: 9999px; background: ${activeAvatarColor}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 2.25rem; color: #fff; border: 2px solid var(--border-outline-variant); filter: drop-shadow(0 0 16px rgba(99, 102, 241, 0.25)); transition: background 0.3s ease;">
              ${state.user.avatarText}
            </div>
            
            <h2 id="profile-preview-name" style="font-size: 1.125rem; font-weight: 700; margin-top: 1rem; color: var(--text-on-surface);">${state.user.name}</h2>
            <p id="profile-preview-role" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">${state.user.role}</p>

            <div style="display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: center;">
              <span class="badge badge-primary" style="font-size: 0.65rem;">System Admin</span>
              <span class="badge badge-success" style="font-size: 0.65rem;">Active Session</span>
            </div>

            <!-- Profile Info Metadata List -->
            <div class="flex-col" style="width: 100%; text-align: left; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.05); gap: 0.75rem;">
              <div class="flex-col">
                <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Corporate Node</span>
                <span id="profile-preview-dept" style="font-size: 0.8rem; font-weight: 500; color: var(--text-on-surface); margin-top: 0.125rem;">${state.user.department || 'Not Set'}</span>
              </div>
              <div class="flex-col">
                <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Security Token Email</span>
                <span id="profile-preview-email" style="font-size: 0.8rem; font-weight: 500; color: var(--text-on-surface); margin-top: 0.125rem; word-break: break-all;">${state.user.email || 'Not Set'}</span>
              </div>
            </div>
          </div>

          <!-- Quick Statistics Summary -->
          <div class="card" style="padding: 1.25rem;">
            <div class="card-title">
              <span>Operational Access Stats</span>
            </div>
            <p style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 1rem;">
              Real-time summary of compliance tasks and issues currently mapped to your operational ownership.
            </p>

            <div class="grid grid-cols-3" style="gap: 0.5rem; text-align: center;">
              <div style="background: rgba(255,255,255,0.02); padding: 0.75rem 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                <div class="font-mono text-primary" style="font-size: 1.25rem; font-weight: 700;">${taskCount}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem;">Total Tasks</div>
              </div>
              <div style="background: rgba(255,255,255,0.02); padding: 0.75rem 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                <div class="font-mono text-danger" style="font-size: 1.25rem; font-weight: 700;">${activeBlockersCount}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem;">Blockers</div>
              </div>
              <div style="background: rgba(255,255,255,0.02); padding: 0.75rem 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
                <div class="font-mono text-success" style="font-size: 1.25rem; font-weight: 700;">${completedTaskCount}</div>
                <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem;">Completed</div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  `;

  // --- EVENT HANDLERS ---

  const form = container.querySelector('#profile-edit-form');
  const alertEl = container.querySelector('#profile-success-alert');

  // Input elements
  const nameInput = container.querySelector('#profile-edit-name');
  const roleInput = container.querySelector('#profile-edit-role');
  const emailInput = container.querySelector('#profile-edit-email');
  const deptInput = container.querySelector('#profile-edit-dept');
  const bioInput = container.querySelector('#profile-edit-bio');

  // Previews
  const previewName = container.querySelector('#profile-preview-name');
  const previewRole = container.querySelector('#profile-preview-role');
  const previewEmail = container.querySelector('#profile-preview-email');
  const previewDept = container.querySelector('#profile-preview-dept');
  const previewAvatar = container.querySelector('#profile-preview-avatar');

  // Theme option clicks
  const themeOptions = container.querySelectorAll('.avatar-theme-option');
  themeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      // Clear checking active outline from others
      themeOptions.forEach(o => {
        o.style.background = 'rgba(255,255,255,0.02)';
        o.style.borderColor = 'var(--border-outline-variant-60)';
        o.querySelector('span').style.color = 'var(--text-muted)';
      });

      // Style active one
      opt.style.background = 'var(--color-primary-glow)';
      opt.style.borderColor = 'var(--color-primary)';
      opt.querySelector('span').style.color = 'var(--text-on-surface)';

      // Update local gradient selection
      activeAvatarColor = opt.getAttribute('data-color');
      
      // Update avatar color live in preview card
      if (previewAvatar) {
        previewAvatar.style.background = activeAvatarColor;
      }
    });
  });

  // Handle Form Submit (Save Changes)
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Perform store update
      store.updateUserProfile({
        name: nameInput.value,
        role: roleInput.value,
        email: emailInput.value,
        department: deptInput.value,
        bio: bioInput.value,
        avatarColor: activeAvatarColor
      });

      // Update previews in real-time
      if (previewName) previewName.textContent = nameInput.value;
      if (previewRole) previewRole.textContent = roleInput.value;
      if (previewEmail) previewEmail.textContent = emailInput.value;
      if (previewDept) previewDept.textContent = deptInput.value;
      if (previewAvatar) {
        previewAvatar.textContent = store.state.user.avatarText;
        previewAvatar.style.background = activeAvatarColor;
      }

      // Show success alert
      if (alertEl) {
        alertEl.style.display = 'flex';
        // Auto scroll to top of viewport to see notification
        container.closest('.content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Auto-dismiss alert after 4 seconds
        setTimeout(() => {
          alertEl.style.opacity = '0';
          setTimeout(() => {
            alertEl.style.display = 'none';
            alertEl.style.opacity = '1';
          }, 300);
        }, 4000);
      }
    });
  }

  // Handle Form Reset / Discard changes
  const resetBtn = container.querySelector('#profile-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Re-render view from current state (essentially discarding user inputs)
      render(container);
    });
  }
}
