import { store } from './state.js';
import { render as renderExecutive } from './views/executive.js';
import { render as renderUiux } from './views/uiux.js';
import { render as renderEngineering } from './views/engineering.js';
import { render as renderInfrastructure } from './views/infrastructure.js';
import { render as renderMarketing } from './views/marketing.js';
import { render as renderGraphview } from './views/graphview.js';
import { render as renderFinance } from './views/finance.js';
import { render as renderLegalhr } from './views/legalhr.js';
import { render as renderProfile } from './views/profile.js';
import { render as renderSettings } from './views/settings.js';

// Route view mapping table
const routes = {
  'executive': {
    title: 'Executive Control Room',
    subtitle: 'Global Project Portfolio Telemetry',
    render: renderExecutive
  },
  'uiux': {
    title: 'UI/UX Workspace & Design System',
    subtitle: 'High-Fidelity UI Layouts & Figma Integrations',
    render: renderUiux
  },
  'engineering': {
    title: 'Engineering Core Platform',
    subtitle: 'CI/CD Telemetry, Pull Request Matrix & Tech Stack Health',
    render: renderEngineering
  },
  'infrastructure': {
    title: 'Infrastructure Cluster Gateway',
    subtitle: 'Server Node Allocations, Container Health & Migration Sequencing',
    render: renderInfrastructure
  },
  'marketing': {
    title: 'Marketing Acquisition Workspace',
    subtitle: 'Acquisition Channels & Conversion Funnel Telemetry',
    render: renderMarketing
  },
  'graph-view': {
    title: 'Global Network Topology & Resource Analytics',
    subtitle: 'Multi-layered cross-functional graph mapping task lineage, human capital density, and structural bottlenecks.',
    render: renderGraphview
  },
  'finance': {
    title: 'Finance & Burn Telemetry',
    subtitle: 'Operational vs Capital Expenditures & Forecasting',
    render: renderFinance
  },
  'legalhr': {
    title: 'Legal & HR Compliance Matrix',
    subtitle: 'Compliance Controls (GDPR/SOC2) & Workforce Onboarding',
    render: renderLegalhr
  },
  'profile': {
    title: 'Sarah Jenkins - Profile Settings',
    subtitle: 'Manage your profile fields and avatar color',
    render: renderProfile
  },
  'settings': {
    title: 'System Settings Control',
    subtitle: 'Tweak layout density, simulation ticks, blocker alerts and threshold rules',
    render: renderSettings
  }
};

const appViewport = document.getElementById('app-viewport');
const viewTitle = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');
const navItems = document.querySelectorAll('#sidebar-nav-menu .nav-item');

