/**
 * K6 Load Test za FinMate aplikaciju
 * 
 * Instalacija: https://k6.io/docs/get-started/installation/
 * Pokretanje: k6 run load-tests/k6-stress-test.js
 * 
 * Za testiranje s različitim brojem korisnika:
 * k6 run --vus 50 --duration 1m load-tests/k6-stress-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const expensesFetchTrend = new Trend('expenses_fetch_duration');
const profileFetchTrend = new Trend('profile_fetch_duration');

// Configuration
const SUPABASE_URL = 'https://fzalxjretvtvokiotvkf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6YWx4anJldHZ0dm9raW90dmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjczNDMsImV4cCI6MjA4NDYwMzM0M30.NKPTQ5hJnMt7M17NUPLNU07CQ3EFZZpOrE2ZQvuEtTw';

// Test scenarios
export const options = {
  scenarios: {
    // Scenario 1: Smoke test - basic functionality
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      startTime: '0s',
      tags: { scenario: 'smoke' },
    },
    // Scenario 2: Load test - normal load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 25 },   // Ramp up to 25 users
        { duration: '2m', target: 25 },   // Stay at 25 users
        { duration: '30s', target: 0 },   // Ramp down
      ],
      startTime: '35s',
      tags: { scenario: 'load' },
    },
    // Scenario 3: Stress test - high load
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },   // Ramp up to 50 users
        { duration: '2m', target: 100 },  // Increase to 100 users
        { duration: '1m', target: 100 },  // Hold at 100 users
        { duration: '1m', target: 0 },    // Ramp down
      ],
      startTime: '4m30s',
      tags: { scenario: 'stress' },
    },
    // Scenario 4: Spike test - sudden traffic spike
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 10 },  // Normal load
        { duration: '10s', target: 150 }, // Spike to 150 users
        { duration: '30s', target: 150 }, // Stay at spike
        { duration: '10s', target: 10 },  // Back to normal
        { duration: '10s', target: 0 },   // Ramp down
      ],
      startTime: '10m',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be < 2s
    http_req_failed: ['rate<0.05'],    // Less than 5% errors
    errors: ['rate<0.1'],              // Custom error rate < 10%
  },
};

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

// Helper function for API calls
function supabaseGet(endpoint, customHeaders = {}) {
  return http.get(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: { ...headers, ...customHeaders },
  });
}

function supabasePost(endpoint, body, customHeaders = {}) {
  return http.post(`${SUPABASE_URL}/rest/v1/${endpoint}`, JSON.stringify(body), {
    headers: { ...headers, ...customHeaders, 'Prefer': 'return=representation' },
  });
}

// Main test function
export default function () {
  // Test 1: Fetch expenses (public read - will return empty due to RLS)
  group('API - Expenses', () => {
    const expensesRes = supabaseGet('expenses?select=id,amount,category,description&limit=20');
    
    const expensesCheck = check(expensesRes, {
      'expenses: status is 200': (r) => r.status === 200,
      'expenses: response time < 1000ms': (r) => r.timings.duration < 1000,
      'expenses: is JSON array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body);
        } catch {
          return false;
        }
      },
    });
    
    errorRate.add(!expensesCheck);
    expensesFetchTrend.add(expensesRes.timings.duration);
  });

  sleep(0.5);

  // Test 2: Fetch profiles
  group('API - Profiles', () => {
    const profilesRes = supabaseGet('profiles?select=id,display_name&limit=10');
    
    const profilesCheck = check(profilesRes, {
      'profiles: status is 200': (r) => r.status === 200,
      'profiles: response time < 800ms': (r) => r.timings.duration < 800,
    });
    
    errorRate.add(!profilesCheck);
    profileFetchTrend.add(profilesRes.timings.duration);
  });

  sleep(0.5);

  // Test 3: Fetch custom categories
  group('API - Custom Categories', () => {
    const categoriesRes = supabaseGet('custom_categories?select=id,name,icon,color&limit=20');
    
    check(categoriesRes, {
      'categories: status is 200': (r) => r.status === 200,
      'categories: response time < 600ms': (r) => r.timings.duration < 600,
    });
  });

  sleep(0.5);

  // Test 4: Fetch payment sources
  group('API - Payment Sources', () => {
    const sourcesRes = supabaseGet('custom_payment_sources?select=id,name,balance&limit=20');
    
    check(sourcesRes, {
      'payment sources: status is 200': (r) => r.status === 200,
      'payment sources: response time < 600ms': (r) => r.timings.duration < 600,
    });
  });

  sleep(0.5);

  // Test 5: Fetch projects
  group('API - Projects', () => {
    const projectsRes = supabaseGet('projects?select=id,name,status,total_budget&limit=10');
    
    check(projectsRes, {
      'projects: status is 200': (r) => r.status === 200,
      'projects: response time < 700ms': (r) => r.timings.duration < 700,
    });
  });

  sleep(0.5);

  // Test 6: Fetch budgets
  group('API - Budget Plans', () => {
    const budgetsRes = supabaseGet('budget_plans?select=id,name,total_amount,period_type&limit=10');
    
    check(budgetsRes, {
      'budgets: status is 200': (r) => r.status === 200,
      'budgets: response time < 700ms': (r) => r.timings.duration < 700,
    });
  });

  sleep(0.5);

  // Test 7: Fetch installment plans
  group('API - Installments', () => {
    const installmentsRes = supabaseGet('installment_plans?select=id,description,total_amount&limit=10');
    
    check(installmentsRes, {
      'installments: status is 200': (r) => r.status === 200,
      'installments: response time < 600ms': (r) => r.timings.duration < 600,
    });
  });

  sleep(1);

  // Test 8: Simulate complex query (join-like)
  group('API - Complex Query', () => {
    const complexRes = supabaseGet(
      'expenses?select=id,amount,category,description,project_id,projects(name)&limit=10'
    );
    
    check(complexRes, {
      'complex query: status is 200': (r) => r.status === 200,
      'complex query: response time < 1500ms': (r) => r.timings.duration < 1500,
    });
  });

  sleep(0.5);
}

// Lifecycle hooks
export function setup() {
  console.log('🚀 Starting load test for FinMate application');
  console.log(`📍 Target: ${SUPABASE_URL}`);
  console.log('⚠️  Note: RLS policies will return empty arrays for unauthenticated requests');
  
  // Verify connectivity
  const healthCheck = http.get(`${SUPABASE_URL}/rest/v1/`, { headers });
  if (healthCheck.status !== 200) {
    console.error('❌ Cannot connect to Supabase API');
  } else {
    console.log('✅ Supabase API is reachable');
  }
}

export function teardown(data) {
  console.log('🏁 Load test completed');
  console.log('📊 Check the results above for detailed metrics');
}
