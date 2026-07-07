/**
 * PMAS Global State Manager
 * Implements a reactive pub-sub state container for enterprise telemetry.
 */

class StateManager {
  constructor() {
    this.subscribers = new Set();
    
    // Core application state
    this.state = {
      currentView: 'executive',
      user: {
        name: 'Sarah Jenkins',
        role: 'VP of Product & Architecture',
        avatarText: 'SJ',
        email: 'sarah.jenkins@enterprise.pmas.com',
        department: 'Product Management & Architecture',
        bio: 'Overseeing enterprise architectural compliance, security gateways, and cross-functional operations.',
        avatarColor: 'linear-gradient(135deg, var(--color-primary), var(--color-info))'
      },
      settings: {
        notificationAlerts: true,
        simulationSpeed: 'normal',
        complianceThreshold: 75,
        compactMode: false,
        sidebarCollapsed: false
      },
      credentials: [],
      // Executive KPIs & compliance
      complianceChecklist: [
        { id: 'gdpr-inventory', category: 'GDPR', text: 'Register GDPR Data Inventory & mapping', checked: true },
        { id: 'gdpr-privacy', category: 'GDPR', text: 'Deploy updated Privacy Policy & Consent forms', checked: true },
        { id: 'gdpr-dpo', category: 'GDPR', text: 'Appoint EU Data Protection Officer (DPO)', checked: false },
        { id: 'ccpa-dns', category: 'CCPA', text: 'Implement "Do Not Sell My Info" link', checked: true },
        { id: 'ccpa-delete', category: 'CCPA', text: 'Deploy CCPA customer data deletion pipelines', checked: false },
        { id: 'soc2-encryption', category: 'SOC2', text: 'Enable database encryption-at-rest for production', checked: true },
        { id: 'soc2-audit', category: 'SOC2', text: 'Complete external SOC2 Type II audit dry-run', checked: false },
        { id: 'hipaa-audit', category: 'HIPAA', text: 'Execute HIPAA access log audit verification', checked: false }
      ],
      // Dynamic workspace items list (tasks, issues, handoffs, blockers)
      workspaceItems: [
        // Blocker items (from original blockers list, with status 'Blocked')
        { id: 'item-1', type: 'blocker', title: 'API Gateway Rate-Limiting Auth Loop', severity: 'Critical', workspace: 'infrastructure', owner: 'Infra Team', status: 'Blocked', details: 'API Gateway auth loops under high load conditions. Investigate rate limit configurations on node ingress gateways.', createdAt: '2026-06-27T12:00:00Z' },
        { id: 'item-2', type: 'blocker', title: 'Legal review on OAuth2 user-consent screen', severity: 'High', workspace: 'legalhr', owner: 'Legal Team', status: 'Blocked', details: 'OAuth2 authorization screen requires compliance approval from legal counsel before deployment to production environment.', createdAt: '2026-06-27T12:10:00Z' },
        { id: 'item-3', type: 'blocker', title: 'Figma token integration mismatch in theme engine', severity: 'Medium', workspace: 'uiux', owner: 'UI/UX Team', status: 'Blocked', details: 'Mismatch in exported color token variables causing compilation warnings in themes and webpack build errors.', createdAt: '2026-06-27T12:20:00Z' },
        { id: 'item-4', type: 'blocker', title: 'Database migration lockup on staging DB', severity: 'Critical', workspace: 'engineering', owner: 'Engineering Core', status: 'Blocked', details: 'Prisma schema migration locked on database nodes. Needs DBA script intervention and lock release execution.', createdAt: '2026-06-27T12:30:00Z' },
        { id: 'item-5', type: 'blocker', title: 'GDPR compliance signoff on analytic scripts', severity: 'High', workspace: 'legalhr', owner: 'Legal Team', status: 'Blocked', details: 'GDPR compliance validation requested for newly integrated third-party client analytics script tracking behaviors.', createdAt: '2026-06-27T12:40:00Z' },
        { id: 'item-6', type: 'blocker', title: 'CI/CD runner concurrency limit exhaustion', severity: 'Medium', workspace: 'infrastructure', owner: 'Infra Team', status: 'Blocked', details: 'CI/CD runner node resource allocation limit reached. Increase concurrency caps and provision extra runner nodes.', createdAt: '2026-06-27T12:50:00Z' },
        { id: 'item-7', type: 'blocker', title: 'Finance Q2 CapEx final reconciliation delay', severity: 'Low', workspace: 'finance', owner: 'Finance Team', status: 'Blocked', details: 'Finance team report on Q2 CapEx ledger reconciliation delayed. Waiting for final hardware invoice imports from cloud provider vendors.', createdAt: '2026-06-27T13:00:00Z' },

        // Tasks
        { id: 'item-8', type: 'task', title: 'Refactor typography token parser', severity: 'Low', workspace: 'uiux', owner: 'Elena R.', status: 'In Progress', details: 'Streamline the typography token JSON extraction process to align with our latest Figma token scheme.', createdAt: '2026-06-27T13:05:00Z' },
        { id: 'item-9', type: 'task', title: 'Design landing page dark/light toggles', severity: 'Medium', workspace: 'uiux', owner: 'Elena R.', status: 'Backlog', details: 'Draft alternative variants of visual themes for landing page user custom preferences.', createdAt: '2026-06-27T13:10:00Z' },
        { id: 'item-10', type: 'task', title: 'Optimize query index on users table', severity: 'High', workspace: 'engineering', owner: 'Marcus A.', status: 'In Progress', details: 'Add composited index on tenant_id and email fields to reduce peak latency of user auth queries.', createdAt: '2026-06-27T13:15:00Z' },
        { id: 'item-11', type: 'task', title: 'Provision staging replicas for testing', severity: 'High', workspace: 'infrastructure', owner: 'DevOps Pod 3', status: 'Completed', details: 'Provision and configure duplicate node targets for running E2E build cycles against production-equivalent db locks.', createdAt: '2026-06-27T10:00:00Z', completedAt: '2026-06-27T12:00:00Z' },
        { id: 'item-12', type: 'task', title: 'Draft release summary blog copy', severity: 'Low', workspace: 'marketing', owner: 'Clara O.', status: 'Backlog', details: 'Create initial draft for the release blog posts outlining the enterprise compliance update.', createdAt: '2026-06-27T13:20:00Z' },
        { id: 'item-13', type: 'task', title: 'Conduct monthly ledger reconciliation', severity: 'Medium', workspace: 'finance', owner: 'Finance Team', status: 'In Progress', details: 'Process cloud invoices and cross-reference with monthly operations allocation thresholds.', createdAt: '2026-06-27T13:25:00Z' },
        { id: 'item-14', type: 'task', title: 'Update external audit contact list', severity: 'Low', workspace: 'legalhr', owner: 'Diana Prince', status: 'Completed', details: 'Confirm primary contact emails and schedule access details for external compliance auditor.', createdAt: '2026-06-27T10:30:00Z', completedAt: '2026-06-27T11:45:00Z' },

        // Issues
        { id: 'item-15', type: 'issue', title: 'Color contrast ratio warnings in footer', severity: 'Medium', workspace: 'uiux', owner: 'Elena R.', status: 'Active', details: 'Footer links contrast ratio falls below WCAG AA requirements on light themes. Redesign with darker colors.', createdAt: '2026-06-27T13:30:00Z' },
        { id: 'item-16', type: 'issue', title: 'Memory leak in pipeline logs buffer stream', severity: 'High', workspace: 'engineering', owner: 'Marcus A.', status: 'Active', details: 'Buffer array retains old stream log logs even after runs conclude, causing gradual memory leaks in long-running processes.', createdAt: '2026-06-27T13:35:00Z' },
        { id: 'item-17', type: 'issue', title: 'Frankfurt-ingress-03 pod replication loop', severity: 'Critical', workspace: 'infrastructure', owner: 'DevOps Pod 3', status: 'Active', details: 'Kubernetes ingress node triggers failure loop under massive request spikes. Auto-eviction thresholds are too low.', createdAt: '2026-06-27T13:40:00Z' },

        // Handoffs
        { id: 'item-18', type: 'handoff', title: 'Sync exported theme JSON tokens to repo', severity: 'Medium', workspace: 'uiux', owner: 'Elena R.', status: 'Active', details: 'Figma tokens are exported and clean. Handoff to Engineering for integration into the style config builder.', targetWorkspace: 'engineering', createdAt: '2026-06-27T13:45:00Z' },
        { id: 'item-19', type: 'handoff', title: 'Verify client analytics code GDPR compliance', severity: 'High', workspace: 'marketing', owner: 'Clara O.', status: 'Active', details: 'Completed integration script draft. Handoff to Legal & HR team to verify tracker settings are fully GDPR-safe.', targetWorkspace: 'legalhr', createdAt: '2026-06-27T13:50:00Z' }
      ],
      blockers: [], // Computed dynamically
      // Engineering CI/CD state
      pipeline: {
        status: 'Idle', // 'Idle', 'Running', 'Success', 'Failed'
        stage: 'None',  // 'None', 'Build', 'Lint', 'Test', 'Deploy'
        progress: 0,
        logs: ['[System] System ready. Waiting for trigger...'],
        lastDuration: '4m 12s',
        coverage: 84.2,
        buildCount: 142
      },
      // Tech-stack services status
      techStack: [
        { name: 'React SPA Client', status: 'Healthy', version: 'v18.3.1', memory: '42MB', uptime: '99.99%' },
        { name: 'Tailwind Design compiler', status: 'Healthy', version: 'v3.4.4', memory: '18MB', uptime: '100.00%' },
        { name: 'Docker Gateway Slots', status: 'Warning', version: 'v26.1.3', memory: '1.2GB', uptime: '99.92%' },
        { name: 'Node Core API Engine', status: 'Healthy', version: 'v20.12.2', memory: '240MB', uptime: '99.98%' }
      ],
      // Infrastructure cluster nodes allocation
      clusterNodes: [
        { name: 'us-east-core-01', region: 'US-East (N. Virginia)', status: 'Active', cpu: 64, ram: 78, disk: 42, host: 'aws-ec2-m6g.2xlarge' },
        { name: 'us-west-api-02', region: 'US-West (Oregon)', status: 'Active', cpu: 32, ram: 54, disk: 18, host: 'aws-ec2-c6g.xlarge' },
        { name: 'eu-central-ingress-03', region: 'EU-Central (Frankfurt)', status: 'Active', cpu: 89, ram: 91, disk: 67, host: 'aws-ec2-m6g.2xlarge' }
      ],
      // UI/UX mockup frame tools
      uiuxView: {
        activeDevice: 'desktop',
        scale: 100,
        activeTab: 'components', // 'components', 'tokens', 'assets'
        activePage: 'PMAS Enterprise Shell v1.4',
        designSystemAlignment: 94.6
      },
      uiux: {
        tokens: {
          typography: {
            "font-sans-title": {
              fontFamily: "'Inter', sans-serif",
              fontWeight: "700",
              fontSize: "1.25rem",
              lineHeight: "1.4"
            },
            "font-sans-body": {
              fontFamily: "'Inter', sans-serif",
              fontWeight: "400",
              fontSize: "0.875rem",
              lineHeight: "1.5"
            },
            "font-mono-numbers": {
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: "500",
              fontSize: "1.75rem",
              lineHeight: "1.2"
            },
            "font-mono-logs": {
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: "400",
              fontSize: "0.75rem",
              lineHeight: "1.6"
            }
          },
          colors: {
            "bg-surface": "#06070a",
            "bg-surface-container": "#0c0e16",
            "color-primary": "#6366f1",
            "color-success": "#10b981",
            "border-outline-variant": "rgba(99, 102, 241, 0.25)"
          }
        },
        assets: [
          { name: 'logo-dark.svg', size: '1.4 KB', cdnStatus: 'Live', date: 'Jul 01, 2026' },
          { name: 'avatar-placeholder.png', size: '3.8 KB', cdnStatus: 'Live', date: 'Jul 02, 2026' },
          { name: 'hero-banner-illustration.svg', size: '24.5 KB', cdnStatus: 'Pending Sync', date: 'Jul 03, 2026' },
          { name: 'font-subset-inter.woff2', size: '12.0 KB', cdnStatus: 'Live', date: 'Jul 05, 2026' }
        ]
      },
      // Finance allocation CapEx/OpEx
      finance: {
        capex: 1250000,
        opex: 750000,
        burnRate: 165000, // per month
        forecastQ3: 2100000,
        actualQ2: 1980000
      },
      // Marketing pipeline
      marketing: {
        campaigns: [
          { name: 'Enterprise Lead-Gen Google Search', leads: 14200, conversion: 2.1, spend: 45000, status: 'Active' },
          { name: 'Product Architecture Whitepaper', leads: 8300, conversion: 4.8, spend: 28000, status: 'Active' },
          { name: 'SysOps Global Conf Sponsorship', leads: 1200, conversion: 9.2, spend: 85000, status: 'Completed' },
          { name: 'DevOps Weekly Newsletter Programmatic', leads: 4900, conversion: 1.5, spend: 12000, status: 'Paused' }
        ]
      }
    };

    // Initial sync
    this.syncBlockers();

    // Asynchronously synchronize telemetry data from Supabase DB via our API
    this.loadDatabaseTelemetry();

    // Initialize telemetry tickers
    this.startTelemetrySimulators();
  }

