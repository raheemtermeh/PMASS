import { store } from '../state.js';
import { renderWorkspaceBoard } from '../components/workspaceBoard.js';

function syntaxHighlightJson(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
    let cls = 'number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'key';
      } else {
        cls = 'string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'boolean';
    } else if (/null/.test(match)) {
      cls = 'null';
    }
    let style = '';
    if (cls === 'key') style = 'color: #818cf8; font-weight: 600;'; // Light indigo for keys
    else if (cls === 'string') style = 'color: #34d399;'; // Emerald for strings
    else if (cls === 'number') style = 'color: #fbbf24;'; // Amber for numbers
    else if (cls === 'boolean') style = 'color: #f87171;'; // Red/coral for booleans
    else if (cls === 'null') style = 'color: #a78bfa;'; // Purple for nulls
    return '<span style="' + style + '">' + match + '</span>';
  });
}

function renderMockupContent(page, device) {
  if (page === 'PMAS Enterprise Shell v1.4') {
    if (device === 'desktop') {
      return `
        <!-- Desktop: Sidebar + Workspace Grid -->
        <div style="flex:1; display:flex; overflow:hidden;">
          <!-- Sidebar -->
          <div style="width: 2.5rem; background: #05060b; border-right: 1px solid rgba(255,255,255,0.05); padding: 8px; display:flex; flex-direction:column; gap: 8px;">
            <div style="width: 100%; height: 10px; background: var(--color-primary); opacity: 0.8; border-radius: 2px;"></div>
            <div style="width: 80%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 2px;"></div>
            <div style="width: 90%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 2px;"></div>
          </div>
          <!-- Main Canvas -->
          <div style="flex:1; background: #0a0b10; padding: 12px; display:flex; flex-direction:column; gap: 8px; overflow:hidden;">
            <div style="height: 12px; width: 60%; background: var(--color-primary); border-radius: 3px;"></div>
            <div style="display:flex; gap: 8px; flex-grow:1;">
              <div style="flex:2; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 4px; padding: 8px; display:flex; flex-direction:column; gap: 4px;">
                <div style="height: 6px; width: 80%; background: rgba(255,255,255,0.1);"></div>
                <div style="height: 6px; width: 90%; background: rgba(255,255,255,0.05);"></div>
                <div style="height: 6px; width: 50%; background: rgba(255,255,255,0.05);"></div>
              </div>
              <div style="flex:1; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 4px; display:flex; align-items:center; justify-content:center;">
                <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--color-info); display:flex; align-items:center; justify-content:center; color: var(--color-info); font-size: 0.5rem; font-family: var(--font-mono);">74%</div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (device === 'tablet') {
      return `
        <!-- Tablet: Small Sidebar + Top Layout -->
        <div style="flex:1; display:flex; overflow:hidden;">
          <div style="width: 1.5rem; background: #05060b; border-right: 1px solid rgba(255,255,255,0.05); padding: 4px; display:flex; flex-direction:column; gap: 6px;">
            <div style="width: 100%; height: 8px; background: var(--color-primary); border-radius: 2px;"></div>
            <div style="width: 80%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 2px;"></div>
          </div>
          <div style="flex:1; background: #0a0b10; padding: 10px; display:flex; flex-direction:column; gap: 6px; overflow:hidden;">
            <div style="height: 10px; width: 40%; background: var(--color-primary); border-radius: 2px;"></div>
            <div style="flex:1; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; display:flex; flex-direction:column; gap: 4px;">
              <div style="height: 5px; width: 90%; background: rgba(255,255,255,0.1);"></div>
              <div style="height: 5px; width: 60%; background: rgba(255,255,255,0.05);"></div>
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <!-- Mobile: Stacked view, no sidebar -->
        <div style="flex:1; background: #0a0b10; padding: 10px; display:flex; flex-direction:column; gap: 8px; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="width: 12px; height: 8px; display:flex; flex-direction:column; justify-content:space-between;">
              <div style="height:1.5px; background:rgba(255,255,255,0.8);"></div>
              <div style="height:1.5px; background:rgba(255,255,255,0.8);"></div>
              <div style="height:1.5px; background:rgba(255,255,255,0.8);"></div>
            </div>
            <div style="height: 8px; width: 30px; background: var(--color-primary); border-radius: 1px;"></div>
          </div>
          <div style="flex:1; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; display:flex; flex-direction:column; gap: 4px;">
            <div style="height: 5px; width: 100%; background: rgba(255,255,255,0.1);"></div>
            <div style="height: 5px; width: 85%; background: rgba(255,255,255,0.05);"></div>
          </div>
        </div>
      `;
    }
  } else if (page === 'User Authentication Flow') {
    if (device === 'desktop') {
      return `
        <!-- Desktop: Dual-column Login Split -->
        <div style="flex:1; display:flex; overflow:hidden;">
          <div style="flex:1.2; background: linear-gradient(135deg, #1e1b4b, #311042); padding: 20px; display:flex; flex-direction:column; justify-content:center; gap: 8px; border-right: 1px solid rgba(255,255,255,0.05);">
            <div style="width: 24px; height: 24px; border-radius: 4px; background: var(--color-primary); display:flex; align-items:center; justify-content:center;">🔑</div>
            <span style="font-weight:700; font-size:0.75rem; color:#fff;">PMAS Gateway</span>
            <span style="font-size:0.55rem; color:rgba(255,255,255,0.5);">Secure Multi-Tenant Auth Protocol</span>
          </div>
          <div style="flex:1.8; background: #0a0b10; padding: 20px; display:flex; flex-direction:column; justify-content:center; gap: 10px;">
            <div style="height: 8px; width: 40%; background: rgba(255,255,255,0.8); border-radius: 2px;"></div>
            <div style="height: 18px; width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;"></div>
            <div style="height: 18px; width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;"></div>
            <div style="height: 20px; width: 100%; background: var(--color-primary); border-radius: 3px; box-shadow: 0 0 6px var(--color-primary-glow);"></div>
          </div>
        </div>
      `;
    } else if (device === 'tablet') {
      return `
        <!-- Tablet: Centered Login Form -->
        <div style="flex:1; background: #05060b; display:flex; align-items:center; justify-content:center; padding: 15px;">
          <div style="width: 200px; background: #0a0b10; border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 12px; display:flex; flex-direction:column; gap: 8px;">
            <div style="height: 6px; width: 60%; background: rgba(255,255,255,0.8); align-self:center; border-radius: 2px;"></div>
            <div style="height: 14px; width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;"></div>
            <div style="height: 14px; width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;"></div>
            <div style="height: 16px; width: 100%; background: var(--color-primary); border-radius: 3px;"></div>
          </div>
        </div>
      `;
    } else {
      return `
        <!-- Mobile: Stacked Auth -->
        <div style="flex:1; background: #0a0b10; padding: 15px; display:flex; flex-direction:column; justify-content:center; gap: 8px;">
          <div style="width: 16px; height: 16px; border-radius: 3px; background: var(--color-primary); align-self:center;"></div>
          <div style="height: 5px; width: 50%; background: rgba(255,255,255,0.4); align-self:center;"></div>
          <div style="height: 14px; width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;"></div>
          <div style="height: 14px; width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px;"></div>
          <div style="height: 16px; width: 100%; background: var(--color-primary); border-radius: 3px;"></div>
        </div>
      `;
    }
  } else if (page === 'Dashboard Workspace') {
    if (device === 'desktop') {
      return `
        <!-- Desktop: 3-column Dashboard -->
        <div style="flex:1; background: #0a0b10; padding: 12px; display:flex; flex-direction:column; gap: 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="height:10px; width: 80px; background:rgba(255,255,255,0.8); border-radius:2px;"></div>
            <div style="width:20px; height:6px; background:rgba(255,255,255,0.1); border-radius:1px;"></div>
          </div>
          <div style="display:flex; gap:8px; flex:1;">
            <div style="flex:1; background:rgba(99,102,241,0.03); border:1px solid rgba(99,102,241,0.1); border-radius:4px; padding:6px; display:flex; flex-direction:column; justify-content:space-between;">
              <div style="height:4px; width:70%; background:rgba(255,255,255,0.4);"></div>
              <div style="height:10px; width:50%; background:var(--color-primary);"></div>
            </div>
            <div style="flex:1; background:rgba(16,185,129,0.03); border:1px solid rgba(16,185,129,0.1); border-radius:4px; padding:6px; display:flex; flex-direction:column; justify-content:space-between;">
              <div style="height:4px; width:70%; background:rgba(255,255,255,0.4);"></div>
              <div style="height:10px; width:60%; background:var(--color-success);"></div>
            </div>
            <div style="flex:1; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:4px; padding:6px; display:flex; flex-direction:column; justify-content:space-between;">
              <div style="height:4px; width:70%; background:rgba(255,255,255,0.4);"></div>
              <div style="height:10px; width:40%; background:var(--color-info);"></div>
            </div>
          </div>
        </div>
      `;
    } else if (device === 'tablet') {
      return `
        <!-- Tablet: 2-column Dashboard -->
        <div style="flex:1; background: #0a0b10; padding: 10px; display:flex; flex-direction:column; gap: 8px;">
          <div style="height:8px; width: 60px; background:rgba(255,255,255,0.8); border-radius:2px;"></div>
          <div style="display:flex; gap:6px; flex:1; flex-direction:column;">
            <div style="display:flex; gap:6px; flex:1;">
              <div style="flex:1; background:rgba(99,102,241,0.03); border:1px solid rgba(99,102,241,0.1); border-radius:4px; padding:6px; display:flex; flex-direction:column; justify-content:space-between;">
                <div style="height:3px; width:60%; background:rgba(255,255,255,0.4);"></div>
                <div style="height:8px; width:40%; background:var(--color-primary);"></div>
              </div>
              <div style="flex:1; background:rgba(16,185,129,0.03); border:1px solid rgba(16,185,129,0.1); border-radius:4px; padding:6px; display:flex; flex-direction:column; justify-content:space-between;">
                <div style="height:3px; width:60%; background:rgba(255,255,255,0.4);"></div>
                <div style="height:8px; width:50%; background:var(--color-success);"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      return `
        <!-- Mobile: Scrollable stacked KPI list -->
        <div style="flex:1; background: #0a0b10; padding: 8px; display:flex; flex-direction:column; gap: 6px; overflow-y:auto;">
          <div style="background:rgba(99,102,241,0.03); border:1px solid rgba(99,102,241,0.1); border-radius:3px; padding:4px; display:flex; justify-content:space-between;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.5);">Revenue</span>
            <span style="font-size:0.5rem; color:var(--color-primary); font-weight:700;">$1.2M</span>
          </div>
          <div style="background:rgba(16,185,129,0.03); border:1px solid rgba(16,185,129,0.1); border-radius:3px; padding:4px; display:flex; justify-content:space-between;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.5);">Sync Rate</span>
            <span style="font-size:0.5rem; color:var(--color-success); font-weight:700;">99.8%</span>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:3px; padding:4px; display:flex; justify-content:space-between;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.5);">Blockers</span>
            <span style="font-size:0.5rem; color:var(--color-danger); font-weight:700;">3 Active</span>
          </div>
        </div>
      `;
    }
  } else { // Pricing Matrix
    if (device === 'desktop') {
      return `
        <!-- Desktop: 3 pricing cards -->
        <div style="flex:1; background: #0a0b10; padding: 12px; display:flex; align-items:center; justify-content:center; gap: 8px;">
          <div style="flex:1; height:80%; background:#131520; border:1px solid rgba(255,255,255,0.03); border-radius:4px; padding:8px; display:flex; flex-direction:column; align-items:center; justify-content:space-between;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.6);">BASIC</span>
            <span style="font-size:0.75rem; font-weight:700; color:#fff;">$19/mo</span>
            <div style="width:100%; height:10px; background:rgba(255,255,255,0.05); border-radius:2px;"></div>
          </div>
          <div style="flex:1; height:90%; background:#18192a; border:1px solid var(--color-primary); border-radius:4px; padding:8px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; position:relative;">
            <span style="position:absolute; top:-4px; font-size:0.4rem; background:var(--color-primary); color:#fff; padding:1px 3px; border-radius:2px;">POPULAR</span>
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.6);">ENTERPRISE</span>
            <span style="font-size:0.75rem; font-weight:700; color:#fff;">$99/mo</span>
            <div style="width:100%; height:10px; background:var(--color-primary); border-radius:2px;"></div>
          </div>
          <div style="flex:1; height:80%; background:#131520; border:1px solid rgba(255,255,255,0.03); border-radius:4px; padding:8px; display:flex; flex-direction:column; align-items:center; justify-content:space-between;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.6);">CUSTOM</span>
            <span style="font-size:0.75rem; font-weight:700; color:#fff;">Quote</span>
            <div style="width:100%; height:10px; background:rgba(255,255,255,0.05); border-radius:2px;"></div>
          </div>
        </div>
      `;
    } else if (device === 'tablet') {
      return `
        <!-- Tablet: 2 Pricing cards side by side -->
        <div style="flex:1; background: #0a0b10; padding: 10px; display:flex; align-items:center; justify-content:center; gap: 6px;">
          <div style="flex:1; height:85%; background:#131520; border:1px solid rgba(255,255,255,0.03); border-radius:4px; padding:6px; display:flex; flex-direction:column; align-items:center; justify-content:space-between;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.6);">BASIC</span>
            <span style="font-size:0.7rem; font-weight:700;">$19</span>
          </div>
          <div style="flex:1; height:90%; background:#18192a; border:1px solid var(--color-primary); border-radius:4px; padding:6px; display:flex; flex-direction:column; align-items:center; justify-content:space-between;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.6);">ENTERPRISE</span>
            <span style="font-size:0.7rem; font-weight:700;">$99</span>
          </div>
        </div>
      `;
    } else {
      return `
        <!-- Mobile: pricing cards stacked scrollable -->
        <div style="flex:1; background: #0a0b10; padding: 8px; display:flex; flex-direction:column; gap: 4px; overflow-y:auto;">
          <div style="background:#131520; border-radius:3px; padding:6px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.6);">BASIC</span>
            <span style="font-size:0.55rem; font-weight:700;">$19/mo</span>
          </div>
          <div style="background:#18192a; border:1px solid var(--color-primary); border-radius:3px; padding:6px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.5rem; color:rgba(255,255,255,0.6);">ENTERPRISE</span>
            <span style="font-size:0.55rem; font-weight:700;">$99/mo</span>
          </div>
        </div>
      `;
    }
  }
}

