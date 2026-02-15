export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-8 py-24">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center">
              <span className="text-white text-4xl">🧠</span>
            </div>
            <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 bg-clip-text text-transparent">
              NexusBrain
            </h1>
          </div>
          <p className="text-2xl font-semibold text-gray-700 mb-4">
            A True Long-Term Memory OS for AI Agents
          </p>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Brain-inspired memory consolidation with 90+ days of persistent causal knowledge.
            Memory Genesis Competition 2026.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-6 mb-16">
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <div className="text-4xl mb-2">📊</div>
            <div className="text-3xl font-bold text-gray-900">50K+</div>
            <div className="text-sm text-gray-600">Signals</div>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <div className="text-4xl mb-2">🔗</div>
            <div className="text-3xl font-bold text-gray-900">25+</div>
            <div className="text-sm text-gray-600">Causal Edges</div>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <div className="text-4xl mb-2">🌙</div>
            <div className="text-3xl font-bold text-gray-900">13</div>
            <div className="text-sm text-gray-600">Consolidations</div>
          </div>
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <div className="text-4xl mb-2">🎯</div>
            <div className="text-3xl font-bold text-gray-900">75%</div>
            <div className="text-sm text-gray-600">Discovery Rate</div>
          </div>
        </div>

        {/* Coming Soon Message */}
        <div className="bg-white rounded-2xl p-12 shadow-2xl text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            🚧 Demo Under Construction
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            The interactive demo is being built right now. Check back soon!
          </p>
          <div className="text-left max-w-2xl mx-auto">
            <h3 className="font-semibold text-gray-900 mb-4">What's Coming:</h3>
            <ul className="space-y-2 text-gray-600">
              <li>✅ Realistic 90-day dataset (Slack, Jira, GitHub, Business)</li>
              <li>✅ Causal discovery with 3-paradigm ensemble</li>
              <li>⏳ Interactive causal graph visualization</li>
              <li>⏳ Natural language query interface</li>
              <li>⏳ Consolidation timeline viewer</li>
              <li>⏳ Benchmark results (CauseMe, CausalRivers)</li>
            </ul>
          </div>
          <div className="mt-8 text-sm text-gray-500">
            <p>Status: Data generation in progress</p>
            <p>Expected completion: February 20, 2026</p>
          </div>
        </div>
      </div>
    </div>
  );
}