  async loadDatabaseTelemetry() {
    try {
      // 1. Synchronize Figma design tokens
      const tokensResp = await fetch('http://localhost:8080/api/v1/uiux/tokens');
      if (tokensResp.ok) {
        const tokens = await tokensResp.json();
        this.state.uiux.tokens = tokens;
      }

      // 2. Synchronize marketing campaign metrics
      const mktResp = await fetch('http://localhost:8080/api/v1/marketing/campaigns');
      if (mktResp.ok) {
        const campaigns = await mktResp.json();
        this.state.marketing.campaigns = campaigns.map(c => ({
          name: c.name,
          leads: c.leads,
          conversion: c.conversion,
          spend: c.spend,
          status: c.status
        }));
      }

      // 3. Synchronize subsystems health ledger
      const subResp = await fetch('http://localhost:8080/api/v1/engineering/subsystems');
      if (subResp.ok) {
        const subsystems = await subResp.json();
        this.state.subsystems = subsystems;
        
        // Also update techStack list for Executive view
        this.state.techStack = subsystems.map(sub => {
          let version = 'v1.0.0';
          let memory = '20MB';
          let uptime = '99.9%';
          if (sub.slug === 'executive') { version = 'v1.4'; memory = '15MB'; uptime = '100.00%' }
          else if (sub.slug === 'uiux') { version = 'v3.4.4'; memory = '18MB'; uptime = '100.00%' }
          else if (sub.slug === 'engineering') { version = 'v20.12.2'; memory = '240MB'; uptime = '99.98%' }
          else if (sub.slug === 'infrastructure') { version = 'v26.1.3'; memory = '1.2GB'; uptime = '99.92%' }
          
          return {
            name: sub.name,
            status: sub.status.charAt(0).toUpperCase() + sub.status.slice(1),
            version: version,
            memory: memory,
            uptime: uptime
          };
        });
      }

      // 4. Synchronize operational checklist items from database
      const itemsResp = await fetch('http://localhost:8080/api/v1/operations/items');
      if (itemsResp.ok) {
        const items = await itemsResp.json();
        this.state.workspaceItems = items.map(item => {
          let workspace = 'engineering';
          if (item.origin_subsystem_id === 1) workspace = 'executive';
          else if (item.origin_subsystem_id === 2) workspace = 'uiux';
          else if (item.origin_subsystem_id === 3) workspace = 'engineering';
          else if (item.origin_subsystem_id === 4) workspace = 'infrastructure';
          else if (item.origin_subsystem_id === 5) workspace = 'marketing';
          else if (item.origin_subsystem_id === 6) workspace = 'finance';
          else if (item.origin_subsystem_id === 7) workspace = 'legalhr';

          return {
            id: `item-${item.id}`,
            type: item.type,
            title: item.title,
            severity: item.severity,
            workspace: workspace,
            owner: item.assigned_to || 'General',
            status: item.status,
            details: item.description || 'No additional details.',
            createdAt: item.created_at,
            completedAt: item.completed_at
          };
        });
      }

      // 5. Synchronize application credentials
      await this.fetchCredentials();

      this.syncBlockers();
      this.notify();
      console.log('[Telemetry Sync] Telemetry data synchronized with Supabase DB.');
    } catch (e) {
      console.warn('[Telemetry Sync] Backend service unreachable. Defaulting to mock local telemetry.', e);
    }
  }

