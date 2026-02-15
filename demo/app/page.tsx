'use client';

import { useEffect, useState } from 'react';

interface Stats {
  signals: number;
  relationships: number;
  consolidations: number;
  daysCovered: number;
  discoveryRate: number;
  status: string;
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        setStats(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50">
      <div className="max-w-7xl mx-auto px-8 py-24">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 bg-clip-text text-transparent mb-4">
            NexusBrain
          </h1>
          <p className="text-2xl font-semibold text-gray-700 mb-2">
            A True Long-Term Memory OS for AI Agents
          </p>
          <p className="text-lg text-gray-600 mb-8">
            Memory Genesis Competition 2026
          </p>

          {stats?.status === 'generating' && (
            <div className="inline-flex items-center px-4 py-2 bg-yellow-100 border border-yellow-300 rounded-lg">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-3"></div>
              <span className="text-yellow-800 font-medium">Generating demo data... {stats.signals} signals so far</span>
            </div>
          )}

          {stats?.status === 'active' && (
            <div className="inline-flex items-center px-4 py-2 bg-green-100 border border-green-300 rounded-lg">
              <div className="h-2 w-2 rounded-full bg-green-600 mr-3 animate-pulse"></div>
              <span className="text-green-800 font-medium">Live demo active • {stats.relationships} patterns discovered</span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <StatCard
              title="Signals Processed"
              value={stats.signals.toLocaleString()}
              subtitle="Cross-domain events"
              color="purple"
            />
            <StatCard
              title="Causal Relationships"
              value={stats.relationships.toLocaleString()}
              subtitle="Discovered patterns"
              color="blue"
              highlight={stats.relationships > 0}
            />
            <StatCard
              title="Memory Consolidations"
              value={stats.consolidations.toLocaleString()}
              subtitle="Brain sleep cycles"
              color="cyan"
            />
            <StatCard
              title="Discovery Rate"
              value={`${stats.discoveryRate}%`}
              subtitle={`${stats.daysCovered} days of data`}
              color="indigo"
            />
          </div>
        )}

        {loading && !stats && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading demo statistics...</p>
          </div>
        )}

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <FeatureCard
            icon="🧠"
            title="Brain-Inspired Consolidation"
            description="Mimics hippocampal sleep cycles to consolidate memories from short-term to long-term storage"
          />
          <FeatureCard
            icon="🔍"
            title="3-Paradigm Causal Discovery"
            description="Combines Granger Causality, PC Algorithm, and Transfer Entropy for robust causal inference"
          />
          <FeatureCard
            icon="🌐"
            title="Federated Architecture"
            description="Org-level brains federate insights to a core brain, enabling cross-organization learning"
          />
          <FeatureCard
            icon="📈"
            title="Self-Improving Memory"
            description="Bayesian reinforcement from prediction outcomes strengthens accurate causal relationships"
          />
        </div>

        {/* Expected Patterns */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-16">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            🎯 Expected Causal Patterns (Embedded in Data)
          </h2>
          <div className="space-y-3">
            <PatternItem pattern="GitHub commits → Deployments" lag="1 day CI/CD lag" />
            <PatternItem pattern="Deployments → Bugs discovered" lag="2 day testing lag" />
            <PatternItem pattern="Bugs → Support ticket spikes" lag="1 day customer impact" />
            <PatternItem pattern="Bugs → Slack escalations" lag="2 day urgency lag" />
            <PatternItem pattern="Deployments → Incidents" lag="Immediate (same day)" />
            <PatternItem pattern="Incidents → Slack activity" lag="Immediate response" />
            <PatternItem pattern="High support load → Customer churn" lag="5-7 day frustration" />
            <PatternItem pattern="High velocity → New customers" lag="10 day word-of-mouth" />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <a
            href="/graph"
            className="inline-block px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            View Interactive Causal Graph →
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, color, highlight }: any) {
  const colorClasses = {
    purple: 'from-purple-500 to-purple-600',
    blue: 'from-blue-500 to-blue-600',
    cyan: 'from-cyan-500 to-cyan-600',
    indigo: 'from-indigo-500 to-indigo-600',
  };

  return (
    <div className={`bg-white rounded-2xl shadow-lg p-6 ${highlight ? 'ring-2 ring-green-400 ring-offset-2' : ''}`}>
      <div className={`text-4xl font-bold bg-gradient-to-r ${colorClasses[color as keyof typeof colorClasses]} bg-clip-text text-transparent mb-2`}>
        {value}
      </div>
      <div className="text-sm font-semibold text-gray-700 mb-1">{title}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function PatternItem({ pattern, lag }: any) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <span className="text-gray-700 font-medium">{pattern}</span>
      <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full">{lag}</span>
    </div>
  );
}