export function render(container) {
  const state = store.state;
  const { activeDevice, scale, activeTab } = state.uiuxView;
  const activePage = state.uiuxView.activePage || 'PMAS Enterprise Shell v1.4';

  // Inject indicators in universal header subtitle
  const viewSubtitle = document.getElementById('view-subtitle');
  if (viewSubtitle) {
    const alignmentVal = state.uiuxView.designSystemAlignment || 94.6;
    viewSubtitle.innerHTML = `
      High-Fidelity UI Layouts & Figma Integrations
      <span class="badge badge-info font-mono" style="margin-left: 8px; font-size: 0.65rem; padding: 2px 6px;">Figma Library Sync: v1.4.2</span>
      <span class="badge font-mono" style="margin-left: 8px; font-size: 0.65rem; padding: 2px 6px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); color: var(--color-primary);">
        Design System Alignment: ${alignmentVal}% Synced with Codebase
      </span>
    `;
  }

  // Render Figma viewport layout width
  let figmaWidth = '100%';
  let figmaHeight = '280px';
  if (activeDevice === 'tablet') {
    figmaWidth = '500px';
  } else if (activeDevice === 'mobile') {
    figmaWidth = '320px';
  }

  container.innerHTML = `
    <!-- Top Row: Interactive Figma Workspace -->
    <div class="card mb-4" style="padding: 1.25rem;">
      <div class="card-title">
        <span>Figma Design Integration Workspace</span>
        <div class="flex" style="gap: 0.5rem;">
          <span class="badge badge-info font-mono" style="font-size: 0.7rem;">Live Design Spec</span>
        </div>
      </div>
      
      <!-- Interactive Figma Mock Shell -->
      <div class="figma-mock">
        <!-- Figma toolbar -->
        <div class="figma-toolbar" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap: 8px; background:#1b1c22; padding: 6px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); border-top-left-radius: 4px; border-top-right-radius: 4px;">
          <div class="flex" style="align-items: center; gap: 10px;">
            <!-- Brand Icon -->
            <span style="font-weight: 700; color: #ff7262; font-size: 0.75rem;">Figma Preview</span>
            <span style="color: #666;">|</span>
            <span style="color: #999; font-size: 0.7rem; font-weight: 600;" id="figma-active-page-title">${activePage}</span>
          </div>
          
          <!-- Control Row: Page Dropdown + Device switches + Zoom -->
          <div class="flex" style="align-items: center; gap: 8px;">
            <!-- Figma Page Selector Dropdown -->
            <select id="select-figma-page" style="
              background: #0f1015;
              border: 1px solid var(--border-outline-variant-60);
              border-radius: 4px;
              color: var(--text-on-surface);
              font-family: var(--font-sans);
              font-size: 0.65rem;
              font-weight: 600;
              padding: 2px 20px 2px 6px;
              outline: none;
              cursor: pointer;
              height: 22px;
              appearance: none;
              background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23999%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E');
              background-repeat: no-repeat;
              background-position: right 6px top 50%;
              background-size: 8px auto;
            ">
              <option value="PMAS Enterprise Shell v1.4" ${activePage === 'PMAS Enterprise Shell v1.4' ? 'selected' : ''}>PMAS Enterprise Shell v1.4</option>
              <option value="User Authentication Flow" ${activePage === 'User Authentication Flow' ? 'selected' : ''}>User Authentication Flow</option>
              <option value="Dashboard Workspace" ${activePage === 'Dashboard Workspace' ? 'selected' : ''}>Dashboard Workspace</option>
              <option value="Pricing Matrix" ${activePage === 'Pricing Matrix' ? 'selected' : ''}>Pricing Matrix</option>
            </select>

            <!-- Device switches -->
            <div class="flex" style="gap: 2px; background: #0f1015; padding: 2px; border-radius: 4px; border: 1px solid var(--border-outline-variant-60);">
              <button class="btn btn-secondary btn-device ${activeDevice === 'desktop' ? 'btn-primary' : ''}" data-device="desktop" style="padding: 2px 8px; font-size: 0.65rem; border-radius: 3px; background: ${activeDevice === 'desktop' ? '#ff7262' : 'transparent'}; border: none; color: #fff;">Desktop</button>
              <button class="btn btn-secondary btn-device ${activeDevice === 'tablet' ? 'btn-primary' : ''}" data-device="tablet" style="padding: 2px 8px; font-size: 0.65rem; border-radius: 3px; background: ${activeDevice === 'tablet' ? '#ff7262' : 'transparent'}; border: none; color: #fff;">Tablet</button>
              <button class="btn btn-secondary btn-device ${activeDevice === 'mobile' ? 'btn-primary' : ''}" data-device="mobile" style="padding: 2px 8px; font-size: 0.65rem; border-radius: 3px; background: ${activeDevice === 'mobile' ? '#ff7262' : 'transparent'}; border: none; color: #fff;">Mobile</button>
            </div>

            <!-- Zoom switches -->
            <div class="flex" style="align-items: center; gap: 4px; background: #0f1015; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-outline-variant-60); height: 22px;">
              <button class="btn btn-secondary" id="btn-zoom-out" style="padding: 0 4px; font-size: 0.65rem; background: transparent; border: none; color: #ccc; cursor: pointer;">-</button>
              <span class="font-mono" style="font-size: 0.65rem; color: #aaa; width: 28px; text-align: center;">${scale}%</span>
              <button class="btn btn-secondary" id="btn-zoom-in" style="padding: 0 4px; font-size: 0.65rem; background: transparent; border: none; color: #ccc; cursor: pointer;">+</button>
            </div>
          </div>
        </div>

        <!-- Figma Frame Canvas -->
        <div class="figma-canvas" style="display: grid; place-items: center; overflow: auto; padding: 3rem; background: #12131a; min-height: 340px; border-radius: 4px; position: relative;">
          <div style="
            width: ${figmaWidth}; 
            height: ${figmaHeight};
            background-color: var(--bg-surface-container);
            border: 1px solid var(--border-outline-variant);
            border-radius: 4px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            transform: scale(${scale / 100});
            transform-origin: center center;
            margin: 2rem 0;
          ">
            <!-- Mock Header -->
            <div style="height: 2rem; background: #000; display:flex; align-items:center; justify-content:space-between; padding: 0 10px; font-size: 0.6rem; color: #888; border-bottom: 1px solid rgba(255,255,255,0.03);">
              <span style="font-family: var(--font-mono);">${activePage.toLowerCase().replace(/\s+/g, '-')}-preview</span>
              <div style="width: 4px; height: 4px; border-radius: 50%; background: #0f0;"></div>
            </div>
            
            <!-- Mock Body -->
            ${renderMockupContent(activePage, activeDevice)}
          </div>
        </div>
      </div>
    </div>

    <!-- Toggle Workspace Sub-Tabs -->
    <div style="display: flex; gap: 10px; margin-bottom: 1rem; border-bottom: 1px solid var(--border-outline-variant-60); padding-bottom: 8px;">
      <button class="btn btn-tab ${activeTab === 'components' ? 'btn-primary' : 'btn-secondary'}" data-tab="components" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">Component States Playground</button>
      <button class="btn btn-tab ${activeTab === 'tokens' ? 'btn-primary' : 'btn-secondary'}" data-tab="tokens" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">Typography & Color Tokens</button>
      <button class="btn btn-tab ${activeTab === 'assets' ? 'btn-primary' : 'btn-secondary'}" data-tab="assets" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">Active Asset Delivery (${state.uiux.assets.length})</button>
    </div>

    <!-- Render workspace view contents dynamically -->
    <div id="uiux-tab-content">
      ${activeTab === 'components' ? `
        <!-- Design System Component States -->
        <div class="interactive-showcase flex-col" style="gap: 1.5rem;">
          
          <!-- Section 1: Buttons -->
          <div>
            <h3 style="font-size: 0.875rem; font-weight: 700; margin-bottom: 10px; color: var(--text-on-surface); text-transform:uppercase; letter-spacing: 0.05em;">Interactive Buttons State Matrix</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;">
              
              <div class="card" style="padding: 10px; background: var(--bg-surface-elevated);">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; display:block;">PRIMARY INDIGO</span>
                <div class="flex" style="flex-wrap: wrap; gap: 8px; align-items: center;">
                  <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Default</button>
                  <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; box-shadow: 0 0 8px var(--color-primary-glow);">Hover</button>
                  <button class="btn btn-primary" disabled style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Disabled</button>
                </div>
              </div>

              <div class="card" style="padding: 10px; background: var(--bg-surface-elevated);">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; display:block;">SECONDARY OUTLINE</span>
                <div class="flex" style="flex-wrap: wrap; gap: 8px; align-items: center;">
                  <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Default</button>
                  <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border-color: var(--color-primary);">Hover</button>
                  <button class="btn btn-secondary" disabled style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Disabled</button>
                </div>
              </div>

              <div class="card" style="padding: 10px; background: var(--bg-surface-elevated);">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; margin-bottom: 8px; display:block;">CRITICAL DANGER</span>
                <div class="flex" style="flex-wrap: wrap; gap: 8px; align-items: center;">
                  <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--color-danger);">Default</button>
                  <button class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--color-danger); box-shadow: 0 0 8px var(--color-danger-glow);">Hover</button>
                  <button class="btn btn-primary" disabled style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--color-danger);">Disabled</button>
                </div>
              </div>

            </div>
          </div>

          <!-- Section 2: Badges -->
          <div style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 1rem;">
            <h3 style="font-size: 0.875rem; font-weight: 700; margin-bottom: 10px; color: var(--text-on-surface); text-transform:uppercase; letter-spacing: 0.05em;">Design System Badges & Indicators</h3>
            <div class="flex" style="gap: 15px; flex-wrap: wrap;">
              <div class="flex" style="align-items: center; gap: 6px;">
                <span class="badge badge-success">Success Badge</span>
                <span class="font-mono" style="font-size: 0.65rem; color: var(--text-dim);">Completed, Online, Cleared</span>
              </div>
              <div class="flex" style="align-items: center; gap: 6px;">
                <span class="badge badge-warning">Warning Badge</span>
                <span class="font-mono" style="font-size: 0.65rem; color: var(--text-dim);">Attention Required, Building</span>
              </div>
              <div class="flex" style="align-items: center; gap: 6px;">
                <span class="badge badge-danger">Danger Badge</span>
                <span class="font-mono" style="font-size: 0.65rem; color: var(--text-dim);">Critical Blocker, Offline</span>
              </div>
              <div class="flex" style="align-items: center; gap: 6px;">
                <span class="badge badge-info">Info Badge</span>
                <span class="font-mono" style="font-size: 0.65rem; color: var(--text-dim);">Telemetry Active, Testing</span>
              </div>
            </div>
          </div>

          <!-- Section 3: Input Controls -->
          <div style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 1rem;">
            <h3 style="font-size: 0.875rem; font-weight: 700; margin-bottom: 10px; color: var(--text-on-surface); text-transform:uppercase; letter-spacing: 0.05em;">Form Input Fields & Controls</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">
              
              <div class="flex-col" style="gap: 6px;">
                <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">TEXT FIELD STATE: ACTIVE</label>
                <input type="text" value="Sarah Jenkins" style="background: var(--bg-surface-elevated); border: 1.5px solid var(--border-outline-variant); border-radius: 4px; padding: 0.5rem; color: var(--text-on-surface); font-size: 0.8rem; outline: none; font-family: var(--font-sans);">
              </div>

              <div class="flex-col" style="gap: 6px;">
                <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">TEXT FIELD STATE: FOCUS / GLOW</label>
                <input type="text" value="m.aurel@pmas.enterprise" style="background: var(--bg-surface-elevated); border: 1.5px solid var(--color-primary); box-shadow: 0 0 10px var(--color-primary-glow); border-radius: 4px; padding: 0.5rem; color: var(--text-on-surface); font-size: 0.8rem; outline: none; font-family: var(--font-sans);">
              </div>

              <div class="flex-col" style="gap: 6px;">
                <label style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">TEXT FIELD STATE: DISABLED</label>
                <input type="text" disabled value="Encrypted Hash Value Key" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; padding: 0.5rem; color: var(--text-dim); font-size: 0.8rem; outline: none; cursor: not-allowed; font-family: var(--font-mono);">
              </div>

            </div>
          </div>

        </div>
      ` : activeTab === 'tokens' ? `
        <!-- Design System Design Token Payloads -->
        <div class="card" style="padding: 1.25rem;">
          <h3 class="mb-4" style="font-size: 0.875rem; font-weight: 700; color: var(--text-on-surface); text-transform:uppercase; letter-spacing: 0.05em;">Design System Typography & Color Tokens</h3>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 15px;">
            Active JSON payload representation of our typography metrics and color scheme variables, loaded directly from the global application state (<code class="font-mono">state.uiux.tokens</code>).
          </p>
          <pre style="
            background: #07080c;
            border: 1px solid var(--border-outline-variant-60);
            border-radius: 4px;
            padding: 1rem;
            max-height: 480px;
            overflow-y: auto;
            margin: 0;
            font-family: var(--font-mono);
            font-size: 0.75rem;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-all;
          "><code style="display:block;">${syntaxHighlightJson(state.uiux.tokens)}</code></pre>
        </div>
      ` : `
        <!-- Active Design Assets Table -->
        <div class="card" style="padding: 1.25rem;">
          <h3 class="mb-4" style="font-size: 0.875rem; font-weight: 700; color: var(--text-on-surface); text-transform:uppercase; letter-spacing: 0.05em;">Approved Assets & Spec Integration</h3>
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>File Size</th>
                <th>CDN Status</th>
                <th style="text-align: right; width: 220px;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${state.uiux.assets.map(asset => `
                <tr>
                  <td style="font-weight: 600; font-family: var(--font-sans);">${asset.name}</td>
                  <td class="font-mono" style="font-size:0.75rem;">${asset.size}</td>
                  <td>
                    <span class="badge ${
                      asset.cdnStatus === 'Live' ? 'badge-success' : 
                      asset.cdnStatus === 'Syncing...' ? 'badge-warning' : 'badge-danger'
                    }" style="font-family: var(--font-mono); font-size: 0.7rem;">${asset.cdnStatus}</span>
                  </td>
                  <td style="text-align: right;">
                    <button class="btn btn-primary btn-push-cdn" data-name="${asset.name}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" ${asset.cdnStatus === 'Syncing...' ? 'disabled' : ''}>
                      Push to Production CDN
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  // --- BIND EVENT HANDLERS ---
  
  // Tab selector handler
  const tabs = container.querySelectorAll('.btn-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const selected = e.currentTarget.getAttribute('data-tab');
      store.setUIUXTab(selected);
    });
  });

  // Figma device select handler
  const deviceButtons = container.querySelectorAll('.btn-device');
  deviceButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const device = e.currentTarget.getAttribute('data-device');
      store.setUIUXDevice(device);
    });
  });

  // Figma active page selector handler
  const pageSelector = container.querySelector('#select-figma-page');
  if (pageSelector) {
    pageSelector.addEventListener('change', (e) => {
      store.setUIUXPage(e.target.value);
    });
  }

  // Figma zoom selectors
  const zoomIn = container.querySelector('#btn-zoom-in');
  if (zoomIn) {
    zoomIn.addEventListener('click', () => store.changeUIUXScale(10));
  }
  
  const zoomOut = container.querySelector('#btn-zoom-out');
  if (zoomOut) {
    zoomOut.addEventListener('click', () => store.changeUIUXScale(-10));
  }

  // Active Asset push to CDN handler
  const pushButtons = container.querySelectorAll('.btn-push-cdn');
  pushButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const assetName = e.currentTarget.getAttribute('data-name');
      store.pushAssetToCDN(assetName);
    });
  });

  // Render Departmental Operations & Collaboration Board
  renderWorkspaceBoard(container, 'uiux');
}