  // Sync blocker arrays from workspaceItems
  syncBlockers() {
    this.state.blockers = this.state.workspaceItems
      .filter(item => item.type === 'blocker')
      .map(item => ({
        id: parseInt(item.id.replace('item-', '')) || item.id,
        title: item.title,
        severity: item.severity,
        owner: item.owner || (item.workspace === 'infrastructure' ? 'Infra Team' : 
                              item.workspace === 'legalhr' ? 'Legal Team' :
                              item.workspace === 'uiux' ? 'UI/UX Team' :
                              item.workspace === 'engineering' ? 'Engineering Core' :
                              item.workspace === 'finance' ? 'Finance Team' : 'General'),
        status: item.status === 'Resolved' ? 'Resolved' : 'Blocked',
        details: item.details
      }));
  }

  // Pub-Sub interface
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    this.subscribers.forEach(callback => callback(this.state));
  }

  // Update logic helper
  updateState(updater) {
    if (typeof updater === 'function') {
      this.state = updater(this.state);
    } else {
      this.state = { ...this.state, ...updater };
    }
    if (this.state.workspaceItems) {
      this.syncBlockers();
    }
    this.notify();
  }

  // Actions
  setView(viewName) {
    this.updateState({ currentView: viewName });
  }

  toggleComplianceItem(itemId) {
    this.updateState(state => {
      const complianceChecklist = state.complianceChecklist.map(item => {
        if (item.id === itemId) {
          return { ...item, checked: !item.checked };
        }
        return item;
      });
      return { ...state, complianceChecklist };
    });
  }

  resolveBlockerLocal(blockerId) {
    this.updateState(state => {
      const workspaceItems = state.workspaceItems.map(item => {
        if (item.id === `item-${blockerId}` || item.id === blockerId) {
          return { ...item, status: 'Resolved' };
        }
        return item;
      });
      return { ...state, workspaceItems };
    });
  }

  async resolveBlocker(blockerId) {
    const numericId = parseInt(String(blockerId).replace('item-', '')) || blockerId;
    const ticketCode = `BLK-${numericId}`;

    try {
      const resp = await fetch('http://localhost:8080/api/v1/operations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_code: ticketCode })
      });
      if (resp.ok) {
        console.log(`[Telemetry Sync] Blocker ${ticketCode} resolved in Supabase DB.`);
        await this.loadDatabaseTelemetry();
      } else {
        const errData = await resp.json();
        console.error('[Telemetry Sync] Resolve blocker failed:', errData.error);
        this.resolveBlockerLocal(blockerId);
      }
    } catch (e) {
      console.warn('[Telemetry Sync] Backend unreachable, resolving locally.', e);
      this.resolveBlockerLocal(blockerId);
    }
  }

  resetBlockers() {
    this.updateState(state => {
      const workspaceItems = state.workspaceItems.map(item => {
        if (item.type === 'blocker') {
          return { ...item, status: 'Blocked' };
        }
        return item;
      });
      return { ...state, workspaceItems };
    });
  }

  addBlocker(title, severity, owner, details) {
    this.updateState(state => {
      const nextId = state.workspaceItems.reduce((max, b) => Math.max(max, parseInt(b.id.replace('item-', '')) || 0), 0) + 1;
      
      let workspace = 'executive';
      if (owner.includes('Infra')) workspace = 'infrastructure';
      else if (owner.includes('Legal') || owner.includes('HR')) workspace = 'legalhr';
      else if (owner.includes('UI') || owner.includes('UX')) workspace = 'uiux';
      else if (owner.includes('Engineering') || owner.includes('Dev')) workspace = 'engineering';
      else if (owner.includes('Finance')) workspace = 'finance';
      else if (owner.includes('Marketing')) workspace = 'marketing';

      const newBlocker = {
        id: `item-${nextId}`,
        type: 'blocker',
        title,
        severity,
        workspace,
        owner,
        status: 'Blocked',
        details: details || 'No additional blocker details provided.',
        createdAt: new Date().toISOString()
      };
      return {
        ...state,
        workspaceItems: [...state.workspaceItems, newBlocker]
      };
    });
  }

  addWorkspaceItem(item) {
    this.updateState(state => {
      const nextId = state.workspaceItems.reduce((max, b) => Math.max(max, parseInt(b.id.replace('item-', '')) || 0), 0) + 1;
      const newItem = {
        id: `item-${nextId}`,
        title: item.title,
        type: item.type,
        severity: item.severity,
        workspace: item.workspace,
        owner: item.owner,
        status: item.type === 'blocker' ? 'Blocked' : (item.status || 'Backlog'),
        details: item.details || 'No details provided.',
        targetWorkspace: item.targetWorkspace || null,
        createdAt: new Date().toISOString(),
        completedAt: null
      };
      return {
        ...state,
        workspaceItems: [...state.workspaceItems, newItem]
      };
    });
  }

  updateWorkspaceItemStatus(itemId, newStatus) {
    this.updateState(state => {
      const workspaceItems = state.workspaceItems.map(item => {
        if (item.id === itemId) {
          const updated = { ...item, status: newStatus };
          if (newStatus === 'Completed' || newStatus === 'Resolved') {
            updated.completedAt = new Date().toISOString();
          } else {
            updated.completedAt = null;
          }
          return updated;
        }
        return item;
      });
      return { ...state, workspaceItems };
    });
  }

  setUIUXDevice(device) {
    this.updateState(state => ({
      ...state,
      uiuxView: { ...state.uiuxView, activeDevice: device }
    }));
  }

  setUIUXTab(tab) {
    this.updateState(state => ({
      ...state,
      uiuxView: { ...state.uiuxView, activeTab: tab }
    }));
  }

  changeUIUXScale(change) {
    this.updateState(state => {
      let newScale = state.uiuxView.scale + change;
      if (newScale < 50) newScale = 50;
      if (newScale > 150) newScale = 150;
      return {
        ...state,
        uiuxView: { ...state.uiuxView, scale: newScale }
      };
    });
  }

  setUIUXPage(page) {
    this.updateState(state => ({
      ...state,
      uiuxView: { ...state.uiuxView, activePage: page }
    }));
  }

  pushAssetToCDNLocal(assetName) {
    this.updateState(state => {
      const assets = state.uiux.assets.map(asset => {
        if (asset.name === assetName) {
          return { ...asset, cdnStatus: 'Syncing...' };
        }
        return asset;
      });
      return {
        ...state,
        uiux: { ...state.uiux, assets }
      };
    });

    setTimeout(() => {
      this.updateState(state => {
        const assets = state.uiux.assets.map(asset => {
          if (asset.name === assetName) {
            return { ...asset, cdnStatus: 'Live' };
          }
          return asset;
        });
        return {
          ...state,
          uiux: { ...state.uiux, assets }
        };
      });
    }, 1500);
  }

  async pushAssetToCDN(assetName) {
    this.updateState(state => {
      const assets = state.uiux.assets.map(asset => {
        if (asset.name === assetName) {
          return { ...asset, cdnStatus: 'Syncing...' };
        }
        return asset;
      });
      return {
        ...state,
        uiux: { ...state.uiux, assets }
      };
    });

    try {
      const resp = await fetch('http://localhost:8080/api/v1/uiux/assets/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_name: assetName })
      });
      if (resp.ok) {
        this.updateState(state => {
          const assets = state.uiux.assets.map(asset => {
            if (asset.name === assetName) {
              return { ...asset, cdnStatus: 'Live' };
            }
            return asset;
          });
          return {
            ...state,
            uiux: { ...state.uiux, assets }
          };
        });
        console.log(`[Telemetry Sync] Asset ${assetName} pushed to CDN via backend.`);
      } else {
        this.pushAssetToCDNLocal(assetName);
      }
    } catch (e) {
      console.warn('[Telemetry Sync] Backend unreachable, pushing asset locally.', e);
      this.pushAssetToCDNLocal(assetName);
    }
  }

  updateUserProfile(userUpdates) {
    this.updateState(state => {
      const name = userUpdates.name || state.user.name;
      // Compute initials
      const nameParts = name.trim().split(/\s+/);
      let initials = '';
      if (nameParts.length > 0) {
        initials += nameParts[0].charAt(0).toUpperCase();
        if (nameParts.length > 1) {
          initials += nameParts[nameParts.length - 1].charAt(0).toUpperCase();
        }
      }
      if (!initials) initials = 'U';

      return {
        ...state,
        user: {
          ...state.user,
          ...userUpdates,
          avatarText: initials
        }
      };
    });
  }

  updateSettings(settingsUpdates) {
    this.updateState(state => ({
      ...state,
      settings: {
        ...state.settings,
        ...settingsUpdates
      }
    }));
  }

  resetSettings() {
    this.updateState(state => ({
      ...state,
      settings: {
        notificationAlerts: true,
        simulationSpeed: 'normal',
        complianceThreshold: 75,
        compactMode: false,
        sidebarCollapsed: false
      }
    }));
  }

  async fetchCredentials() {
    try {
      const resp = await fetch('http://localhost:8080/api/v1/credentials');
      if (resp.ok) {
        const creds = await resp.json();
        this.updateState(state => ({
          ...state,
          credentials: creds
        }));
      }
    } catch (e) {
      console.warn('[Credentials] Failed to fetch credentials:', e);
    }
  }

  async saveCredential(cred) {
    const resp = await fetch('http://localhost:8080/api/v1/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cred)
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Failed to save credential');
    }
    await this.fetchCredentials();
  }

  async deleteCredential(id) {
    const resp = await fetch(`http://localhost:8080/api/v1/credentials?id=${id}`, {
      method: 'DELETE'
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Failed to delete credential');
    }
    await this.fetchCredentials();
  }


  triggerPipelineRunLocal() {
    const stages = ['Build', 'Lint', 'Test', 'Deploy'];
    let stageIndex = 0;
    
    const interval = setInterval(() => {
      this.updateState(state => {
        let { logs, progress, stage, coverage } = state.pipeline;
        progress += 15;

        if (progress >= 100) {
          progress = 0;
          stageIndex++;
          
          if (stageIndex >= stages.length) {
            // Pipeline successfully completed
            clearInterval(interval);
            logs.push(`[Deploy] Syncing bundle structures to S3 CDN edge servers...`);
            logs.push(`[Deploy] Ingress router mapping updated. Live deployment completed!`);
            logs.push(`[System] Pipeline SUCCESS. Built and verified in 12s.`);
            
            // Randomly slightly shift code coverage on success (simulating new tests)
            const deltaCoverage = (Math.random() * 0.8 - 0.4);
            const newCoverage = Math.min(100, Math.max(50, parseFloat((coverage + deltaCoverage).toFixed(2))));
            
            return {
              ...state,
              pipeline: {
                ...state.pipeline,
                status: 'Success',
                stage: 'None',
                progress: 100,
                logs,
                coverage: newCoverage
              }
            };
          } else {
            stage = stages[stageIndex];
            logs.push(`[System] Stage ${stages[stageIndex - 1]} success. Transitioning to ${stage}...`);
            if (stage === 'Lint') {
              logs.push(`[Lint] Running ESLint configurations over 412 script modules...`);
              logs.push(`[Lint] 0 errors, 4 warnings identified. Style checks passed.`);
            } else if (stage === 'Test') {
              logs.push(`[Test] Running Jest test suites. Found 1,294 matching test cases...`);
              logs.push(`[Test] Completed E2E verification matrix on Chromium headless.`);
            } else if (stage === 'Deploy') {
              logs.push(`[Deploy] Bundling production build files. Size: 1.48 MB.`);
            }
          }
        }

        return {
          ...state,
          pipeline: {
            ...state.pipeline,
            stage,
            progress,
            logs: [...logs]
          }
        };
      });
    }, 1500);
  }

  async triggerPipelineRun() {
    if (this.state.pipeline.status === 'Running') return;

    const subsystemId = 3; // Engineering Core subsystem ID

    this.updateState(state => ({
      ...state,
      pipeline: {
        ...state.pipeline,
        status: 'Running',
        stage: 'Build',
        progress: 10,
        rcaMessage: '',
        logs: [
          `[System] Initializing PMAS pipeline run #${state.pipeline.buildCount + 1}...`,
          `[System] Querying Supabase database for active compilation barriers...`,
          `[System] Pinging compiler cluster gates...`
        ],
        buildCount: state.pipeline.buildCount + 1
      }
    }));

    try {
      const resp = await fetch('http://localhost:8080/api/v1/engineering/pipeline/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subsystem_id: subsystemId })
      });
      
      const data = await resp.json();
      
      if (resp.status === 400 && data.rca) {
        setTimeout(() => {
          this.updateState(state => {
            const rca = data.rca;
            const logMsg = [
              ...state.pipeline.logs,
              `[Compiler Error] Halting compilation: Active blocker ${rca.blocker_ticket} (${rca.summary}) blocks pipeline.`,
              `[AI RCA Log] Root Cause: ${rca.root_cause}`,
              `[AI RCA Log] Remediation: ${rca.remediation}`,
              `[System] Compilation FAILED. Build halted.`
            ];
            const rcaMsg = `Compilation halted due to unresolved blocker (${rca.blocker_ticket} - ${rca.summary}). Root Cause: ${rca.root_cause}. Remediation: ${rca.remediation}`;
            
            return {
              ...state,
              pipeline: {
                ...state.pipeline,
                status: 'Failed',
                stage: 'None',
                progress: 0,
                logs: logMsg,
                rcaMessage: rcaMsg
              }
            };
          });
        }, 1200);
      } else if (resp.ok) {
        setTimeout(() => {
          this.updateState(state => {
            const logs = [...state.pipeline.logs, `[System] Compilation checks passed. Starting bundle assembly...`];
            return {
              ...state,
              pipeline: { ...state.pipeline, logs }
            };
          });
          
          this.triggerPipelineRunAnimation();
        }, 1000);
      } else {
        this.triggerPipelineRunLocal();
      }
    } catch (e) {
      console.warn('[Telemetry Sync] Backend unreachable, triggering local simulation.', e);
      this.triggerPipelineRunLocal();
    }
  }

  triggerPipelineRunAnimation() {
    const stages = ['Build', 'Lint', 'Test', 'Deploy'];
    let stageIndex = 0;
    const interval = setInterval(() => {
      this.updateState(state => {
        let { logs, progress, stage, coverage } = state.pipeline;
        progress += 20;

        if (progress >= 100) {
          progress = 0;
          stageIndex++;
          
          if (stageIndex >= stages.length) {
            clearInterval(interval);
            logs.push(`[Deploy] Syncing bundle structures to S3 CDN edge servers...`);
            logs.push(`[Deploy] Ingress router mapping updated. Live deployment completed!`);
            logs.push(`[System] Pipeline SUCCESS. Built and verified in 12s.`);
            
            const deltaCoverage = (Math.random() * 0.8 - 0.4);
            const newCoverage = Math.min(100, Math.max(50, parseFloat((coverage + deltaCoverage).toFixed(2))));
            
            return {
              ...state,
              pipeline: {
                ...state.pipeline,
                status: 'Success',
                stage: 'None',
                progress: 100,
                logs,
                coverage: newCoverage
              }
            };
          } else {
            stage = stages[stageIndex];
            logs.push(`[System] Stage ${stages[stageIndex - 1]} success. Transitioning to ${stage}...`);
            if (stage === 'Lint') {
              logs.push(`[Lint] Running ESLint configurations over 412 script modules...`);
              logs.push(`[Lint] 0 errors, 4 warnings identified. Style checks passed.`);
            } else if (stage === 'Test') {
              logs.push(`[Test] Running Jest test suites. Found 1,294 matching test cases...`);
              logs.push(`[Test] Completed E2E verification matrix on Chromium headless.`);
            } else if (stage === 'Deploy') {
              logs.push(`[Deploy] Bundling production build files. Size: 1.48 MB.`);
            }
          }
        }

        return {
          ...state,
          pipeline: {
            ...state.pipeline,
            stage,
            progress,
            logs: [...logs]
          }
        };
      });
    }, 1200);
  }

  // Get dynamic compliance rating (percent) based on checklist items checked
  getCompliancePercent() {
    const checked = this.state.complianceChecklist.filter(c => c.checked).length;
    const total = this.state.complianceChecklist.length;
    return Math.round((checked / total) * 100);
  }

  // Telemetry simulations
  startTelemetrySimulators() {
    let tickCount = 0;
    // 1. Simulate minor CPU / Memory fluctuations for active clusters
    setInterval(() => {
      const speed = this.state.settings?.simulationSpeed || 'normal';
      if (speed === 'paused') return;

      tickCount++;
      const threshold = speed === 'fast' ? 1 : speed === 'slow' ? 8 : 4;
      if (tickCount % threshold !== 0) return;

      this.updateState(state => {
        const clusterNodes = state.clusterNodes.map(node => {
          const cpuDelta = Math.floor(Math.random() * 9) - 4; // -4 to +4
          const ramDelta = Math.floor(Math.random() * 5) - 2; // -2 to +2
          
          let cpu = node.cpu + cpuDelta;
          let ram = node.ram + ramDelta;
          
          if (cpu < 5) cpu = 5;
          if (cpu > 98) cpu = 98;
          if (ram < 10) ram = 10;
          if (ram > 98) ram = 98;
          
          return { ...node, cpu, ram };
        });

        // 2. Fluctuations in gateway slot memory
        const techStack = state.techStack.map(service => {
          if (service.name === 'Docker Gateway Slots') {
            const memoryVal = parseFloat(service.memory);
            const delta = (Math.random() * 0.1 - 0.05); // -0.05 to +0.05
            const newMem = Math.max(0.5, memoryVal + delta).toFixed(2);
            return { ...service, memory: `${newMem}GB` };
          }
          if (service.name === 'React SPA Client') {
            const memoryVal = parseInt(service.memory);
            const delta = Math.floor(Math.random() * 3) - 1; // -1 to +1
            const newMem = Math.max(20, memoryVal + delta);
            return { ...service, memory: `${newMem}MB` };
          }
          return service;
        });

        // 3. Fluctuations in design system alignment percentage
        const currentAlignment = state.uiuxView.designSystemAlignment || 94.6;
        const alignmentDelta = (Math.random() * 0.1 - 0.05); // -0.05% to +0.05%
        let designSystemAlignment = Math.min(100, Math.max(90, currentAlignment + alignmentDelta));
        designSystemAlignment = parseFloat(designSystemAlignment.toFixed(2));

        return {
          ...state,
          clusterNodes,
          techStack,
          uiuxView: {
            ...state.uiuxView,
            designSystemAlignment
          }
        };
      });
    }, 1000);
  }
}

export const store = new StateManager();
window.__pmasStore = store; // Expose globally for testing/debugging