// Update sidebar active highlights
function updateNavigationHighlights(currentView) {
  navItems.forEach(item => {
    const viewName = item.getAttribute('data-view');
    if (viewName === currentView) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Highlight user profile section
  const userProfileEl = document.getElementById('user-profile-section');
  if (userProfileEl) {
    if (currentView === 'profile') {
      userProfileEl.classList.add('active');
    } else {
      userProfileEl.classList.remove('active');
    }
  }
}

// Update Top Bar header metrics
function updateHeaderTelemetry(state) {
  // Compliance Score index
  const complianceScore = store.getCompliancePercent();
  const complianceEl = document.getElementById('header-compliance-score');
  const threshold = state.settings?.complianceThreshold || 75;
  if (complianceEl) {
    complianceEl.textContent = `${complianceScore}%`;
    
    // Change color depending on score relative to configured threshold
    if (complianceScore < 50) {
      complianceEl.className = 'font-mono text-danger';
    } else if (complianceScore < threshold) {
      complianceEl.className = 'font-mono text-warning';
    } else {
      complianceEl.className = 'font-mono text-success';
    }
  }

  // Active Blockers Count Alert
  const activeBlockersCount = state.blockers.filter(b => b.status === 'Blocked').length;
  const countEl = document.getElementById('header-blockers-count');
  const alertWidget = document.getElementById('header-blockers-alert');
  
  if (countEl) {
    countEl.textContent = `${activeBlockersCount} Blocker${activeBlockersCount !== 1 ? 's' : ''}`;
  }
  
  if (alertWidget) {
    const alertsEnabled = state.settings?.notificationAlerts !== false;
    if (activeBlockersCount > 0 && alertsEnabled) {
      alertWidget.style.display = 'flex';
      // Pulse animation if critical blockers are present
      if (activeBlockersCount > 3) {
        alertWidget.style.boxShadow = '0 0 10px rgba(244, 63, 94, 0.4)';
      } else {
        alertWidget.style.boxShadow = 'none';
      }
    } else {
      alertWidget.style.display = 'none';
    }
  }
}

let lastRenderedView = null;
let lastRenderedState = null;

// Render active view based on state
function renderView(state) {
  const currentView = state.currentView;
  const config = routes[currentView] || routes['executive'];

  // Update header text
  if (viewTitle) viewTitle.textContent = config.title;
  if (viewSubtitle) viewSubtitle.textContent = config.subtitle;

  // Highlight corresponding navbar items
  updateNavigationHighlights(currentView);
  
  // Sync top-bar metrics
  updateHeaderTelemetry(state);

  // Sync sidebar user credentials in real-time
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileRole = document.getElementById('profile-role');

  if (profileAvatar) {
    profileAvatar.textContent = state.user.avatarText;
    profileAvatar.style.background = state.user.avatarColor || 'linear-gradient(135deg, var(--color-primary), var(--color-info))';
  }
  if (profileName) profileName.textContent = state.user.name;
  if (profileRole) profileRole.textContent = state.user.role;

  // Sync compact mode layout styling class
  if (state.settings?.compactMode) {
    document.documentElement.classList.add('compact-mode');
  } else {
    document.documentElement.classList.remove('compact-mode');
  }

  // Sync sidebar collapsed state class
  const sidebarEl = document.querySelector('.sidebar');
  if (sidebarEl) {
    if (state.settings?.sidebarCollapsed) {
      sidebarEl.classList.add('collapsed');
    } else {
      sidebarEl.classList.remove('collapsed');
    }
  }

  // Determine whether active viewport needs re-rendering
  let shouldRender = false;
  if (currentView !== lastRenderedView) {
    shouldRender = true;
  } else if (!lastRenderedState) {
    shouldRender = true;
  } else {
    if (currentView === 'profile') {
      shouldRender = (state.user !== lastRenderedState.user);
    } else if (currentView === 'settings') {
      shouldRender = (state.settings !== lastRenderedState.settings);
    } else if (currentView === 'uiux') {
      shouldRender = (state.uiuxView !== lastRenderedState.uiuxView || 
                      state.uiux !== lastRenderedState.uiux ||
                      state.workspaceItems !== lastRenderedState.workspaceItems);
    } else if (currentView === 'engineering') {
      shouldRender = (state.pipeline !== lastRenderedState.pipeline || 
                      state.workspaceItems !== lastRenderedState.workspaceItems);
    } else if (currentView === 'infrastructure') {
      shouldRender = (state.clusterNodes !== lastRenderedState.clusterNodes || 
                      state.workspaceItems !== lastRenderedState.workspaceItems);
    } else if (currentView === 'marketing') {
      shouldRender = (state.workspaceItems !== lastRenderedState.workspaceItems);
    } else if (currentView === 'finance') {
      shouldRender = (state.finance !== lastRenderedState.finance || 
                      state.workspaceItems !== lastRenderedState.workspaceItems);
    } else if (currentView === 'legalhr') {
      shouldRender = (state.complianceChecklist !== lastRenderedState.complianceChecklist || 
                      state.workspaceItems !== lastRenderedState.workspaceItems);
    } else if (currentView === 'graph-view') {
      shouldRender = (state.workspaceItems !== lastRenderedState.workspaceItems);
    } else {
      shouldRender = true; // executive
    }
  }

  lastRenderedView = currentView;
  lastRenderedState = state;

  // Render view layout content & bind listeners
  if (shouldRender && appViewport) {
    if (appViewport._cleanupEvents) {
      appViewport._cleanupEvents();
      appViewport._cleanupEvents = null;
    }
    config.render(appViewport);
  }
}

// SPA Routing Router
function resolveRoute() {
  const hash = window.location.hash || '#/executive';
  const match = hash.match(/^#\/([a-zA-Z0-9-]+)/);
  const viewName = match ? match[1] : 'executive';

  if (routes[viewName]) {
    store.setView(viewName);
  } else {
    window.location.hash = '#/executive';
  }
}

// Bootstrap Boot Loader
function init() {
  // Listen for hash changes
  window.addEventListener('hashchange', resolveRoute);

  // Set user profile data in layout dynamically on start
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileRole = document.getElementById('profile-role');

  if (profileAvatar) {
    profileAvatar.textContent = store.state.user.avatarText;
    profileAvatar.style.background = store.state.user.avatarColor || 'linear-gradient(135deg, var(--color-primary), var(--color-info))';
  }
  if (profileName) profileName.textContent = store.state.user.name;
  if (profileRole) profileRole.textContent = store.state.user.role;

  // Setup click listener on top header blocker alert to redirect to executive blockers table
  const blockersAlert = document.getElementById('header-blockers-alert');
  if (blockersAlert) {
    blockersAlert.addEventListener('click', () => {
      window.location.hash = '#/executive';
    });
  }

  // Setup click listener on profile sidebar section to redirect to profile settings view
  const userProfileSection = document.getElementById('user-profile-section');
  if (userProfileSection) {
    userProfileSection.addEventListener('click', () => {
      window.location.hash = '#/profile';
    });
  }

  // Setup click listener on sidebar toggle button to collapse/expand
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', () => {
      const isCollapsed = !store.state.settings?.sidebarCollapsed;
      store.updateSettings({ sidebarCollapsed: isCollapsed });
    });
  }

  // Subscribe to state change notifications
  store.subscribe(renderView);

  // Resolve initial route mapping on page load
  resolveRoute();
}

// Kickstart SPA Shell initialization
document.addEventListener('DOMContentLoaded', init);
resolveRoute(); // Resolve route immediately to prevent empty canvas flash
