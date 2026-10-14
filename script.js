/**
 * Synapse AI — Interactive Behavior
 * Handles: Pricing Toggle, Dynamic Use-Case Tabs, Terminal Stream, Mobile Menu
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Pricing Toggle (Monthly vs Annual)
  const billingToggle = document.getElementById('billingToggle');
  const monthlyLabel = document.getElementById('monthlyLabel');
  const annualLabel = document.getElementById('annualLabel');
  const priceAmounts = document.querySelectorAll('.card-price .amount[data-monthly]');
  let isAnnual = true;

  function updatePricing() {
    if (isAnnual) {
      billingToggle.classList.remove('monthly');
      annualLabel.classList.add('active');
      monthlyLabel.classList.remove('active');
      priceAmounts.forEach(el => {
        el.textContent = el.getAttribute('data-annual');
      });
    } else {
      billingToggle.classList.add('monthly');
      monthlyLabel.classList.add('active');
      annualLabel.classList.remove('active');
      priceAmounts.forEach(el => {
        el.textContent = el.getAttribute('data-monthly');
      });
    }
  }

  if (billingToggle) {
    billingToggle.addEventListener('click', () => {
      isAnnual = !isAnnual;
      updatePricing();
    });

    monthlyLabel.addEventListener('click', () => {
      isAnnual = false;
      updatePricing();
    });

    annualLabel.addEventListener('click', () => {
      isAnnual = true;
      updatePricing();
    });
  }

  // 2. Interactive Use-Case Tabs
  const useCaseData = {
    infra: {
      title: "Autonomous Zero-Downtime Infrastructure Migrations",
      desc: "Orchestrate multi-region database sharding, container rollouts, and cluster autoscaling without human intervention.",
      bullets: [
        "Automatic rollback generation prior to code execution",
        "Drift detection with real-time state synchronization",
        "Native Terraform, Kubernetes, and Cloud Run support"
      ],
      statNum: "94%",
      statLbl: "Reduction in manual DevOps incident hours",
      code: `<span class="tok-k">directive</span>: "migrate-us-east-1"
<span class="tok-p">pre_flight</span>:
  - verify_canary_health(threshold=0.999)
  - snapshot_storage_pool(region="us-east")
<span class="tok-k">execute</span>:
  - promote_replica(node="db-pri-02")
  - rebalance_dns(traffic_split=[0.9, 0.1])
<span class="tok-s">fallback</span>: instant_traffic_rewind()`
    },
    data: {
      title: "Continuous Autonomous Data Pipeline Optimization",
      desc: "Automatically detect slow BigQuery transformations, rewrite queries using vectorized aggregations, and optimize partition pruning.",
      bullets: [
        "Zero-copy lineage analysis across petabyte datasets",
        "Automatic schema evolution without breaking downstream BI",
        "Self-healing dbt and Dataform model compilations"
      ],
      statNum: "72%",
      statLbl: "Average query compute cost reduction",
      code: `<span class="tok-k">directive</span>: "optimize-bi-transforms"
<span class="tok-p">telemetry</span>:
  - inspect_query_cache(target="daily_sales")
  - detect_partition_skew(threshold=0.25)
<span class="tok-k">execute</span>:
  - rewrite_clustering_keys(cluster=["org_id", "date"])
  - materialize_incremental_view()
<span class="tok-s">verify</span>: benchmark_speedup() // 4.1x faster`
    },
    security: {
      title: "Continuous Red-Team Hardening & Secrets Hygiene",
      desc: "Simulate zero-day lateral movement, verify least-privilege IAM policies, and automatically revoke leaked ephemeral tokens.",
      bullets: [
        "Real-time graph analysis of cloud IAM relationships",
        "Air-gapped secret injection via Hardware Security Modules",
        "Automated SOC2 and ISO-27001 evidence generation"
      ],
      statNum: "0",
      statLbl: "Data ingress or training leakage incidents",
      code: `<span class="tok-k">directive</span>: "audit-iam-perimeter"
<span class="tok-p">monitor</span>:
  - scan_active_service_accounts()
  - flag_wildcard_permissions()
<span class="tok-k">execute</span>:
  - enforce_least_privilege(actor="ci-runner")
  - rotate_ephemeral_oidc_tokens()
<span class="tok-s">attestation</span>: sign_audit_hash(vault="hsm-01")`
    },
    growth: {
      title: "Self-Optimizing Full-Funnel Conversion Intelligence",
      desc: "Autonomously test visual variants, personalize copy for high-intent accounts, and optimize pricing elasticity.",
      bullets: [
        "Multi-armed bandit optimization without layout shifts",
        "Semantic cohort clustering across CRM and billing events",
        "Automated retention cohort forecasting"
      ],
      statNum: "3.4x",
      statLbl: "Increase in enterprise trial-to-paid velocity",
      code: `<span class="tok-k">directive</span>: "funnel-conversion-boost"
<span class="tok-p">observe</span>:
  - track_activation_milestone(time_to_first_agent)
  - cluster_dropoff_intent()
<span class="tok-k">execute</span>:
  - dispatch_personalized_interactive_sandbox()
  - trigger_adaptive_slack_notification()
<span class="tok-s">outcome</span>: p95_activation_time = 3.2m`
    }
  };

  const tabButtons = document.querySelectorAll('.tab-btn');
  const panel = document.getElementById('infra');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabKey = btn.getAttribute('data-tab');
      const data = useCaseData[tabKey];

      if (data && panel) {
        panel.innerHTML = `
          <div class="panel-info">
            <h3>${data.title}</h3>
            <p>${data.desc}</p>
            <ul class="feature-bullets">
              ${data.bullets.map(b => `<li>&checkmark; ${b}</li>`).join('')}
            </ul>
            <div class="panel-stat">
              <span class="stat-number">${data.statNum}</span>
              <span class="stat-label">${data.statLbl}</span>
            </div>
          </div>
          <div class="panel-code">
            <pre><code>${data.code}</code></pre>
          </div>
        `;
      }
    });
  });

  // 3. Navbar Blur & Elevation on Scroll
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.style.boxShadow = '0 8px 24px rgba(43, 43, 43, 0.06)';
      navbar.style.borderBottomColor = 'rgba(108, 92, 231, 0.15)';
    } else {
      navbar.style.boxShadow = 'none';
      navbar.style.borderBottomColor = 'rgba(43, 43, 43, 0.08)';
    }
  });

  // 4. Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');
  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      const isVisible = navLinks.style.display === 'flex';
      navLinks.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        navLinks.style.flexDirection = 'column';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '100%';
        navLinks.style.left = '0';
        navLinks.style.width = '100%';
        navLinks.style.background = '#FFFFFF';
        navLinks.style.padding = '24px';
        navLinks.style.boxShadow = '0 16px 32px rgba(0,0,0,0.1)';
      }
    });
  }
});
